import Dexie, { type Table } from 'dexie';
import type {
  AnonymousQuestion,
  AnonymousReply,
  AppSetting,
  DistributionRecord,
  DrawVersion,
  EventRules,
  ExchangeEvent,
  ExchangeSeries,
  HistoricalAssignment,
  HistoryEntry,
  Household,
  ID,
  Participant,
  ParticipantRelationship,
  ParticipantWishlist,
  ThemeId,
} from '../types/models';
import { CURRENT_SCHEMA_VERSION } from '../types/models';
import { newId, nowIso } from '../utils/id';
import { canonicalJson } from '../utils/canonicalJson';
import { DEFAULT_RELATIONSHIP_POLICIES } from './relationshipRules';
import { computeIntegrity } from './drawIntegrity';
import { generateRelayKeyPair } from './cryptography';
import { isFrozen, nextVersionNumber } from './drawVersions';
import { fillCodenames } from './codenames';

/**
 * Organiser workspace persistence (IndexedDB via Dexie).
 *
 * Data never leaves the browser unless the organiser exports a backup. It does not sync between
 * devices. Dexie schema versions are append-only: future releases add `this.version(n)` blocks with
 * upgrade functions, so existing history and confirmed draws are migrated, never discarded.
 */
export class SantaDB extends Dexie {
  series!: Table<ExchangeSeries, string>;
  events!: Table<ExchangeEvent, string>;
  participants!: Table<Participant, string>;
  relationships!: Table<ParticipantRelationship, string>;
  households!: Table<Household, string>;
  history!: Table<HistoricalAssignment, string>;
  draws!: Table<DrawVersion, string>;
  wishlists!: Table<ParticipantWishlist, string>;
  questions!: Table<AnonymousQuestion, string>;
  replies!: Table<AnonymousReply, string>;
  settings!: Table<AppSetting, string>;

  constructor(name = 'secret-santa-workspace') {
    super(name);
    this.version(1).stores({
      series: 'id, name',
      events: 'id, seriesId, year, status',
      participants: 'id, displayName, active',
      relationships: 'id, participantA, participantB, type',
      households: 'id, name',
      history: 'id, seriesId, year, giverId, recipientId',
      draws: 'id, eventId, version, status',
      wishlists: 'id, eventId, participantId',
      questions: 'id, eventId, drawId, giverId',
      replies: 'id, questionId',
      settings: 'key',
    });
  }
}

export let db = new SantaDB();

/** Test hook: point the repository at a fresh database. */
export function useDatabase(instance: SantaDB) {
  db = instance;
}

export const ALL_TABLES = ['series', 'events', 'participants', 'relationships', 'households', 'history', 'draws', 'wishlists', 'questions', 'replies', 'settings'] as const;

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Series & events
// ---------------------------------------------------------------------------

export async function createSeries(name: string, description?: string): Promise<ExchangeSeries> {
  const series: ExchangeSeries = { schemaVersion: CURRENT_SCHEMA_VERSION, id: newId('se'), name: name.trim(), description, createdAt: nowIso() };
  await db.series.add(series);
  return series;
}

export async function updateSeries(id: ID, patch: Partial<ExchangeSeries>) {
  await db.series.update(id, patch);
}

export function defaultRules(seriesId: ID): EventRules {
  return {
    forced: [],
    forbidden: [],
    preventReciprocal: false,
    relationshipPolicies: { ...DEFAULT_RELATIONSHIP_POLICIES },
    relationshipOverrides: {},
    householdExclusion: true,
    householdOverrides: {},
    history: {
      mode: 'last-1',
      strength: 'hard',
      sourceSeriesIds: [seriesId],
      recencyDecay: 0.6,
      frequencyWeight: 0.5,
      discourageReverse: false,
    },
  };
}

export interface NewEventFields {
  seriesId: ID;
  name: string;
  year: number;
  exchangeDate?: string;
  budget?: number;
  currency?: string;
  description?: string;
  organiserNotes?: string;
  theme?: ThemeId;
  greeting?: string;
  location?: string;
  instructions?: string;
  participantIds?: ID[];
  rules?: EventRules;
}

export async function createEvent(fields: NewEventFields): Promise<ExchangeEvent> {
  const event: ExchangeEvent = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('ev'),
    seriesId: fields.seriesId,
    name: fields.name.trim(),
    year: fields.year,
    exchangeDate: fields.exchangeDate,
    budget: fields.budget,
    currency: fields.currency ?? 'AUD',
    description: fields.description,
    organiserNotes: fields.organiserNotes,
    theme: fields.theme ?? 'classic',
    greeting: fields.greeting,
    location: fields.location,
    instructions: fields.instructions,
    participantIds: fields.participantIds ?? [],
    status: 'draft',
    rules: fields.rules ?? defaultRules(fields.seriesId),
    codenamesEnabled: true,
    codenames: {},
    concealAssignments: true,
    includeWishlists: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.events.add(event);
  return event;
}

