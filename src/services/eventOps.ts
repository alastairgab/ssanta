import type {
  DistributionRecord,
  DrawVersion,
  ExchangeEvent,
  ID,
  LinkIssue,
  Participant,
  WithdrawalRepair,
} from '../types/models';
import { nowIso } from '../utils/id';
import { participantLabel } from '../utils/format';
import type { ConstraintInput } from './constraintModel';
import { buildSnapshot, newDraftDraw, nextVersionNumber } from './drawVersions';
import { buildRevealPayload, createRevealLink } from './revealLinks';
import {
  confirmDraftDraw,
  db,
  loadHistory,
  markLinksReady,
  saveDraftDraw,
  updateDrawMetadata,
  updateEvent,
  ensureCodenames,
} from './storage';
import { runTask } from './solverClient';
import type { DrawFailure, DrawResult } from './assignmentEngine';
import type { Diagnosis } from './conflictAnalyzer';
import { openRelayPacket, questionFromPacket, replyFromPacket } from './anonymousQuestions';
import { applyWishlistSubmission, wishlistId } from './wishlist';

/** High-level organiser operations that combine storage, the solver and cryptography. */

export async function loadConstraintInput(eventId: ID): Promise<{ event: ExchangeEvent; input: ConstraintInput; participants: Participant[] }> {
  const event = await db.events.get(eventId);
  if (!event) throw new Error('Event not found');
  const [people, relationships, households, history] = await Promise.all([
    db.participants.bulkGet(event.participantIds),
    db.relationships.toArray(),
    db.households.toArray(),
    loadHistory(eventId),
  ]);
  const participants = people.filter((p): p is Participant => Boolean(p));
  return {
    event,
    participants,
    input: {
      participants: participants.map((p) => ({ id: p.id, label: participantLabel(p) })),
      rules: event.rules,
      relationships,
      households,
      history,
      eventYear: event.year,
    },
  };
}

export type GenerateOutcome = { ok: true; draw: DrawVersion } | { ok: false; failure: DrawFailure; diagnosis: Diagnosis };

export async function generateDraftDraw(eventId: ID): Promise<GenerateOutcome> {
  if ((await db.events.get(eventId))?.codenamesEnabled) await ensureCodenames(eventId);
  const { event, input, participants } = await loadConstraintInput(eventId);
  const res = (await runTask({ kind: 'draw', input })) as DrawResult | DrawFailure;
  if (!res.ok) {
    const diagnosis = (await runTask({ kind: 'analyze', input })) as Diagnosis;
    return { ok: false, failure: res, diagnosis };
  }
  const draws = await db.draws.where('eventId').equals(eventId).toArray();
  const version = nextVersionNumber(draws);
  const snapshot = buildSnapshot({ event, participants, assignments: res.assignments, solver: res.solver, version });
  const draft = newDraftDraw({ event, snapshot, reason: event.activeDrawId ? 'redraw' : 'initial', parentDrawId: event.activeDrawId });
  await saveDraftDraw(draft);
  return { ok: true, draw: draft };
}

export async function diagnoseEvent(eventId: ID): Promise<Diagnosis> {
  const { input } = await loadConstraintInput(eventId);
  return (await runTask({ kind: 'analyze', input })) as Diagnosis;
}

export { confirmDraftDraw };

/**
 * Generate (or regenerate) encrypted reveal links for givers of a confirmed draw.
 * Each call creates a NEW link with a new key and an incremented issue number.
 */
export async function issueLinks(eventId: ID, drawId: ID, giverIds: ID[] | 'all', reason: LinkIssue['reason']): Promise<DrawVersion> {
  const event = await db.events.get(eventId);
  const draw = await db.draws.get(drawId);
  if (!event || !draw) throw new Error('Event or draw not found');
  if (draw.status === 'draft') throw new Error('Confirm the draw before generating links.');
  if (draw.status === 'superseded') throw new Error('This draw version has been superseded; links can only be generated for the current version.');
  const ids = giverIds === 'all' ? draw.snapshot.assignments.map((a) => a.giverId) : giverIds;
  const people = new Map((await db.participants.bulkGet(draw.snapshot.participants.map((p) => p.id))).filter((p): p is Participant => Boolean(p)).map((p) => [p.id, p]));
  const wishlists = await db.wishlists.where('eventId').equals(eventId).toArray();
  const updates: Record<ID, DistributionRecord> = {};
  for (const giverId of ids) {
    const prev = draw.distribution[giverId] ?? { giverId, issueNumber: 0, issues: [], shared: false };
    const issueNumber = (prev.issueNumber ?? 0) + 1;
    const recipientId = draw.snapshot.assignments.find((a) => a.giverId === giverId)?.recipientId;
    const payload = buildRevealPayload({
      event,
      draw,
      giverId,
      participants: people,
      recipientWishlist: wishlists.find((w) => w.participantId === recipientId),
      issueNumber,
    });
    const link = await createRevealLink(payload);
    const issuedAt = nowIso();
    updates[giverId] = {
      giverId,
      link,
      issueNumber,
      issuedAt,
      issues: [...(prev.issues ?? []), { issuedAt, issueNumber, reason }],
      // A new link has not been shared yet, even if an older one was.
      shared: false,
      sharedAt: undefined,
      carriedFromDrawId: undefined,
      carriedFromVersion: undefined,
    };
  }
  const updated = await updateDrawMetadata(drawId, (d) => {
    for (const [g, rec] of Object.entries(updates)) d.distribution[g] = rec;
    return d;
  });
  await markLinksReady(eventId, drawId);
  return updated;
}

