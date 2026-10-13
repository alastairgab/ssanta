import type { Assignment, ID, WithdrawalRepair } from '../types/models';
import { solveAssignment, countRepeats, type SolveOptions } from './assignmentEngine';
import { buildConstraintModel, hasBlockingIssues, type ConstraintInput } from './constraintModel';
import { compareAssignments } from './drawVersions';

/**
 * Minimal-disruption repair after participants withdraw.
 *
 * Objective (lexicographic, encoded as one integer cost):
 *   1. all hard constraints hold and everyone remaining gives/receives exactly once (hard),
 *   2. minimise the number of givers whose recipient changes   (CHANGE_COST per change),
 *   3. then minimise the historical soft penalty               (history cost, always < CHANGE_COST in total),
 *   4. random tie-breaking among equally good repairs.
 *
 * The same solver as for fresh draws is used, so the reciprocal rule and every other constraint
 * are enforced. A result is "proven minimal" only when the solver proves optimality.
 * We never promise that only one or two assignments change — restrictions may force more.
 */

export const CHANGE_COST = 10_000;

export type RepairResult =
  | { ok: true; repair: WithdrawalRepair }
  | { ok: false; status: 'infeasible' | 'inconclusive'; cause?: string };

export function planWithdrawalRepair(
  input: ConstraintInput,
  previous: Assignment[],
  withdrawnIds: ID[],
  options: SolveOptions = {},
): RepairResult {
  const withdrawn = new Set(withdrawnIds);
  const remaining = { ...input, participants: input.participants.filter((p) => !withdrawn.has(p.id)) };
  const model = buildConstraintModel(remaining);
  if (hasBlockingIssues(model)) return { ok: false, status: 'infeasible', cause: 'issues' };
  const prev = new Map(previous.map((a) => [a.giverId, a.recipientId]));
  const historyCap = CHANGE_COST - 1;
  const cost = model.ids.map((g, gi) =>
    model.ids.map((r, ri) => {
      const history = Math.min(model.cost[gi]![ri]!, Math.floor(historyCap / Math.max(1, model.n)));
      return (prev.get(g) === r ? 0 : CHANGE_COST) + history;
    }),
  );
  const res = solveAssignment(model, { ...options, cost });
  if (res.status !== 'solved') {
    return { ok: false, status: res.status, cause: res.status === 'infeasible' ? res.cause : undefined };
  }
  const proposed = res.recipientOf.map((r, g) => ({ giverId: model.ids[g]!, recipientId: model.ids[r]! }));
  const remainingPrev = previous.filter((a) => !withdrawn.has(a.giverId));
  const cmp = compareAssignments(remainingPrev, proposed);
  const changed = cmp.changed
    .filter((c) => c.to !== null)
    .map((c) => ({ giverId: c.giverId, from: c.from, to: c.to! }));
  return {
    ok: true,
    repair: {
      withdrawnIds,
      previous,
      proposed,
      unchanged: cmp.unchanged,
      changed,
      solver: {
        method: 'repair',
        provenOptimal: res.provenOptimal,
        softScore: res.softScore % CHANGE_COST,
        repeatCount: countRepeats(model, res.recipientOf),
        nodesExplored: res.nodes,
        elapsedMs: res.elapsedMs,
        changedCount: changed.length,
      },
    },
  };
}
