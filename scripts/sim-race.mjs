#!/usr/bin/env node
/**
 * Headless race test suite. Bundles src/sim/race-sim.ts (the same physics and
 * lap code the game runs) and executes every scenario in its own worker thread,
 * far faster than real time. Exits non-zero if any invariant fails.
 *
 *   npm run sim               # full suite
 *   npm run sim -- --json     # machine-readable output
 *   npm run sim -- --trace    # include a 0.5 s position trace per scenario
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'node_modules/.cache/iwsdk-sim/race-sim.mjs');
const args = new Set(process.argv.slice(2));
const traceEvery = args.has('--trace') ? 0.5 : 0;

const SCENARIOS = [
  { name: 'autopilot @90Hz', opts: { driver: { kind: 'autopilot' }, dt: 1 / 90 } },
  { name: 'autopilot @72Hz', opts: { driver: { kind: 'autopilot' }, dt: 1 / 72 } },
  { name: 'autopilot @20Hz (frame clamp)', opts: { driver: { kind: 'autopilot' }, dt: 0.05 } },
  { name: 'autopilot aggressive', opts: { driver: { kind: 'autopilot', tuning: { cornerSpeed: 20, steerGain: 2.6 } } } },
  { name: 'flat-out no steering', opts: { driver: { kind: 'constant', throttle: 1, brake: 0, steer: 0 }, maxTime: 90 } },
  { name: 'full lock circles', opts: { driver: { kind: 'constant', throttle: 1, brake: 0, steer: 1 }, maxTime: 60 } },
  { name: 'reverse into wall', opts: { driver: { kind: 'constant', throttle: 0, brake: 1, steer: 0.3 }, maxTime: 40 } },
  { name: 'wrong-way laps', opts: { driver: { kind: 'wrong-way' }, maxTime: 240 } },
  { name: 'teleport shortcut', opts: { driver: { kind: 'teleport-cheat', atTime: 8 }, maxTime: 240 } },
];

await build({
  entryPoints: [resolve(root, 'src/sim/race-sim.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: outFile,
  logLevel: 'error',
});

const workerSource = `
  import { parentPort, workerData } from 'node:worker_threads';
  const { simulateRace, checkInvariants } = await import(${JSON.stringify(pathToFileURL(outFile).href)});
  const result = simulateRace(workerData);
  parentPort.postMessage({ result, failures: checkInvariants(result) });
`;

const started = performance.now();
const outputs = await Promise.all(
  SCENARIOS.map(
    ({ opts }) =>
      new Promise((res, rej) => {
        const w = new Worker(workerSource, { eval: true, workerData: { traceEvery, ...opts }, type: 'module' });
        w.once('message', res);
        w.once('error', rej);
      }),
  ),
);
const wall = performance.now() - started;

const rows = SCENARIOS.map((s, i) => ({ scenario: s.name, ...outputs[i] }));
const failed = rows.filter((r) => r.failures.length);

if (args.has('--json')) {
  console.log(JSON.stringify({ wallMs: Math.round(wall), rows }, null, 2));
} else {
  const fmt = (n) => (n < 0 ? '—' : n.toFixed(2));
  console.log(
    'scenario'.padEnd(32) + 'fin  laps                    best    top   avg   hits  offAsph  simT    speedup',
  );
  for (const { scenario, result: r, failures } of rows) {
    console.log(
      scenario.padEnd(32) +
        (r.finished ? 'yes  ' : 'no   ') +
        r.laps.map(fmt).join(' / ').padEnd(24) +
        fmt(r.bestLap).padStart(6) +
        r.topSpeedKmh.toFixed(0).padStart(7) +
        r.avgSpeedKmh.toFixed(0).padStart(6) +
        String(r.wallHits).padStart(6) +
        (r.offAsphaltRatio * 100).toFixed(1).padStart(8) +
        '%' +
        r.simulatedTime.toFixed(0).padStart(6) +
        's' +
        (r.speedup + 'x').padStart(10) +
        (failures.length ? `   FAIL: ${failures.join('; ')}` : ''),
    );
  }
  console.log(`\n${rows.length} scenarios in ${Math.round(wall)} ms wall, ${failed.length} failing.`);
}

const reportPath = resolve(root, 'design/sim-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
process.exit(failed.length ? 1 : 0);