export async function updateEvent(id: ID, patch: Partial<ExchangeEvent>): Promise<void> {
  const { id: _ignored, ...rest } = patch;
  void _ignored;
  await db.events.update(id, { ...rest, updatedAt: nowIso() });
}

export async function updateRules(id: ID, mutate: (rules: EventRules) => EventRules): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    const ev = await db.events.get(id);
    if (!ev) throw new Error('Event not found');
    await db.events.update(id, { rules: mutate(structuredClone(ev.rules)), updatedAt: nowIso() });
  });
}

/** "Create next year's exchange": reuse series, people, rules, theme and budget — never assignments. */
export async function createNextYearEvent(eventId: ID): Promise<ExchangeEvent> {
  const prev = await db.events.get(eventId);
  if (!prev) throw new Error('Event not found');
  const participants = await db.participants.bulkGet(prev.participantIds);
  const activeIds = participants.filter((p): p is Participant => Boolean(p?.active)).map((p) => p.id);
  const rules = structuredClone(prev.rules);
  // Ensure the series itself contributes history next year.
  if (!rules.history.sourceSeriesIds.includes(prev.seriesId)) rules.history.sourceSeriesIds.push(prev.seriesId);
  const nextYear = prev.year + 1;
  const name = prev.name.includes(String(prev.year)) ? prev.name.replace(String(prev.year), String(nextYear)) : prev.name;
  const ev = await createEvent({
    seriesId: prev.seriesId,
    name,
    year: nextYear,
    budget: prev.budget,
    currency: prev.currency,
    description: prev.description,
    theme: prev.theme,
    greeting: prev.greeting,
    location: prev.location,
    instructions: prev.instructions,
    participantIds: activeIds,
    rules,
  });
  await updateEvent(ev.id, { codenamesEnabled: prev.codenamesEnabled, includeWishlists: prev.includeWishlists, invitationTemplate: prev.invitationTemplate });
  return (await db.events.get(ev.id))!;
}

export async function archiveEvent(id: ID, archived: boolean): Promise<void> {
  await db.transaction('rw', db.events, db.draws, async () => {
    const ev = await db.events.get(id);
    if (!ev) return;
    const active = ev.activeDrawId ? await db.draws.get(ev.activeDrawId) : undefined;
    if (archived) {
      if (active && (active.status === 'active' || active.status === 'confirmed')) {
        await db.draws.update(active.id, { status: 'archived' });
      }
      await db.events.update(id, { status: 'archived', updatedAt: nowIso() });
    } else {
      let status: ExchangeEvent['status'] = 'draft';
      if (active) {
        const hasLinks = Object.values(active.distribution).some((d) => d.link);
        await db.draws.update(active.id, { status: hasLinks ? 'active' : 'confirmed' });
        status = hasLinks ? 'links-ready' : 'draw-confirmed';
      } else if (ev.draftDrawId) status = 'draw-generated';
      await db.events.update(id, { status, updatedAt: nowIso() });
    }
  });
}

/**
 * Delete an event. When `keepHistory` is true (recommended) the confirmed assignments are first
 * copied into manual history records so future repeat-prevention still sees them.
 */
