import { GATE_INDICES, LAP_COUNT, SAMPLE_COUNT } from '../track.js';

/**
 * Pure lap/gate bookkeeping shared by LapSystem and the headless simulator.
 * Gates are centerline sample indices passed in order 0 -> 1 -> 2 -> 3 -> 0.
 * Only small forward moves count, so teleports and shortcuts never complete a lap.
 */

export interface LapState {
  lap: number;
  lapsCompleted: number;
  lapTime: number;
  lastLap: number;
  bestLap: number;
  bestVersion: number;
  delta: number;
  nextGate: number;
  lapArmed: boolean;
  /** Per-lap times, -1 until set. Length LAP_COUNT. */
  laps: number[];
  /** Track index seen on the previous step, -1 when unknown. */
  prevIdx: number;
}

export enum LapEvent {
  None = 0,
  Gate = 1,
  Lap = 2,
  Finish = 3,
}

export function createLapState(): LapState {
  return {
    lap: 1,
    lapsCompleted: 0,
    lapTime: 0,
    lastLap: -1,
    bestLap: -1,
    bestVersion: 0,
    delta: 0,
    nextGate: 0,
    lapArmed: false,
    laps: new Array(LAP_COUNT).fill(-1),
    prevIdx: -1,
  };
}

/** Back to lap 1; the session best (and its version) survive restarts. */
export function resetLapState(s: LapState): void {
  s.lap = 1;
  s.lapsCompleted = 0;
  s.lapTime = 0;
  s.lastLap = -1;
  s.delta = 0;
  s.nextGate = 0;
  s.lapArmed = false;
  s.laps.fill(-1);
  s.prevIdx = -1;
}

/** Call only while racing. `idx` is the kart's current nearest sample. */
export function stepLap(s: LapState, idx: number, dt: number): LapEvent {
  s.lapTime += dt;
  const prev = s.prevIdx;
  s.prevIdx = idx;
  if (prev < 0 || idx < 0) return LapEvent.None;
  const moved = (idx - prev + SAMPLE_COUNT) % SAMPLE_COUNT;
  if (moved === 0 || moved > SAMPLE_COUNT / 4) return LapEvent.None;

  const gate = GATE_INDICES[s.nextGate];
  const toGate = (gate - prev + SAMPLE_COUNT) % SAMPLE_COUNT;
  if (toGate === 0 || toGate > moved) return LapEvent.None;

  let event = LapEvent.Gate;
  if (s.nextGate === 0) {
    if (s.lapArmed) event = completeLap(s);
    s.lapArmed = true;
  }
  s.nextGate = (s.nextGate + 1) % GATE_INDICES.length;
  return event;
}

function completeLap(s: LapState): LapEvent {
  const time = s.lapTime;
  const done = s.lapsCompleted + 1;
  s.lastLap = time;
  s.delta = s.bestLap < 0 ? 0 : time - s.bestLap;
  if (s.bestLap < 0 || time < s.bestLap) {
    s.bestLap = time;
    s.bestVersion++;
  }
  if (done <= s.laps.length) s.laps[done - 1] = time;
  s.lapsCompleted = done;
  s.lapTime = 0;
  if (done >= LAP_COUNT) return LapEvent.Finish;
  s.lap = done + 1;
  return LapEvent.Lap;
}
