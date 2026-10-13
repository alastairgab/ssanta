import type { Assignment, SolverInfo } from '../types/models';
import { secureRandomFloat } from '../utils/random';
import { hasBlockingIssues, isAllowed, type ConstraintModel } from './constraintModel';
import { hungarian } from './hungarian';
import { validateAssignment } from './constraintValidator';

/**
 * Assignment engine
 * =================
 *
 * Goal: a permutation `recipientOf` where every participant gives exactly one gift and receives
 * exactly one, nobody draws themselves, every hard constraint holds, (optionally) no two people
 * draw each other, and the total soft penalty (historical repeats, or "changes" for repairs) is
 * as low as possible.
 *
 * Method:
 *  1. Hard constraints become a bipartite "allowed" graph (constraintModel.ts).
 *  2. A min-cost perfect matching is computed with the Hungarian algorithm. Disallowed pairs get
 *     a prohibitive cost; if the optimum uses one, no valid assignment exists at all (proven).
 *     Randomness: each allowed pair gets a cryptographically random tie-break noise in [0, ε) with
 *     n·ε < 1, so the integer-cost optimum is preserved while equally good draws are chosen at random.
 *  3. If 2-cycles are allowed, or the optimal matching contains none, that matching is the answer and
 *     it is proven optimal.
 *  4. Otherwise a branch-and-bound depth-first search runs: most-constrained giver first, candidates
 *     in (cost + noise) order, pruning with (a) a maximum-matching feasibility check of the remaining
 *     sub-problem, (b) a lower bound of "current cost + cheapest option per remaining giver", and
 *     (c) the Hungarian relaxation cost as a global lower bound. The search is bounded by node and time
 *     limits; if it finishes, the result is proven optimal (or proven impossible); if it is cut short,
 *     the result says so.
 *
 * The draw is randomised but NOT a uniformly random sample of all valid draws; we do not claim that.
 * Every result is re-validated against the model before being returned as successful.
 */

export interface SolveOptions {
  /** Override the soft-cost matrix (used by the repair solver). Only finite, non-negative integers. */
  cost?: number[][];
  /** Stop at the first valid assignment (used for remedy checks). */
  feasibilityOnly?: boolean;
  nodeLimit?: number;
  timeLimitMs?: number;
  /** Random source in [0,1). Defaults to crypto randomness. */
  random?: () => number;
}

export type SolveResult =
  | {
      status: 'solved';
      recipientOf: number[];
      softScore: number;
      provenOptimal: boolean;
      method: 'matching' | 'branch-and-bound';
      nodes: number;
      elapsedMs: number;
    }
  | { status: 'infeasible'; cause: 'issues' | 'no-matching' | 'reciprocal'; nodes: number; elapsedMs: number }
  | { status: 'inconclusive'; nodes: number; elapsedMs: number; bestFound?: undefined };