export async function deleteEvent(id: ID, keepHistory: boolean): Promise<void> {
  await db.transaction('rw', [db.events, db.draws, db.history, db.wishlists, db.questions, db.replies], async () => {
    const ev = await db.events.get(id);
    if (!ev) return;
    if (keepHistory && ev.activeDrawId) {
      const draw = await db.draws.get(ev.activeDrawId);
      if (draw) {
        const records: HistoricalAssignment[] = draw.snapshot.assignments.map((a) => ({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          id: newId('hi'),
          seriesId: ev.seriesId,
          year: ev.year,
          giverId: a.giverId,
          recipientId: a.recipientId,
          source: 'manual',
          note: `Kept from deleted event "${ev.name}"`,
          createdAt: nowIso(),
        }));
        await db.history.bulkAdd(records);
      }
    }
    const questionIds = (await db.questions.where('eventId').equals(id).toArray()).map((q) => q.id);
    await db.replies.where('questionId').anyOf(questionIds).delete();
    await db.questions.where('eventId').equals(id).delete();
    await db.wishlists.where('eventId').equals(id).delete();
    await db.draws.where('eventId').equals(id).delete();
    await db.events.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Participants, relationships, households
// ---------------------------------------------------------------------------

export async function createParticipant(fields: Partial<Participant> & { displayName: string }): Promise<Participant> {
  const p: Participant = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('p'),
    displayName: fields.displayName.trim(),
    nickname: fields.nickname?.trim() || undefined,
    notes: fields.notes?.trim() || undefined,
    disambiguator: fields.disambiguator?.trim() || undefined,
    active: fields.active ?? true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.participants.add(p);
  return p;
}

export async function updateParticipant(id: ID, patch: Partial<Participant>) {
  await db.participants.update(id, { ...patch, updatedAt: nowIso() });
}

/** Is this participant referenced by history or any draw? If so they can only be deactivated. */
export async function participantHasRecords(id: ID): Promise<boolean> {
  const hist = await db.history.where('giverId').equals(id).or('recipientId').equals(id).count();
  if (hist > 0) return true;
  const draws = await db.draws.toArray();
  return draws.some((d) => d.status !== 'draft' && d.snapshot.participants.some((p) => p.id === id));
}

export async function deleteParticipantIfUnused(id: ID): Promise<'deleted' | 'deactivated'> {
  if (await participantHasRecords(id)) {
    await updateParticipant(id, { active: false });
    return 'deactivated';
  }
  await db.transaction('rw', [db.participants, db.relationships, db.households, db.events], async () => {
    await db.relationships.where('participantA').equals(id).or('participantB').equals(id).delete();
    const households = await db.households.toArray();
    for (const h of households) {
      if (h.memberIds.includes(id)) await db.households.update(h.id, { memberIds: h.memberIds.filter((m) => m !== id) });
    }
    const events = await db.events.toArray();
    for (const ev of events) {
      if (ev.participantIds.includes(id) && ev.status !== 'archived') {
        await db.events.update(ev.id, { participantIds: ev.participantIds.filter((m) => m !== id) });
      }
    }
    await db.participants.delete(id);
  });
  return 'deleted';
}

export async function createRelationship(fields: Omit<ParticipantRelationship, 'id' | 'createdAt' | 'schemaVersion'>) {
  if (fields.participantA === fields.participantB) throw new Error('A relationship needs two different people.');
  const rel: ParticipantRelationship = { ...fields, schemaVersion: CURRENT_SCHEMA_VERSION, id: newId('rl'), createdAt: nowIso() };
  await db.relationships.add(rel);
  return rel;
}

export async function createHousehold(name: string, memberIds: ID[], kind: Household['kind'] = 'household') {
  const h: Household = { schemaVersion: CURRENT_SCHEMA_VERSION, id: newId('hh'), name: name.trim(), kind, memberIds: Array.from(new Set(memberIds)), createdAt: nowIso() };
  await db.households.add(h);
  return h;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function addHistoryRecords(records: Omit<HistoricalAssignment, 'id' | 'createdAt' | 'schemaVersion'>[]) {
  const rows = records.map((r) => ({ ...r, schemaVersion: CURRENT_SCHEMA_VERSION, id: newId('hi'), createdAt: nowIso() }));
  await db.history.bulkAdd(rows);
  return rows;
}

/** The draw that currently counts for an event (latest confirmed, non-superseded version). */
export function currentConfirmedDraw(draws: DrawVersion[], event: ExchangeEvent): DrawVersion | undefined {
  if (event.activeDrawId) {
    const d = draws.find((x) => x.id === event.activeDrawId);
    if (d && d.status !== 'draft' && d.status !== 'superseded') return d;
  }
  return undefined;
}

/**
 * All historical pairings: manual/imported records plus the current confirmed draw of every event.
 * Duplicates (same series, year, giver, recipient) are merged.
 */
export function deriveHistory(events: ExchangeEvent[], draws: DrawVersion[], manual: HistoricalAssignment[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const seen = new Set<string>();
  const push = (e: HistoryEntry) => {
    const k = `${e.seriesId}|${e.year}|${e.giverId}|${e.recipientId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  for (const ev of events) {
    const d = currentConfirmedDraw(draws, ev);
    if (!d) continue;
    for (const a of d.snapshot.assignments) push({ seriesId: ev.seriesId, year: ev.year, giverId: a.giverId, recipientId: a.recipientId, source: 'draw', eventId: ev.id });
  }
  for (const h of manual) push({ seriesId: h.seriesId, year: h.year, giverId: h.giverId, recipientId: h.recipientId, source: h.source });
  return out;
}

export async function loadHistory(excludeEventId?: ID): Promise<HistoryEntry[]> {
  const [events, draws, manual] = await Promise.all([db.events.toArray(), db.draws.toArray(), db.history.toArray()]);
  return deriveHistory(
    events.filter((e) => e.id !== excludeEventId),
    draws,
    manual,
  );
}

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------

export async function saveDraftDraw(draw: DrawVersion): Promise<void> {
  if (draw.status !== 'draft') throw new Error('Only draft draws can be saved as drafts');
  await db.transaction('rw', db.events, db.draws, async () => {
    const ev = await db.events.get(draw.eventId);
    if (!ev) throw new Error('Event not found');
    if (ev.draftDrawId) {
      const old = await db.draws.get(ev.draftDrawId);
      if (old && old.status === 'draft') await db.draws.delete(old.id);
    }
    await db.draws.add(draw);
    await db.events.update(ev.id, {
      draftDrawId: draw.id,
      status: ev.activeDrawId ? ev.status : 'draw-generated',
      updatedAt: nowIso(),
    });
  });
}

export async function discardDraftDraw(eventId: ID): Promise<void> {
  await db.transaction('rw', db.events, db.draws, async () => {
    const ev = await db.events.get(eventId);
    if (!ev?.draftDrawId) return;
    const d = await db.draws.get(ev.draftDrawId);
    if (d?.status === 'draft') await db.draws.delete(d.id);
    await db.events.update(eventId, { draftDrawId: undefined, status: ev.activeDrawId ? ev.status : 'draft', updatedAt: nowIso() });
  });
}

/**
 * Confirm the draft draw: assign the version number, compute the SHA-256 fingerprint and freeze it.
 * Any previously confirmed version becomes "superseded" (kept, never overwritten).
 */
export async function confirmDraftDraw(eventId: ID): Promise<DrawVersion> {
  const ev = await db.events.get(eventId);
  if (!ev?.draftDrawId) throw new Error('There is no draft draw to confirm.');
  const draft = await db.draws.get(ev.draftDrawId);
  if (!draft || draft.status !== 'draft') throw new Error('The draft draw is missing.');
  const allDraws = await db.draws.where('eventId').equals(eventId).toArray();
  const version = nextVersionNumber(allDraws);
  const snapshot = { ...draft.snapshot, version };
  const integrity = await computeIntegrity(snapshot);
  const relayKeys = ev.relayKeys ?? { ...(await generateRelayKeyPair()), createdAt: nowIso() };
  const confirmed: DrawVersion = { ...draft, version, snapshot, integrity, status: 'confirmed', confirmedAt: nowIso() };
  await db.transaction('rw', db.events, db.draws, async () => {
    const current = await db.events.get(eventId);
    if (current?.draftDrawId !== draft.id) throw new Error('The draft changed while confirming. Please review it again.');
    if (current.activeDrawId) {
      const prev = await db.draws.get(current.activeDrawId);
      if (prev && prev.status !== 'superseded') await db.draws.update(prev.id, { status: 'superseded', supersededAt: nowIso() });
    }
    await db.draws.put(confirmed);
    await db.events.update(eventId, {
      activeDrawId: confirmed.id,
      draftDrawId: undefined,
      status: 'draw-confirmed',
      relayKeys,
      updatedAt: nowIso(),
    });
  });
  return confirmed;
}

/** Fields of a frozen draw that may never change after confirmation. */
function protectedFields(d: DrawVersion) {
  return canonicalJson({ snapshot: d.snapshot, integrity: d.integrity, version: d.version, eventId: d.eventId, id: d.id, createdAt: d.createdAt, confirmedAt: d.confirmedAt });
}

/** Update distribution/status metadata of a draw. Refuses to alter frozen snapshot data. */
export async function updateDrawMetadata(drawId: ID, mutate: (d: DrawVersion) => DrawVersion): Promise<DrawVersion> {
  return db.transaction('rw', db.draws, async () => {
    const d = await db.draws.get(drawId);
    if (!d) throw new Error('Draw not found');
    const next = mutate(structuredClone(d));
    if (isFrozen(d.status) && protectedFields(next) !== protectedFields(d)) {
      throw new Error('Confirmed draws are immutable — create a new version instead.');
    }
    await db.draws.put(next);
    return next;
  });
}

export async function setDistribution(drawId: ID, giverId: ID, patch: Partial<DistributionRecord>) {
  return updateDrawMetadata(drawId, (d) => {
    const prev = d.distribution[giverId] ?? { giverId, issueNumber: 0, issues: [], shared: false };
    d.distribution[giverId] = { ...prev, ...patch };
    return d;
  });
}

export async function markLinksReady(eventId: ID, drawId: ID) {
  await db.transaction('rw', db.events, db.draws, async () => {
    const d = await db.draws.get(drawId);
    if (d && d.status === 'confirmed') await db.draws.update(drawId, { status: 'active' });
    const ev = await db.events.get(eventId);
    if (ev && ev.status !== 'archived' && ev.activeDrawId === drawId) await db.events.update(eventId, { status: 'links-ready', updatedAt: nowIso() });
  });
}

export async function ensureCodenames(eventId: ID) {
  const ev = await db.events.get(eventId);
  if (!ev) return;
  const filled = fillCodenames(ev.participantIds, ev.codenames);
  await updateEvent(eventId, { codenames: { ...ev.codenames, ...filled } });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
