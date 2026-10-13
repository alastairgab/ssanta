import type { Assignment, ID } from '../types/models';
import type { ConstraintModel } from './constraintModel';

/**
 * Independent validation of a complete draw against the constraint model.
 * Used by the solver before returning, again before confirming a draw, and in tests.
 * Returns human-readable problems; an empty array means the draw is valid.
 */
export function validateAssignment(model: ConstraintModel, recipientOf: number[]): string[] {
  const problems: string[] = [];
  const n = model.n;
  if (recipientOf.length !== n) problems.push(`Expected ${n} givers, got ${recipientOf.length}`);
  const received = new Array<number>(n).fill(0);
  recipientOf.forEach((r, g) => {
    if (!Number.isInteger(r) || r < 0 || r >= n) {
      problems.push(`${model.labels[g]} has no valid recipient`);
      return;
    }
    received[r]!++;
    if (r === g) problems.push(`${model.labels[g]} drew themselves`);
    const reasons = model.blocked[g]![r]!;
    if (reasons.length > 0) problems.push(`${model.labels[g]} → ${model.labels[r]} breaks a rule: ${reasons[0]!.text}`);
    if (model.forcedTo[g]! >= 0 && model.forcedTo[g] !== r) {
      problems.push(`${model.labels[g]} must buy for ${model.labels[model.forcedTo[g]!]}`);
    }
    if (model.preventReciprocal && recipientOf[r] === g && g !== r) {
      if (g < r) problems.push(`${model.labels[g]} and ${model.labels[r]} drew each other`);
    }
  });
  received.forEach((count, r) => {
    if (count !== 1) problems.push(`${model.labels[r]} receives ${count} gifts`);
  });
  return problems;
}

/** Validate an ID-based draw (as stored) against a model. */
export function validateDraw(model: ConstraintModel, assignments: Assignment[]): string[] {
  const index = new Map<ID, number>(model.ids.map((id, i) => [id, i]));
  const recipientOf = new Array<number>(model.n).fill(-1);
  const problems: string[] = [];
  const seenGivers = new Set<ID>();
  for (const a of assignments) {
    const g = index.get(a.giverId);
    const r = index.get(a.recipientId);
    if (g === undefined) {
      problems.push('A giver is not part of this event');
      continue;
    }
    if (r === undefined) {
      problems.push(`${model.labels[g]}'s recipient is not part of this event`);
      continue;
    }
    if (seenGivers.has(a.giverId)) problems.push(`${model.labels[g]} appears as a giver more than once`);
    seenGivers.add(a.giverId);
    recipientOf[g] = r;
  }
  return [...problems, ...validateAssignment(model, recipientOf)];
}

export interface DrawChecks {
  valid: boolean;
  problems: string[];
  forcedSatisfied: number;
  forcedTotal: number;
  blockedPairsRespected: boolean;
  reciprocalPairs: number;
  repeatCount: number;
}

/** Summary used by the review screen. */
export function summariseDraw(model: ConstraintModel, assignments: Assignment[]): DrawChecks {
  const problems = validateDraw(model, assignments);
  const index = new Map<ID, number>(model.ids.map((id, i) => [id, i]));
  const recipientOf = new Array<number>(model.n).fill(-1);
  for (const a of assignments) {
    const g = index.get(a.giverId);
    const r = index.get(a.recipientId);
    if (g !== undefined && r !== undefined) recipientOf[g] = r;
  }
  const forcedTotal = model.forcedTo.filter((r) => r >= 0).length;
  const forcedSatisfied = model.forcedTo.filter((r, g) => r >= 0 && recipientOf[g] === r).length;
  let reciprocal = 0;
  let repeats = 0;
  recipientOf.forEach((r, g) => {
    if (r >= 0 && recipientOf[r] === g && g < r) reciprocal++;
    if (r >= 0 && model.repeat[g]![r]) repeats++;
  });
  const blockedPairsRespected = recipientOf.every((r, g) => r >= 0 && model.blocked[g]![r]!.length === 0);
  return {
    valid: problems.length === 0,
    problems,
    forcedSatisfied,
    forcedTotal,
    blockedPairsRespected,
    reciprocalPairs: reciprocal,
    repeatCount: repeats,
  };
}
