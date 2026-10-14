import { createSystem, Entity } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { GATE_INDICES, LAP_COUNT, SAMPLE_COUNT } from '../track.js';

const LAP_FIELDS = ['lap1', 'lap2', 'lap3'] as const;

/**
 * Gates are centerline sample indices, passed in order 0 -> 1 -> 2 -> 3 -> 0.
 * Only small forward moves count, so teleports and shortcuts never complete a lap.
 */
export class LapSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  private prevIdx = -1;

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;
    const idx = kart.getValue(Kart, 'trackIdx')!;
    const phase = kart.getValue(RaceState, 'phase');
    if (phase !== RacePhase.Racing) {
      this.prevIdx = idx;
      return;
    }
    kart.setValue(RaceState, 'lapTime', kart.getValue(RaceState, 'lapTime')! + delta);

    const prev = this.prevIdx;
    this.prevIdx = idx;
    if (prev < 0 || idx < 0) return;
    const moved = (idx - prev + SAMPLE_COUNT) % SAMPLE_COUNT;
    if (moved === 0 || moved > SAMPLE_COUNT / 4) return;

    const next = kart.getValue(RaceState, 'nextGate')!;
    const gate = GATE_INDICES[next];
    const toGate = (gate - prev + SAMPLE_COUNT) % SAMPLE_COUNT;
    if (toGate === 0 || toGate > moved) return;

    if (next === 0) {
      if (kart.getValue(RaceState, 'lapArmed')) this.completeLap(kart);
      kart.setValue(RaceState, 'lapArmed', true);
    }
    kart.setValue(RaceState, 'nextGate', (next + 1) % GATE_INDICES.length);
  }

  private completeLap(kart: Entity): void {
    const time = kart.getValue(RaceState, 'lapTime')!;
    const best = kart.getValue(RaceState, 'bestLap')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')! + 1;
    kart.setValue(RaceState, 'lastLap', time);
    kart.setValue(RaceState, 'delta', best < 0 ? 0 : time - best);
    if (best < 0 || time < best) {
      kart.setValue(RaceState, 'bestLap', time);
      kart.setValue(RaceState, 'bestVersion', kart.getValue(RaceState, 'bestVersion')! + 1);
    }
    if (done <= LAP_FIELDS.length) kart.setValue(RaceState, LAP_FIELDS[done - 1], time);
    kart.setValue(RaceState, 'lapsCompleted', done);
    kart.setValue(RaceState, 'lapTime', 0);
    if (done >= LAP_COUNT) {
      kart.setValue(RaceState, 'phase', RacePhase.Finished);
    } else {
      kart.setValue(RaceState, 'lap', done + 1);
    }
  }
}
