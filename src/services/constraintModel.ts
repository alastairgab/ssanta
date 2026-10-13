import type { EventRules, Household, HistoryEntry, ID, ParticipantRelationship } from '../types/models';
import {
  computeHistoryWindow,
  indexPairs,
  pairKey,
  softPenalty,
  type HistoryWindow,
} from './historicalFairness';
import { effectivePolicy, householdActive, relationshipBlocks, RELATIONSHIP_NOUN } from './relationshipRules';

/**
 * The constraint model turns organiser-level rules into a giver × recipient matrix:
 *  - `blocked[g][r]` lists every hard reason a pairing is unavailable (empty = allowed),
 *  - `cost[g][r]` is the soft historical penalty (0 = no discouragement),
 *  - `issues` lists direct rule contradictions that must be resolved before solving.
 *
 * Everything is index-based and plain data so it can be posted to a Web Worker.
 */

export type RuleRef =
  | { kind: 'self' }
  | { kind: 'forbidden'; id: ID; mutual: boolean }
  | { kind: 'relationship'; id: ID }
  | { kind: 'household'; id: ID }
  | { kind: 'history'; year: number }
  | { kind: 'forced-giver'; id: ID } // giver is forced to buy for someone else
  | { kind: 'forced-recipient'; id: ID }; // recipient is reserved for another giver

export interface BlockReason {
  rule: RuleRef;
  /** Phrase completing "<recipient> is …", e.g. "excluded by the partner relationship". */
  text: string;
}

export interface ConstraintIssue {
  code:
    | 'too-few-participants'
    | 'two-with-reciprocal'
    | 'forced-self'
    | 'forced-missing-participant'
    | 'forced-giver-duplicate'
    | 'forced-recipient-duplicate'
    | 'forced-blocked'
    | 'forced-reciprocal';
  severity: 'error' | 'warning';
  message: string;
  /** Rules involved, so the UI and remedy search can point at them. */
  rules: RuleRef[];
  forcedIds?: ID[];
}

export interface ConstraintInput {
  participants: { id: ID; label: string }[];
  rules: EventRules;
  relationships: ParticipantRelationship[];
  households: Household[];
  history: HistoryEntry[];
  eventYear: number;
}

export interface ConstraintModel {
  n: number;
  ids: ID[];
  labels: string[];
  blocked: BlockReason[][][];
  cost: number[][];
  /** Pairing occurred in any earlier year of the source series (for repeat counting). */
  repeat: boolean[][];
  /** Most recent earlier year of the pairing in the source series, or 0. */
  lastYear: number[][];
  forcedTo: number[];
  forcedFrom: number[];
  preventReciprocal: boolean;
  issues: ConstraintIssue[];
  historyYears: number[];
  windowYears: number[];
}

export function hasBlockingIssues(model: ConstraintModel): boolean {
  return model.issues.some((i) => i.severity === 'error');
}

export function isAllowed(model: ConstraintModel, g: number, r: number): boolean {
  return model.blocked[g]![r]!.length === 0;
}

function historyPhrase(year: number, window: HistoryWindow): string {
  const rank = window.years.indexOf(year);
  if (rank === 0) return `excluded because of last time's assignment (${year})`;
  return `excluded because of the ${year} assignment`;
}