export async function setShared(drawId: ID, giverIds: ID[], shared: boolean) {
  await updateDrawMetadata(drawId, (d) => {
    for (const g of giverIds) {
      const rec = d.distribution[g];
      if (!rec) continue;
      d.distribution[g] = { ...rec, shared, sharedAt: shared ? nowIso() : undefined };
    }
    return d;
  });
}

export async function planWithdrawal(eventId: ID, withdrawnIds: ID[]) {
  const event = await db.events.get(eventId);
  if (!event?.activeDrawId) throw new Error('There is no confirmed draw to repair.');
  const draw = await db.draws.get(event.activeDrawId);
  if (!draw) throw new Error('Draw not found');
  const { input } = await loadConstraintInput(eventId);
  // Restrict to the people in the current draw (the event list may have changed since).
  const inDraw = new Set(draw.snapshot.participants.map((p) => p.id));
  const scoped = { ...input, participants: input.participants.filter((p) => inDraw.has(p.id)) };
  const result = await runTask({ kind: 'repair', input: scoped, previous: draw.snapshot.assignments, withdrawnIds });
  return { draw, result };
}

/**
 * Apply an approved repair: creates and confirms a NEW draw version. Unchanged givers keep their
 * existing link (it still shows the correct recipient); changed givers need replacement links.
 */
export async function applyWithdrawalRepair(eventId: ID, repair: WithdrawalRepair, note?: string): Promise<DrawVersion> {
  const event = await db.events.get(eventId);
  if (!event?.activeDrawId) throw new Error('There is no confirmed draw to repair.');
  const parent = await db.draws.get(event.activeDrawId);
  if (!parent) throw new Error('Draw not found');
  const withdrawn = new Set(repair.withdrawnIds);
  const remainingIds = event.participantIds.filter((id) => !withdrawn.has(id));
  await updateEvent(eventId, { participantIds: remainingIds });
  const fresh = (await db.events.get(eventId))!;
  const participants = (await db.participants.bulkGet(repair.proposed.map((a) => a.giverId))).filter((p): p is Participant => Boolean(p));
  const draws = await db.draws.where('eventId').equals(eventId).toArray();
  const snapshot = buildSnapshot({
    event: fresh,
    participants,
    assignments: repair.proposed,
    solver: repair.solver,
    version: nextVersionNumber(draws),
  });
  const unchanged = new Set(repair.unchanged.map((a) => a.giverId));
  const carried: Record<ID, DistributionRecord> = {};
  for (const g of unchanged) {
    const old = parent.distribution[g];
    if (old?.link) {
      carried[g] = { ...old, carriedFromDrawId: old.carriedFromDrawId ?? parent.id, carriedFromVersion: old.carriedFromVersion ?? parent.version };
    }
  }
  const draft = newDraftDraw({
    event: fresh,
    snapshot,
    reason: 'withdrawal-repair',
    parentDrawId: parent.id,
    note,
    removedParticipantIds: repair.withdrawnIds,
    carriedDistribution: carried,
  });
  await saveDraftDraw(draft);
  const confirmed = await confirmDraftDraw(eventId);
  if (Object.keys(carried).length > 0) await markLinksReady(eventId, confirmed.id);
  return confirmed;
}

export type RelayImportResult =
  | { type: 'question'; questionId: ID; duplicate: boolean }
  | { type: 'reply'; questionId: ID; duplicate: boolean }
  | { type: 'wishlist'; participantId: ID; name: string };

export async function importRelayMessage(eventId: ID, pasted: string): Promise<RelayImportResult> {
  const event = await db.events.get(eventId);
  if (!event) throw new Error('Event not found');
  const packet = await openRelayPacket(event, pasted);
  if (packet.t === 'question') {
    const existing = await db.questions.get(packet.qid);
    if (existing) return { type: 'question', questionId: existing.id, duplicate: true };
    const draws = await db.draws.where('eventId').equals(eventId).toArray();
    const q = questionFromPacket(packet, event, draws);
    await db.questions.add(q);
    return { type: 'question', questionId: q.id, duplicate: false };
  }
  if (packet.t === 'reply') {
    const question = await db.questions.get(packet.qid);
    if (question && question.eventId !== eventId) throw new Error('This reply belongs to a different event.');
    const existing = await db.replies.where('questionId').equals(packet.qid).toArray();
    if (existing.some((r) => r.text === packet.text)) return { type: 'reply', questionId: packet.qid, duplicate: true };
    const reply = replyFromPacket(packet, question);
    await db.replies.add(reply);
    await db.questions.update(question!.id, { status: 'answered' });
    return { type: 'reply', questionId: question!.id, duplicate: false };
  }
  // wishlist
  if (!event.participantIds.includes(packet.pid)) throw new Error('This wishlist is from someone who is not in this event.');
  const existing = await db.wishlists.get(wishlistId(eventId, packet.pid));
  await db.wishlists.put(applyWishlistSubmission(existing, eventId, packet.pid, packet.wishlist));
  return { type: 'wishlist', participantId: packet.pid, name: packet.name };
}
