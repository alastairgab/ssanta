import type { EventRules, ExclusionPolicy, HistoryMode, ID } from '../types/models';
import { listToSentence } from '../utils/format';
import { solveAssignment } from './assignmentEngine';
import {
  buildConstraintModel,
  hasBlockingIssues,
  isAllowed,
  ruleKey,
  type ConstraintInput,
  type ConstraintIssue,
  type ConstraintModel,
  type RuleRef,
} from './constraintModel';
import { historyWindowSize } from './historicalFairness';
import { effectivePolicy, householdActive, RELATIONSHIP_NOUN } from './relationshipRules';

/**
 * Smart constraint diagnostics.
 *
 *  1. Direct contradictions come from the constraint model (duplicate/conflicting forced pairings…).
 *  2. Local dead ends: givers with no allowed recipient, recipients nobody may buy for — explained
 *     pair by pair using the actual block reasons.
 *  3. Global failure: if every person has options but no complete one-to-one matching exists, we
 *     compute a maximum matching and extract a Hall's-theorem witness — a set S of givers whose
 *     combined allowed recipients N(S) is smaller than S. That is a proof of impossibility, so the
 *     explanation is solver-backed rather than guessed.
 *  4. If a matching exists but every one contains a direct swap, the reciprocal rule is the cause
 *     (only stated when the branch-and-bound search proved it).
 *  5. Remedies: candidate rule changes are generated from the organiser's actual rules, applied to a
 *     COPY of the rules, and re-solved. Only changes that produced a valid draw are offered. Rules are
 *     never modified without the organiser approving a remedy in the UI.
 *     Single changes are tried first, then pairs. Minimality (fewest changes) is only claimed when
 *     every single-change candidate was tested within the time budget.
 */

export type RuleChange =
  | { kind: 'disable-forbidden'; id: ID }
  | { kind: 'forbidden-one-way'; id: ID }
  | { kind: 'relationship-exception'; id: ID; policy: ExclusionPolicy }
  | { kind: 'household-exception'; id: ID }
  | { kind: 'history-window'; mode: HistoryMode; customYears?: number }
  | { kind: 'history-soft' }
  | { kind: 'allow-reciprocal' }
  | { kind: 'disable-forced'; id: ID };

export interface Remedy {
  changes: RuleChange[];
  descriptions: string[];
  priorityScore: number;
  /** Repeat pairings in the draw found with this remedy applied. */
  repeatCount: number;
}

export interface Explanation {
  participantId: ID;
  message: string;
  rules: RuleRef[];
}

export interface Diagnosis {
  feasible: boolean | 'unknown';
  issues: ConstraintIssue[];
  stuckGivers: Explanation[];
  stuckRecipients: Explanation[];
  global?: { message: string; giverIds: ID[]; recipientIds: ID[]; rules: RuleRef[] };
  reciprocalOnly?: string;
  inconclusive?: string;
  remedies: Remedy[];
  remedySearch: {
    singlesTested: number;
    singlesTotal: number;
    pairsTested: number;
    pairsTotal: number;
    timedOut: boolean;
    /** True only if every single-change candidate was checked (so a 1-change remedy, or "no 1-change remedy", is proven). */
    exhaustiveSingles: boolean;
  };
}

const PRIORITY: Record<RuleChange['kind'], number> = {
  'history-soft': 1,
  'history-window': 2,
  'allow-reciprocal': 3,
  'relationship-exception': 4,
  'household-exception': 5,
  'forbidden-one-way': 5.5,
  'disable-forbidden': 6,
  'disable-forced': 7,
};

export function applyRuleChanges(rules: EventRules, changes: RuleChange[]): EventRules {
  const next: EventRules = JSON.parse(JSON.stringify(rules));
  for (const c of changes) {
    switch (c.kind) {
      case 'disable-forbidden':
        next.forbidden = next.forbidden.map((f) => (f.id === c.id ? { ...f, enabled: false } : f));
        break;
      case 'forbidden-one-way':
        next.forbidden = next.forbidden.map((f) => (f.id === c.id ? { ...f, mutual: false } : f));
        break;
      case 'relationship-exception':
        next.relationshipOverrides = { ...next.relationshipOverrides, [c.id]: c.policy };
        break;
      case 'household-exception':
        next.householdOverrides = { ...next.householdOverrides, [c.id]: false };
        break;
      case 'history-window':
        next.history = { ...next.history, mode: c.mode, customYears: c.customYears };
        break;
      case 'history-soft':
        next.history = { ...next.history, strength: 'soft' };
        break;
      case 'allow-reciprocal':
        next.preventReciprocal = false;
        break;
      case 'disable-forced':
        next.forced = next.forced.map((f) => (f.id === c.id ? { ...f, enabled: false } : f));
        break;
    }
  }
  return next;
}

