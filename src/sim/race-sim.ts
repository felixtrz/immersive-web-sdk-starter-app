import { KART_LATERAL_LIMIT, LAP_COUNT, SAMPLE_COUNT, SAMPLE_X, SAMPLE_Z, SPAWN, TRACK_HALF_WIDTH } from '../track.js';
import { type AutopilotTuning, computeAutopilot, DEFAULT_AUTOPILOT } from './autopilot-driver.js';
import { createKartState, DEFAULT_MAX_SPEED, DriveMode, type KartInput, type KartState, stepKart } from './kart-physics.js';
import { createLapState, LapEvent, stepLap } from './lap-tracker.js';

/**
 * Headless, deterministic race: the exact physics and lap rules the game runs,
 * stepped at a fixed dt as fast as the CPU allows. Runs in a Web Worker
 * (src/sim/race-sim.worker.ts), in Node worker_threads (scripts/sim-race.mjs),
 * or inline.
 */

export type DriverSpec =
  | { kind: 'autopilot'; tuning?: Partial<AutopilotTuning> }
  /** Constant controls, e.g. full throttle with no steering to test the barriers. */
  | { kind: 'constant'; throttle: number; brake: number; steer: number }
  /** Autopilot, but spawned facing backwards: no lap may ever count. */
  | { kind: 'wrong-way' }
  /** Autopilot that teleports across the infield mid-lap: the lap must not count. */
  | { kind: 'teleport-cheat'; atTime: number };

export interface SimOptions {
  driver: DriverSpec;
  /** Fixed step in seconds. The game clamps frames to 0.05 s. */
  dt?: number;
  /** Simulated-time budget in seconds. */
  maxTime?: number;
  maxSpeed?: number;
  /** Simulate the 3 s grid countdown before racing. */
  countdown?: number;
  /** Record a downsampled trace every N seconds (0 = off). */
  traceEvery?: number;
}

export interface SimResult {
  driver: DriverSpec['kind'];
  finished: boolean;
  lapsCompleted: number;
  laps: number[];
  bestLap: number;
  totalRaceTime: number;
  simulatedTime: number;
  steps: number;
  wallMs: number;
  speedup: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  wallHits: number;
  hardestHit: number;
  /** Fraction of racing steps with the kart centre beyond the asphalt edge. */
  offAsphaltRatio: number;
  maxAbsOffset: number;
  /** Largest gap (samples) between consecutive nearest-sample indices — a tunnelling check. */
  maxIndexJump: number;
  gateEvents: number;
  nonFinite: boolean;
  trace: Array<[t: number, x: number, z: number, speed: number, lap: number]>;
}

