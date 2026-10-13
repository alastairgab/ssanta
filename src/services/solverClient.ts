import { runSolverTask, type SolverTask, type SolverTaskResult } from './solverTasks';

/**
 * Runs solver tasks in a Web Worker when available (keeps the UI responsive), falling back to
 * the main thread (tests, very old browsers). Each task has an overall timeout as a safety net;
 * the solver itself is also bounded by node/time limits.
 */

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || import.meta.env?.MODE === 'test') return null;
  try {
    worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'Solver failed'));
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('The solver stopped unexpectedly.'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export function runTask<T extends SolverTask>(task: T, timeoutMs = 30_000): Promise<SolverTaskResult<T['kind']>> {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve, reject) => {
      // Yield to let the UI paint a progress state first.
      setTimeout(() => {
        try {
          resolve(runSolverTask(task) as SolverTaskResult<T['kind']>);
        } catch (e) {
          reject(e as Error);
        }
      }, 0);
    });
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error('The solver took too long. Try relaxing some rules.'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as SolverTaskResult<T['kind']>);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ id, task });
  });
}