function changeKey(c: RuleChange): string {
  switch (c.kind) {
    case 'history-window':
    case 'history-soft':
      return 'history';
    case 'allow-reciprocal':
      return 'reciprocal';
    default:
      return `${c.kind.split('-')[0]}:${c.id}`;
  }
}

function historyModeLabel(mode: HistoryMode, customYears?: number): string {
  switch (mode) {
    case 'none':
      return 'no history restriction';
    case 'last-1':
      return 'the previous event year only';
    case 'last-2':
      return 'the previous two event years';
    case 'last-3':
      return 'the previous three event years';
    case 'all':
      return 'all previous years';
    case 'custom':
      return `the previous ${customYears ?? 0} event years`;
  }
}

export function describeChange(c: RuleChange, input: ConstraintInput): string {
  const nameOf = (id: ID) => input.participants.find((p) => p.id === id)?.label ?? 'someone';
  switch (c.kind) {
    case 'disable-forbidden': {
      const f = input.rules.forbidden.find((x) => x.id === c.id);
      return f
        ? `Remove the manual rule "${nameOf(f.giverId)} ${f.mutual ? 'and' : 'cannot buy for'} ${nameOf(f.recipientId)}${f.mutual ? " can't buy for each other" : ''}"`
        : 'Remove a manual exclusion';
    }
    case 'forbidden-one-way': {
      const f = input.rules.forbidden.find((x) => x.id === c.id);
      return f
        ? `Make the rule between ${nameOf(f.giverId)} and ${nameOf(f.recipientId)} one-way (${nameOf(f.recipientId)} may then buy for ${nameOf(f.giverId)})`
        : 'Make a manual exclusion one-way';
    }
    case 'relationship-exception': {
      const rel = input.relationships.find((r) => r.id === c.id);
      if (!rel) return 'Allow a relationship exception';
      const noun = rel.type === 'custom' ? `"${rel.label ?? 'custom'}"` : RELATIONSHIP_NOUN[rel.type];
      return c.policy === 'none'
        ? `Allow an exception so ${nameOf(rel.participantA)} and ${nameOf(rel.participantB)} may draw each other despite their ${noun} relationship`
        : `Relax the ${noun} rule for ${nameOf(rel.participantA)} & ${nameOf(rel.participantB)} to one-way (${nameOf(rel.participantB)} may then buy for ${nameOf(rel.participantA)})`;
    }
    case 'household-exception': {
      const h = input.households.find((x) => x.id === c.id);
      return `Let members of ${h?.name ?? 'a household'} buy for each other this year`;
    }
    case 'history-window':
      return `Relax the history rule from ${historyModeLabel(input.rules.history.mode, input.rules.history.customYears)} to ${historyModeLabel(c.mode, c.customYears)}`;
    case 'history-soft':
      return 'Change the history rule from "never repeat" (hard) to "try to avoid repeats" (soft)';
    case 'allow-reciprocal':
      return 'Allow reciprocal pairs (two people drawing each other)';
    case 'disable-forced': {
      const f = input.rules.forced.find((x) => x.id === c.id);
      return f ? `Remove the forced pairing ${nameOf(f.giverId)} → ${nameOf(f.recipientId)}` : 'Remove a forced pairing';
    }
  }
}

