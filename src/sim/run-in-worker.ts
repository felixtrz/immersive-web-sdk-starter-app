import type { SimOptions, SimResult } from './race-sim.js';

export interface WorkerSimOutput {
  result: SimResult;
  failures: string[];
}

/** Runs one headless race off the main thread so the rendered game never stalls. */
export function runRaceInWorker(opts: SimOptions): Promise<WorkerSimOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./race-sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerSimOutput>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(opts);
  });
}

/** Runs several races in parallel workers. */
export function runRaceSuiteInWorkers(suite: SimOptions[]): Promise<WorkerSimOutput[]> {
  return Promise.all(suite.map(runRaceInWorker));
}
