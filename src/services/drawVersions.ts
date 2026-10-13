import type {
  Assignment,
  DistributionRecord,
  DrawSnapshot,
  DrawStatus,
  DrawVersion,
  EventRules,
  ExchangeEvent,
  ID,
  Participant,
  SolverInfo,
} from '../types/models';
import { CURRENT_SCHEMA_VERSION } from '../types/models';
import { newId, nowIso } from '../utils/id';
import { normaliseRules } from './drawIntegrity';

/**
 * Draw version lifecycle
 *
 *   draft ──confirm──▶ confirmed ──links generated──▶ active ──newer version confirmed──▶ superseded
 *                                                         └──event archived──▶ archived
 *
 * - Generating or regenerating replaces the single *draft* draw for an event.
 * - Confirming freezes the snapshot (with its SHA-256 fingerprint). After that only metadata —
 *   status and link distribution — may change. storage.ts enforces this.
 * - A redraw or withdrawal repair creates a NEW version; older versions are kept as superseded.
 */

export function buildSnapshot(args: {
  event: ExchangeEvent;
  participants: Participant[];
  assignments: Assignment[];
  solver: SolverInfo;
  version: number;
  rules?: EventRules;
}): DrawSnapshot {
  const { event } = args;
  const ids = new Set(args.assignments.map((a) => a.giverId));
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    eventId: event.id,
    seriesId: event.seriesId,
    eventName: event.name,
    year: event.year,
    version: args.version,
    participants: args.participants
      .filter((p) => ids.has(p.id))
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        codename: event.codenamesEnabled ? event.codenames[p.id] || undefined : undefined,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    assignments: [...args.assignments].sort((a, b) => (a.giverId < b.giverId ? -1 : 1)),
    rules: normaliseRules(JSON.parse(JSON.stringify(args.rules ?? event.rules))),
    generatedAt: nowIso(),
    solver: args.solver,
  };
}

export function newDraftDraw(args: {
  event: ExchangeEvent;
  snapshot: DrawSnapshot;
  reason: DrawVersion['reason'];
  parentDrawId?: ID;
  note?: string;
  removedParticipantIds?: ID[];
  carriedDistribution?: Record<ID, DistributionRecord>;
}): DrawVersion {
  const distribution: Record<ID, DistributionRecord> = {};
  for (const a of args.snapshot.assignments) {
    distribution[a.giverId] = args.carriedDistribution?.[a.giverId] ?? { giverId: a.giverId, issueNumber: 0, issues: [], shared: false };
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('dr'),
    eventId: args.event.id,
    version: args.snapshot.version,
    status: 'draft',
    reason: args.reason,
    parentDrawId: args.parentDrawId,
    createdAt: nowIso(),
    snapshot: args.snapshot,
    distribution,
    note: args.note,
    removedParticipantIds: args.removedParticipantIds,
  };
}

export function nextVersionNumber(draws: DrawVersion[]): number {
  const confirmed = draws.filter((d) => d.status !== 'draft');
  return confirmed.length === 0 ? 1 : Math.max(...confirmed.map((d) => d.version)) + 1;
}

export const isFrozen = (status: DrawStatus) => status !== 'draft';

export interface DrawComparison {
  changed: { giverId: ID; from: ID | null; to: ID | null }[];
  unchanged: Assignment[];
  addedGivers: ID[];
  removedGivers: ID[];
}

export function compareAssignments(before: Assignment[], after: Assignment[]): DrawComparison {
  const b = new Map(before.map((a) => [a.giverId, a.recipientId]));
  const a = new Map(after.map((x) => [x.giverId, x.recipientId]));
  const changed: DrawComparison['changed'] = [];
  const unchanged: Assignment[] = [];
  const added: ID[] = [];
  const removed: ID[] = [];
  for (const [giver, to] of a) {
    if (!b.has(giver)) {
      added.push(giver);
      changed.push({ giverId: giver, from: null, to });
    } else if (b.get(giver) !== to) {
      changed.push({ giverId: giver, from: b.get(giver)!, to });
    } else {
      unchanged.push({ giverId: giver, recipientId: to });
    }
  }
  for (const [giver, from] of b) {
    if (!a.has(giver)) {
      removed.push(giver);
      changed.push({ giverId: giver, from, to: null });
    }
  }
  return { changed, unchanged, addedGivers: added, removedGivers: removed };
}

export function sharedCount(draw: DrawVersion | undefined): number {
  if (!draw) return 0;
  return Object.values(draw.distribution).filter((d) => d.shared).length;
}

export function linksIssuedCount(draw: DrawVersion | undefined): number {
  if (!draw) return 0;
  return Object.values(draw.distribution).filter((d) => d.link).length;
}

export const DRAW_STATUS_LABELS: Record<DrawStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  active: 'Active',
  superseded: 'Superseded',
  archived: 'Archived',
};