// Larger than any achievable total of real costs (repairs use 10 000 per change), small enough
// to keep floating-point tie-break noise precise.
const DISALLOWED = 1e9;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function solveAssignment(model: ConstraintModel, options: SolveOptions = {}): SolveResult {
  const start = now();
  const n = model.n;
  const elapsed = () => Math.round(now() - start);
  if (hasBlockingIssues(model)) return { status: 'infeasible', cause: 'issues', nodes: 0, elapsedMs: elapsed() };
  const rand = options.random ?? secureRandomFloat;
  const baseCost = options.cost ?? model.cost;
  const eps = 1 / (n + 2);

  // Allowed matrix + noisy costs
  const allowed: boolean[][] = [];
  const noisy: number[][] = [];
  for (let g = 0; g < n; g++) {
    const arow: boolean[] = [];
    const crow: number[] = [];
    for (let r = 0; r < n; r++) {
      const ok = isAllowed(model, g, r);
      arow.push(ok);
      crow.push(ok ? baseCost[g]![r]! + rand() * eps : DISALLOWED);
    }
    allowed.push(arow);
    noisy.push(crow);
  }

  const match = hungarian(noisy);
  if (match.some((r, g) => r < 0 || !allowed[g]![r])) {
    return { status: 'infeasible', cause: 'no-matching', nodes: 0, elapsedMs: elapsed() };
  }
  const intCost = (rec: number[]) => rec.reduce((s, r, g) => s + baseCost[g]![r]!, 0);
  const rootLowerBound = intCost(match);
  const hasTwoCycle = match.some((r, g) => match[r] === g);
  if (!model.preventReciprocal || !hasTwoCycle) {
    const result: SolveResult = {
      status: 'solved',
      recipientOf: match,
      softScore: rootLowerBound,
      provenOptimal: true,
      method: 'matching',
      nodes: 1,
      elapsedMs: elapsed(),
    };
    assertValid(model, match);
    return result;
  }

  // ---- Branch and bound with reciprocal-cycle constraint ----
  const nodeLimit = options.nodeLimit ?? 250_000;
  const timeLimit = options.timeLimitMs ?? 4_000;
  const rec = new Int32Array(n).fill(-1);
  const giverOf = new Int32Array(n).fill(-1);
  let best: number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let nodes = 0;
  let aborted = false;
  let done = false;

  const valid = (g: number, r: number) => allowed[g]![r]! && giverOf[r] === -1 && rec[r] !== g;

  // Maximum matching of the remaining sub-problem (relaxation: ignores future 2-cycles).
  const tryAugment = (g: number, matchG: Int32Array, matchR: Int32Array, seen: Uint8Array): boolean => {
    for (let r = 0; r < n; r++) {
      if (seen[r] || !valid(g, r)) continue;
      seen[r] = 1;
      const other = matchR[r]!;
      if (other === -1 || tryAugment(other, matchG, matchR, seen)) {
        matchG[g] = r;
        matchR[r] = g;
        return true;
      }
    }
    return false;
  };

  const repairMatching = (matchG: Int32Array, matchR: Int32Array): boolean => {
    for (let g = 0; g < n; g++) {
      if (rec[g] !== -1) continue;
      const r = matchG[g]!;
      if (r !== -1 && !valid(g, r)) {
        matchG[g] = -1;
        matchR[r] = -1;
      }
    }
    for (let g = 0; g < n; g++) {
      if (rec[g] !== -1 || matchG[g] !== -1) continue;
      if (!tryAugment(g, matchG, matchR, new Uint8Array(n))) return false;
    }
    return true;
  };

  const search = (depth: number, curCost: number, matchG: Int32Array, matchR: Int32Array) => {
    if (done || aborted) return;
    nodes++;
    if ((nodes & 255) === 0 && (nodes > nodeLimit || now() - start > timeLimit)) {
      aborted = true;
      return;
    }
    if (depth === n) {
      if (curCost < bestCost) {
        bestCost = curCost;
        best = Array.from(rec);
        if (options.feasibilityOnly || bestCost <= rootLowerBound) done = true;
      }
      return;
    }
    // Most-constrained unassigned giver + lower bound
    let pick = -1;
    let pickCount = Number.POSITIVE_INFINITY;
    let lb = curCost;
    for (let g = 0; g < n; g++) {
      if (rec[g] !== -1) continue;
      let count = 0;
      let minC = Number.POSITIVE_INFINITY;
      for (let r = 0; r < n; r++) {
        if (!valid(g, r)) continue;
        count++;
        const c = baseCost[g]![r]!;
        if (c < minC) minC = c;
      }
      if (count === 0) return;
      lb += minC;
      if (count < pickCount) {
        pickCount = count;
        pick = g;
      }
    }
    if (lb >= bestCost) return;
    const g = pick;
    const candidates: number[] = [];
    for (let r = 0; r < n; r++) if (valid(g, r)) candidates.push(r);
    candidates.sort((a, b) => noisy[g]![a]! - noisy[g]![b]!);
    for (const r of candidates) {
      if (done || aborted) return;
      const c = curCost + baseCost[g]![r]!;
      if (c >= bestCost) continue;
      rec[g] = r;
      giverOf[r] = g;
      const mG = matchG.slice();
      const mR = matchR.slice();
      // Remove g and r from the relaxation matching
      const oldR = mG[g]!;
      if (oldR !== -1) mR[oldR] = -1;
      mG[g] = -1;
      const oldG = mR[r]!;
      if (oldG !== -1) mG[oldG] = -1;
      mR[r] = -1;
      if (repairMatching(mG, mR)) search(depth + 1, c, mG, mR);
      rec[g] = -1;
      giverOf[r] = -1;
    }
  };

  const mG = new Int32Array(n).fill(-1);
  const mR = new Int32Array(n).fill(-1);
  match.forEach((r, g) => {
    mG[g] = r;
    mR[r] = g;
  });
  search(0, 0, mG, mR);

  if (best) {
    const found: number[] = best;
    assertValid(model, found);
    return {
      status: 'solved',
      recipientOf: found,
      softScore: bestCost,
      provenOptimal: !aborted,
      method: 'branch-and-bound',
      nodes,
      elapsedMs: elapsed(),
    };
  }
  if (aborted) return { status: 'inconclusive', nodes, elapsedMs: elapsed() };
  return { status: 'infeasible', cause: 'reciprocal', nodes, elapsedMs: elapsed() };
}

function assertValid(model: ConstraintModel, recipientOf: number[]) {
  const problems = validateAssignment(model, recipientOf);
  if (problems.length > 0) {
    throw new Error(`Internal solver error — produced an invalid draw: ${problems.join('; ')}`);
  }
}

export function countRepeats(model: ConstraintModel, recipientOf: number[]): number {
  return recipientOf.reduce((s, r, g) => s + (model.repeat[g]![r] ? 1 : 0), 0);
}

export interface DrawResult {
  ok: true;
  assignments: Assignment[];
  solver: SolverInfo;
}

export interface DrawFailure {
  ok: false;
  status: 'infeasible' | 'inconclusive';
  cause?: 'issues' | 'no-matching' | 'reciprocal';
  nodes: number;
  elapsedMs: number;
}

/** Generate a draw for the model; wraps solveAssignment and converts indices to IDs. */
export function generateDraw(model: ConstraintModel, options: SolveOptions = {}): DrawResult | DrawFailure {
  const res = solveAssignment(model, options);
  if (res.status !== 'solved') {
    return {
      ok: false,
      status: res.status,
      cause: res.status === 'infeasible' ? res.cause : undefined,
      nodes: res.nodes,
      elapsedMs: res.elapsedMs,
    };
  }
  const assignments = res.recipientOf.map((r, g) => ({ giverId: model.ids[g]!, recipientId: model.ids[r]! }));
  return {
    ok: true,
    assignments,
    solver: {
      method: res.method,
      provenOptimal: res.provenOptimal,
      softScore: res.softScore,
      repeatCount: countRepeats(model, res.recipientOf),
      nodesExplored: res.nodes,
      elapsedMs: res.elapsedMs,
    },
  };
}