export function buildConstraintModel(input: ConstraintInput): ConstraintModel {
  const { participants, rules } = input;
  const n = participants.length;
  const ids = participants.map((p) => p.id);
  const labels = participants.map((p) => p.label);
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const idSet = new Set(ids);
  const nameOf = (id: ID) => {
    const i = index.get(id);
    return i === undefined ? 'someone not in this event' : labels[i]!;
  };

  const blocked: BlockReason[][][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [] as BlockReason[]));
  const cost: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const repeat: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const lastYear: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const issues: ConstraintIssue[] = [];

  const block = (g: ID, r: ID, reason: BlockReason) => {
    const gi = index.get(g);
    const ri = index.get(r);
    if (gi === undefined || ri === undefined || gi === ri) return;
    const list = blocked[gi]![ri]!;
    if (!list.some((x) => sameRule(x.rule, reason.rule))) list.push(reason);
  };

  // Self
  for (let i = 0; i < n; i++) blocked[i]![i]!.push({ rule: { kind: 'self' }, text: 'the same person (nobody can buy for themselves)' });

  // Manual forbidden pairings
  for (const f of rules.forbidden) {
    if (!f.enabled) continue;
    const ref: RuleRef = { kind: 'forbidden', id: f.id, mutual: f.mutual };
    block(f.giverId, f.recipientId, {
      rule: ref,
      text: f.mutual
        ? `forbidden by the manual rule that ${nameOf(f.giverId)} and ${nameOf(f.recipientId)} can't buy for each other`
        : `forbidden by the manual rule "${nameOf(f.giverId)} cannot buy for ${nameOf(f.recipientId)}"`,
    });
    if (f.mutual) {
      block(f.recipientId, f.giverId, {
        rule: ref,
        text: `forbidden by the manual rule that ${nameOf(f.giverId)} and ${nameOf(f.recipientId)} can't buy for each other`,
      });
    }
  }

  // Relationships
  for (const rel of input.relationships) {
    if (!idSet.has(rel.participantA) || !idSet.has(rel.participantB)) continue;
    const policy = effectivePolicy(rel, rules);
    const noun = rel.type === 'custom' ? `"${rel.label || 'custom'}"` : RELATIONSHIP_NOUN[rel.type];
    for (const [g, r] of relationshipBlocks(rel, policy)) {
      block(g, r, { rule: { kind: 'relationship', id: rel.id }, text: `excluded by the ${noun} relationship` });
    }
  }

  // Households / groups
  for (const h of input.households) {
    if (!householdActive(h, rules)) continue;
    const members = h.memberIds.filter((m) => idSet.has(m));
    for (const a of members) {
      for (const b of members) {
        if (a !== b) block(a, b, { rule: { kind: 'household', id: h.id }, text: `in the same ${h.kind === 'household' ? 'household' : 'group'} (${h.name})` });
      }
    }
  }

  // History
  const window = computeHistoryWindow(input.history, rules.history, input.eventYear, idSet);
  const windowPairs = indexPairs(window.entries);
  const everPairs = indexPairs(window.allEntries);
  const mostRecent = window.years[0];
  for (let g = 0; g < n; g++) {
    for (let r = 0; r < n; r++) {
      if (g === r) continue;
      const k = pairKey(ids[g]!, ids[r]!);
      const ever = everPairs.get(k);
      if (ever && ever.length > 0) {
        repeat[g]![r] = true;
        lastYear[g]![r] = ever[0]!;
      }
      const inWindow = windowPairs.get(k) ?? [];
      if (rules.history.mode === 'none') continue;
      if (rules.history.strength === 'hard') {
        if (inWindow.length > 0) {
          blocked[g]![r]!.push({ rule: { kind: 'history', year: inWindow[0]! }, text: historyPhrase(inWindow[0]!, window) });
        }
      } else {
        const reverse = mostRecent !== undefined && (windowPairs.get(pairKey(ids[r]!, ids[g]!)) ?? []).includes(mostRecent);
        cost[g]![r] = softPenalty(inWindow, window, rules.history, reverse);
      }
    }
  }

  // Forced pairings — validated before they constrain the matrix.
  const forcedTo = new Array<number>(n).fill(-1);
  const forcedFrom = new Array<number>(n).fill(-1);
  const enabledForced = rules.forced.filter((f) => f.enabled);
  const byGiver = new Map<ID, typeof enabledForced>();
  const byRecipient = new Map<ID, typeof enabledForced>();
  for (const f of enabledForced) {
    if (!idSet.has(f.giverId) || !idSet.has(f.recipientId)) {
      issues.push({
        code: 'forced-missing-participant',
        severity: 'error',
        message: `A forced pairing (${nameOf(f.giverId)} → ${nameOf(f.recipientId)}) involves someone who isn't in this event. Remove or disable it.`,
        rules: [{ kind: 'forced-giver', id: f.id }],
        forcedIds: [f.id],
      });
      continue;
    }
    if (f.giverId === f.recipientId) {
      issues.push({
        code: 'forced-self',
        severity: 'error',
        message: `${nameOf(f.giverId)} is forced to buy for themselves. Remove this forced pairing.`,
        rules: [{ kind: 'forced-giver', id: f.id }],
        forcedIds: [f.id],
      });
      continue;
    }
    byGiver.set(f.giverId, [...(byGiver.get(f.giverId) ?? []), f]);
    byRecipient.set(f.recipientId, [...(byRecipient.get(f.recipientId) ?? []), f]);
  }
  const badForced = new Set<ID>();
  for (const [giver, list] of byGiver) {
    const distinct = new Set(list.map((f) => f.recipientId));
    if (distinct.size > 1) {
      list.forEach((f) => badForced.add(f.id));
      issues.push({
        code: 'forced-giver-duplicate',
        severity: 'error',
        message: `${nameOf(giver)} is forced to buy for ${distinct.size} people (${Array.from(distinct).map(nameOf).join(', ')}). Each person can only buy one gift — keep one of these forced pairings.`,
        rules: list.map((f) => ({ kind: 'forced-giver', id: f.id }) as RuleRef),
        forcedIds: list.map((f) => f.id),
      });
    }
  }
  for (const [recipient, list] of byRecipient) {
    const distinct = new Set(list.map((f) => f.giverId));
    if (distinct.size > 1) {
      list.forEach((f) => badForced.add(f.id));
      issues.push({
        code: 'forced-recipient-duplicate',
        severity: 'error',
        message: `${Array.from(distinct).map(nameOf).join(' and ')} are all forced to buy for ${nameOf(recipient)}. Each person receives only one gift — keep one of these forced pairings.`,
        rules: list.map((f) => ({ kind: 'forced-recipient', id: f.id }) as RuleRef),
        forcedIds: list.map((f) => f.id),
      });
    }
  }
  const seenForced = new Set<string>();
  for (const f of enabledForced) {
    if (badForced.has(f.id) || !idSet.has(f.giverId) || !idSet.has(f.recipientId) || f.giverId === f.recipientId) continue;
    const g = index.get(f.giverId)!;
    const r = index.get(f.recipientId)!;
    const key = `${g}>${r}`;
    if (seenForced.has(key)) continue; // exact duplicates are harmless
    seenForced.add(key);
    const reasons = blocked[g]![r]!;
    if (reasons.length > 0) {
      issues.push({
        code: 'forced-blocked',
        severity: 'error',
        message: `${labels[g]} is forced to buy for ${labels[r]}, but ${labels[r]} is ${reasons.map((x) => x.text).join(' and ')}. Remove the forced pairing or relax the conflicting rule — hard rules are never overridden automatically.`,
        rules: [{ kind: 'forced-giver', id: f.id }, ...reasons.map((x) => x.rule)],
        forcedIds: [f.id],
      });
      continue;
    }
    forcedTo[g] = r;
    forcedFrom[r] = g;
  }
  if (rules.preventReciprocal) {
    for (let g = 0; g < n; g++) {
      const r = forcedTo[g]!;
      if (r >= 0 && forcedTo[r] === g && g < r) {
        const ids2 = enabledForced.filter(
          (f) => (f.giverId === ids[g] && f.recipientId === ids[r]) || (f.giverId === ids[r] && f.recipientId === ids[g]),
        );
        issues.push({
          code: 'forced-reciprocal',
          severity: 'error',
          message: `${labels[g]} and ${labels[r]} are forced to buy for each other, but direct swaps are not allowed. Remove one forced pairing or allow reciprocal pairs.`,
          rules: ids2.map((f) => ({ kind: 'forced-giver', id: f.id }) as RuleRef),
          forcedIds: ids2.map((f) => f.id),
        });
      }
    }
  }
  // Apply valid forced pairings as reservations.
  for (let g = 0; g < n; g++) {
    const r = forcedTo[g]!;
    if (r < 0) continue;
    const fid = enabledForced.find((f) => f.giverId === ids[g] && f.recipientId === ids[r])!.id;
    for (let x = 0; x < n; x++) {
      if (x !== r && x !== g) {
        blocked[g]![x]!.push({ rule: { kind: 'forced-giver', id: fid }, text: `unavailable because ${labels[g]} must buy for ${labels[r]} (forced pairing)` });
      }
      if (x !== g && x !== r) {
        blocked[x]![r]!.push({ rule: { kind: 'forced-recipient', id: fid }, text: `already required as ${labels[g]}'s recipient (forced pairing)` });
      }
    }
  }

  if (n < 2) {
    issues.push({ code: 'too-few-participants', severity: 'error', message: 'A gift exchange needs at least two participants.', rules: [] });
  } else if (n === 2 && rules.preventReciprocal) {
    issues.push({
      code: 'two-with-reciprocal',
      severity: 'error',
      message: 'With only two participants they must buy for each other, so "no reciprocal pairs" makes the draw impossible. Add participants or allow reciprocal pairs.',
      rules: [],
    });
  }

  return {
    n,
    ids,
    labels,
    blocked,
    cost,
    repeat,
    lastYear,
    forcedTo,
    forcedFrom,
    preventReciprocal: rules.preventReciprocal,
    issues,
    historyYears: window.allYears,
    windowYears: window.years,
  };
}

export function sameRule(a: RuleRef, b: RuleRef): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'self':
      return true;
    case 'history':
      return a.year === (b as { year: number }).year;
    default:
      return (a as { id: ID }).id === (b as { id: ID }).id;
  }
}

export function ruleKey(r: RuleRef): string {
  switch (r.kind) {
    case 'self':
      return 'self';
    case 'history':
      return 'history';
    case 'forced-giver':
    case 'forced-recipient':
      return `forced:${r.id}`;
    default:
      return `${r.kind}:${r.id}`;
  }
}
