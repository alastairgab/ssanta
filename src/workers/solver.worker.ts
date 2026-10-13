/// <reference lib="webworker" />
import { runSolverTask, type SolverTask } from '../services/solverTasks';

// Runs constraint solving off the main thread so the UI stays responsive for large groups.
self.onmessage = (e: MessageEvent<{ id: number; task: SolverTask }>) => {
  const { id, task } = e.data;
  try {
    const result = runSolverTask(task);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