export function simulateRace(opts: SimOptions): SimResult {
  const dt = opts.dt ?? 1 / 90;
  const maxTime = opts.maxTime ?? 600;
  const maxSpeed = opts.maxSpeed ?? DEFAULT_MAX_SPEED;
  const countdown = opts.countdown ?? 3;
  const traceEvery = opts.traceEvery ?? 0;
  const driver = opts.driver;
  const tuning: AutopilotTuning =
    driver.kind === 'autopilot' ? { ...DEFAULT_AUTOPILOT, ...driver.tuning } : DEFAULT_AUTOPILOT;

  const kart = createKartState();
  if (driver.kind === 'wrong-way') kart.yaw = SPAWN.yaw + Math.PI;
  const lap = createLapState();
  const input: KartInput = { throttle: 0, brake: 0, steer: 0 };

  const started = now();
  let t = 0;
  let steps = 0;
  let raceTime = 0;
  let finished = false;
  let topSpeed = 0;
  let speedSum = 0;
  let racingSteps = 0;
  let wallHits = 0;
  let hardestHit = 0;
  let inContact = false;
  let offAsphalt = 0;
  let maxAbsOffset = 0;
  let maxIndexJump = 0;
  let gateEvents = 0;
  let nonFinite = false;
  let teleported = false;
  let nextTrace = 0;
  const trace: SimResult['trace'] = [];

  while (t < maxTime && !finished) {
    const racing = t >= countdown;
    const mode = racing ? DriveMode.Racing : DriveMode.Locked;
    drive(driver, kart, input, tuning);

    if (driver.kind === 'teleport-cheat' && !teleported && raceTime >= driver.atTime) {
      teleported = true;
      const target = (kart.trackIdx + Math.floor(SAMPLE_COUNT * 0.45)) % SAMPLE_COUNT;
      kart.x = SAMPLE_X[target];
      kart.z = SAMPLE_Z[target];
    }

    const prevIdx = kart.trackIdx;
    stepKart(kart, input, dt, mode, maxSpeed);
    steps++;
    t += dt;

    if (!Number.isFinite(kart.x) || !Number.isFinite(kart.z) || !Number.isFinite(kart.speed)) {
      nonFinite = true;
      break;
    }
    if (prevIdx >= 0) {
      const d = Math.abs(kart.trackIdx - prevIdx);
      const jump = Math.min(d, SAMPLE_COUNT - d);
      if (jump > maxIndexJump && !(teleported && jump > 50)) maxIndexJump = jump;
    }

    if (racing) {
      raceTime += dt;
      racingSteps++;
      const kmh = Math.abs(kart.speed) * 3.6;
      speedSum += kmh;
      if (kmh > topSpeed) topSpeed = kmh;
      const absOff = Math.abs(kart.offset);
      if (absOff > maxAbsOffset) maxAbsOffset = absOff;
      if (absOff > TRACK_HALF_WIDTH) offAsphalt++;
      const touching = absOff >= KART_LATERAL_LIMIT - 1e-3;
      if (kart.impact > 0.5 && !inContact) {
        wallHits++;
        if (kart.impact > hardestHit) hardestHit = kart.impact;
      }
      inContact = touching;

      const ev = stepLap(lap, kart.trackIdx, dt);
      if (ev !== LapEvent.None) gateEvents++;
      if (ev === LapEvent.Finish) finished = true;
    }

    if (traceEvery > 0 && t >= nextTrace) {
      nextTrace += traceEvery;
      trace.push([round(t), round(kart.x), round(kart.z), round(kart.speed * 3.6), lap.lap]);
    }
  }

  const wallMs = now() - started;
  return {
    driver: driver.kind,
    finished,
    lapsCompleted: lap.lapsCompleted,
    laps: lap.laps.map(round),
    bestLap: round(lap.bestLap),
    totalRaceTime: round(raceTime),
    simulatedTime: round(t),
    steps,
    wallMs: round(wallMs),
    speedup: Math.round((t * 1000) / Math.max(wallMs, 0.001)),
    topSpeedKmh: round(topSpeed),
    avgSpeedKmh: round(racingSteps ? speedSum / racingSteps : 0),
    wallHits,
    hardestHit: round(hardestHit),
    offAsphaltRatio: round(racingSteps ? offAsphalt / racingSteps : 0),
    maxAbsOffset: round(maxAbsOffset),
    maxIndexJump,
    gateEvents,
    nonFinite,
    trace,
  };
}

/** Pass/fail rules every build of the race must satisfy. */
export function checkInvariants(r: SimResult): string[] {
  const fail: string[] = [];
  if (r.nonFinite) fail.push('kart state became non-finite');
  if (r.maxAbsOffset > KART_LATERAL_LIMIT + 0.01) fail.push(`kart escaped the barriers (|offset| ${r.maxAbsOffset})`);
  if (r.maxIndexJump > 12) fail.push(`track index jumped ${r.maxIndexJump} samples in one step`);
  if (r.driver === 'autopilot') {
    if (!r.finished) fail.push(`autopilot did not finish ${LAP_COUNT} laps (completed ${r.lapsCompleted})`);
    if (r.laps.some((l) => l > 0 && l < 20)) fail.push(`implausibly short lap ${r.laps.join(', ')}`);
  }
  if (r.driver === 'wrong-way' && r.lapsCompleted > 0) fail.push('wrong-way driving completed a lap');
  if (r.driver === 'teleport-cheat' && r.laps[0] > 0 && r.laps[0] < 20) fail.push('teleport shortcut counted a lap');
  return fail;
}

function drive(driver: DriverSpec, kart: KartState, input: KartInput, tuning: AutopilotTuning): void {
  switch (driver.kind) {
    case 'constant':
      input.throttle = driver.throttle;
      input.brake = driver.brake;
      input.steer = driver.steer;
      return;
    case 'autopilot':
    case 'teleport-cheat':
      computeAutopilot(kart, input, tuning);
      return;
    case 'wrong-way':
      computeAutopilot(kart, input, tuning, -1);
      return;
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
