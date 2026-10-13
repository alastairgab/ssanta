import type { Assignment, ID } from '../types/models';
import { generateDraw, type DrawFailure, type DrawResult } from './assignmentEngine';
import { analyzeConstraints, type Diagnosis } from './conflictAnalyzer';
import { buildConstraintModel, type ConstraintInput } from './constraintModel';
import { planWithdrawalRepair, type RepairResult } from './drawRepair';

export type SolverTask =
  | { kind: 'draw'; input: ConstraintInput }
  | { kind: 'analyze'; input: ConstraintInput }
  | { kind: 'repair'; input: ConstraintInput; previous: Assignment[]; withdrawnIds: ID[] };

export type SolverTaskResult<T extends SolverTask['kind']> = T extends 'draw'
  ? DrawResult | DrawFailure
  : T extends 'analyze'
    ? Diagnosis
    : RepairResult;

export function runSolverTask(task: SolverTask): DrawResult | DrawFailure | Diagnosis | RepairResult {
  switch (task.kind) {
    case 'draw':
      return generateDraw(buildConstraintModel(task.input));
    case 'analyze':
      return analyzeConstraints(task.input);
    case 'repair':
      return planWithdrawalRepair(task.input, task.previous, task.withdrawnIds);
  }
}
