import { checkInvariants, type SimOptions, simulateRace } from './race-sim.js';

/**
 * Web Worker entry: post SimOptions, receive { result, failures }.
 * Spawn with `new Worker(new URL('./race-sim.worker.ts', import.meta.url), { type: 'module' })`.
 */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SimOptions>) => void) | null;
  postMessage(msg: unknown): void;
};

scope.onmessage = (e) => {
  const result = simulateRace(e.data);
  scope.postMessage({ result, failures: checkInvariants(result) });
};