/** Candidate single changes generated from the organiser's actual rules. */
export function candidateChanges(input: ConstraintInput): RuleChange[] {
  const ids = new Set(input.participants.map((p) => p.id));
  const out: RuleChange[] = [];
  const { rules } = input;
  for (const f of rules.forced) {
    if (f.enabled) out.push({ kind: 'disable-forced', id: f.id });
  }
  for (const f of rules.forbidden) {
    if (!f.enabled || !ids.has(f.giverId) || !ids.has(f.recipientId)) continue;
    if (f.mutual) out.push({ kind: 'forbidden-one-way', id: f.id });
    out.push({ kind: 'disable-forbidden', id: f.id });
  }
  for (const rel of input.relationships) {
    if (!ids.has(rel.participantA) || !ids.has(rel.participantB)) continue;
    const pol = effectivePolicy(rel, rules);
    if (pol === 'mutual') out.push({ kind: 'relationship-exception', id: rel.id, policy: 'one-way' });
    if (pol !== 'none') out.push({ kind: 'relationship-exception', id: rel.id, policy: 'none' });
  }
  for (const h of input.households) {
    if (householdActive(h, rules) && h.memberIds.filter((m) => ids.has(m)).length >= 2) {
      out.push({ kind: 'household-exception', id: h.id });
    }
  }
  if (rules.history.mode !== 'none' && rules.history.strength === 'hard') {
    out.push({ kind: 'history-soft' });
    const size = historyWindowSize(rules.history);
    const options: { mode: HistoryMode; size: number; customYears?: number }[] = [
      { mode: 'last-3', size: 3 },
      { mode: 'last-2', size: 2 },
      { mode: 'last-1', size: 1 },
    ];
    for (const o of options) if (o.size < size) out.push({ kind: 'history-window', mode: o.mode });
    out.push({ kind: 'history-window', mode: 'none' });
  }
  if (rules.preventReciprocal) out.push({ kind: 'allow-reciprocal' });
  return out;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function blockersSummary(model: ConstraintModel, g: number, r: number): string {
  const reasons = model.blocked[g]![r]!;
  return reasons.map((x) => x.text).join(' and ');
}

export function maximumMatching(model: ConstraintModel): { matchG: number[]; matchR: number[]; size: number } {
  const n = model.n;
  const matchG = new Array<number>(n).fill(-1);
  const matchR = new Array<number>(n).fill(-1);
  const augment = (g: number, seen: boolean[]): boolean => {
    for (let r = 0; r < n; r++) {
      if (seen[r] || !isAllowed(model, g, r)) continue;
      seen[r] = true;
      if (matchR[r] === -1 || augment(matchR[r]!, seen)) {
        matchG[g] = r;
        matchR[r] = g;
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (let g = 0; g < n; g++) if (augment(g, new Array<boolean>(n).fill(false))) size++;
  return { matchG, matchR, size };
}

function shortList(names: string[], max = 8): string {
  if (names.length <= max) return listToSentence(names);
  return `${names.slice(0, max).join(', ')} and ${names.length - max} others`;
}

export function analyzeConstraints(input: ConstraintInput, opts: { timeLimitMs?: number } = {}): Diagnosis {
  const start = now();
  const budget = opts.timeLimitMs ?? 5000;
  const model = buildConstraintModel(input);
  const n = model.n;
  const L = model.labels;
  const diagnosis: Diagnosis = {
    feasible: false,
    issues: model.issues,
    stuckGivers: [],
    stuckRecipients: [],
    remedies: [],
    remedySearch: { singlesTested: 0, singlesTotal: 0, pairsTested: 0, pairsTotal: 0, timedOut: false, exhaustiveSingles: false },
  };
  const involved = new Map<string, RuleRef>();
  const note = (r: RuleRef) => {
    if (r.kind !== 'self') involved.set(ruleKey(r), r);
  };
  model.issues.forEach((i) => i.rules.forEach(note));

  if (!hasBlockingIssues(model) && n >= 2) {
    const res = solveAssignment(model, { feasibilityOnly: true, timeLimitMs: Math.min(3000, budget / 2) });
    if (res.status === 'solved') {
      diagnosis.feasible = true;
      return diagnosis;
    }
    if (res.status === 'inconclusive') {
      diagnosis.feasible = 'unknown';
      diagnosis.inconclusive =
        'The search for a valid draw hit its time limit without finding one or proving that none exists. The rules may still be satisfiable; relaxing a rule or trying again may help.';
    }
  }

  // Local dead ends
  for (let g = 0; g < n; g++) {
    const options = Array.from({ length: n }, (_, r) => r).filter((r) => r !== g && isAllowed(model, g, r));
    if (options.length === 0 && n >= 2) {
      const parts: string[] = [];
      const rules: RuleRef[] = [];
      for (let r = 0; r < n; r++) {
        if (r === g) continue;
        parts.push(`${L[r]} is ${blockersSummary(model, g, r)}`);
        model.blocked[g]![r]!.forEach((x) => {
          rules.push(x.rule);
          note(x.rule);
        });
      }
      diagnosis.stuckGivers.push({
        participantId: model.ids[g]!,
        message: `${L[g]} cannot be assigned a recipient under the current rules. ${capitalise(listToSentence(parts))}.`,
        rules,
      });
    }
  }
  for (let r = 0; r < n; r++) {
    const options = Array.from({ length: n }, (_, g) => g).filter((g) => g !== r && isAllowed(model, g, r));
    if (options.length === 0 && n >= 2) {
      const parts: string[] = [];
      const rules: RuleRef[] = [];
      for (let g = 0; g < n; g++) {
        if (g === r) continue;
        parts.push(`${L[g]} can't (${L[r]} is ${blockersSummary(model, g, r)})`);
        model.blocked[g]![r]!.forEach((x) => {
          rules.push(x.rule);
          note(x.rule);
        });
      }
      diagnosis.stuckRecipients.push({
        participantId: model.ids[r]!,
        message: `Nobody is allowed to buy for ${L[r]}: ${listToSentence(parts)}.`,
        rules,
      });
    }
  }

  // Global Hall violation (only meaningful without local dead ends or forced-pairing errors)
  if (!hasBlockingIssues(model) && diagnosis.stuckGivers.length === 0 && diagnosis.stuckRecipients.length === 0 && n >= 2) {
    const { matchR, matchG, size } = maximumMatching(model);
    if (size < n) {
      const visitedG = new Set<number>();
      const visitedR = new Set<number>();
      const queue: number[] = [];
      for (let g = 0; g < n; g++) if (matchG[g] === -1) {
        visitedG.add(g);
        queue.push(g);
      }
      while (queue.length) {
        const g = queue.shift()!;
        for (let r = 0; r < n; r++) {
          if (!isAllowed(model, g, r) || visitedR.has(r)) continue;
          visitedR.add(r);
          const m = matchR[r]!;
          if (m !== -1 && !visitedG.has(m)) {
            visitedG.add(m);
            queue.push(m);
          }
        }
      }
      const S = Array.from(visitedG).sort((a, b) => a - b);
      const T = Array.from(visitedR).sort((a, b) => a - b);
      const rules: RuleRef[] = [];
      const counts = new Map<string, { count: number; label: string }>();
      for (const g of S) {
        for (let r = 0; r < n; r++) {
          if (visitedR.has(r) || r === g) continue;
          for (const reason of model.blocked[g]![r]!) {
            rules.push(reason.rule);
            note(reason.rule);
            const label = ruleKindLabel(reason.rule, input);
            const key = ruleKey(reason.rule);
            const prev = counts.get(key);
            counts.set(key, { count: (prev?.count ?? 0) + 1, label });
          }
        }
      }
      const household = input.households.find((h) => {
        if (!householdActive(h, input.rules)) return false;
        const members = new Set(h.memberIds);
        return S.every((g) => members.has(model.ids[g]!));
      });
      let message: string;
      if (household && S.length >= 2) {
        message = `Your household restrictions make a valid exchange impossible. ${S.length} participants belong to ${household.name} (${shortList(S.map((g) => L[g]!))}), but only ${T.length} eligible recipient${T.length === 1 ? '' : 's'} exist outside that household for them (${shortList(T.map((r) => L[r]!))}).`;
      } else {
        message = `These ${S.length} people — ${shortList(S.map((g) => L[g]!))} — are only allowed to buy for ${T.length === 0 ? 'nobody' : `these ${T.length}: ${shortList(T.map((r) => L[r]!))}`}. Since each person can receive only one gift, at least ${S.length - T.length} of them would be left without a recipient.`;
      }
      const top = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((c) => `${c.label} (${c.count} pairing${c.count === 1 ? '' : 's'})`);
      if (top.length) message += ` The other options are blocked mainly by: ${top.join('; ')}.`;
      diagnosis.global = { message, giverIds: S.map((g) => model.ids[g]!), recipientIds: T.map((r) => model.ids[r]!), rules };
    } else if (model.preventReciprocal && !diagnosis.inconclusive) {
      diagnosis.reciprocalOnly =
        'A one-to-one assignment exists, but every possible arrangement contains at least one direct swap (two people drawing each other). The "no reciprocal pairs" rule therefore makes this configuration impossible. This was proven by an exhaustive search.';
    }
  }

  // Remedy search
  const candidates = candidateChanges(input);
  const involvedKeys = new Set(Array.from(involved.keys()));
  const isRelevant = (c: RuleChange): boolean => {
    switch (c.kind) {
      case 'disable-forbidden':
      case 'forbidden-one-way':
        return involvedKeys.has(`forbidden:${c.id}`);
      case 'relationship-exception':
        return involvedKeys.has(`relationship:${c.id}`);
      case 'household-exception':
        return involvedKeys.has(`household:${c.id}`);
      case 'history-soft':
      case 'history-window':
        return involvedKeys.has('history');
      case 'allow-reciprocal':
        return Boolean(diagnosis.reciprocalOnly) || model.issues.some((i) => i.code === 'forced-reciprocal' || i.code === 'two-with-reciprocal');
      case 'disable-forced':
        return involvedKeys.has(`forced:${c.id}`);
    }
  };
  const ordered = [...candidates.filter(isRelevant), ...candidates.filter((c) => !isRelevant(c))];
  diagnosis.remedySearch.singlesTotal = ordered.length;

  const tryChanges = (changes: RuleChange[]): Remedy | null => {
    const rules = applyRuleChanges(input.rules, changes);
    const m = buildConstraintModel({ ...input, rules });
    if (hasBlockingIssues(m)) return null;
    const res = solveAssignment(m, { timeLimitMs: 400, nodeLimit: 40_000 });
    if (res.status !== 'solved') return null;
    const repeatCount = res.recipientOf.reduce((s, r, g) => s + (m.repeat[g]![r] ? 1 : 0), 0);
    return {
      changes,
      descriptions: changes.map((c) => describeChange(c, input)),
      priorityScore: changes.reduce((s, c) => s + PRIORITY[c.kind], 0),
      repeatCount,
    };
  };

  const failedSingles: RuleChange[] = [];
  for (const c of ordered) {
    if (now() - start > budget) {
      diagnosis.remedySearch.timedOut = true;
      break;
    }
    diagnosis.remedySearch.singlesTested++;
    const remedy = tryChanges([c]);
    if (remedy) diagnosis.remedies.push(remedy);
    else failedSingles.push(c);
  }
  diagnosis.remedySearch.exhaustiveSingles = diagnosis.remedySearch.singlesTested === ordered.length;

  if (diagnosis.remedies.length === 0 && !diagnosis.remedySearch.timedOut) {
    const pool = failedSingles.slice(0, 14);
    const pairs: [RuleChange, RuleChange][] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (changeKey(pool[i]!) !== changeKey(pool[j]!)) pairs.push([pool[i]!, pool[j]!]);
      }
    }
    diagnosis.remedySearch.pairsTotal = pairs.length;
    for (const pair of pairs) {
      if (now() - start > budget || diagnosis.remedies.length >= 8) {
        if (now() - start > budget) diagnosis.remedySearch.timedOut = true;
        break;
      }
      diagnosis.remedySearch.pairsTested++;
      const remedy = tryChanges(pair);
      if (remedy) diagnosis.remedies.push(remedy);
    }
  }

  diagnosis.remedies.sort(
    (a, b) => a.changes.length - b.changes.length || a.priorityScore - b.priorityScore || a.repeatCount - b.repeatCount,
  );
  diagnosis.remedies = diagnosis.remedies.slice(0, 8);
  return diagnosis;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ruleKindLabel(rule: RuleRef, input: ConstraintInput): string {
  const nameOf = (id: ID) => input.participants.find((p) => p.id === id)?.label ?? 'someone';
  switch (rule.kind) {
    case 'self':
      return 'self';
    case 'forbidden': {
      const f = input.rules.forbidden.find((x) => x.id === rule.id);
      return f ? `manual rule ${nameOf(f.giverId)} ${f.mutual ? '↔' : '→'} ${nameOf(f.recipientId)}` : 'a manual rule';
    }
    case 'relationship': {
      const rel = input.relationships.find((x) => x.id === rule.id);
      return rel ? `${RELATIONSHIP_NOUN[rel.type]} relationship ${nameOf(rel.participantA)} & ${nameOf(rel.participantB)}` : 'a relationship';
    }
    case 'household':
      return `household ${input.households.find((h) => h.id === rule.id)?.name ?? ''}`.trim();
    case 'history':
      return 'history rules';
    case 'forced-giver':
    case 'forced-recipient': {
      const f = input.rules.forced.find((x) => x.id === rule.id);
      return f ? `forced pairing ${nameOf(f.giverId)} → ${nameOf(f.recipientId)}` : 'a forced pairing';
    }
  }
}

/** Ensure remedies are only applied by explicit organiser action. */
export function applyRemedy(rules: EventRules, remedy: Remedy): EventRules {
  return applyRuleChanges(rules, remedy.changes);
}
