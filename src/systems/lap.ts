import { createSystem, Entity } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { createLapState, LapEvent, stepLap } from '../sim/lap-tracker.js';

const LAP_FIELDS = ['lap1', 'lap2', 'lap3'] as const;

/** Bridges the pure lap tracker (src/sim/lap-tracker.ts) into RaceState. */
export class LapSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  private state = createLapState();

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;
    const idx = kart.getValue(Kart, 'trackIdx')!;
    const s = this.state;
    if (kart.getValue(RaceState, 'phase') !== RacePhase.Racing) {
      s.prevIdx = idx;
      return;
    }

    // RaceSystem.restart() resets RaceState directly; mirror it in.
    s.lap = kart.getValue(RaceState, 'lap')!;
    s.lapsCompleted = kart.getValue(RaceState, 'lapsCompleted')!;
    s.lapTime = kart.getValue(RaceState, 'lapTime')!;
    s.bestLap = kart.getValue(RaceState, 'bestLap')!;
    s.bestVersion = kart.getValue(RaceState, 'bestVersion')!;
    s.nextGate = kart.getValue(RaceState, 'nextGate')!;
    s.lapArmed = kart.getValue(RaceState, 'lapArmed')!;
    for (let i = 0; i < LAP_FIELDS.length; i++) s.laps[i] = kart.getValue(RaceState, LAP_FIELDS[i])!;

    const event = stepLap(s, idx, delta);

    kart.setValue(RaceState, 'lapTime', s.lapTime);
    kart.setValue(RaceState, 'nextGate', s.nextGate);
    kart.setValue(RaceState, 'lapArmed', s.lapArmed);
    if (event === LapEvent.Lap || event === LapEvent.Finish) {
      kart.setValue(RaceState, 'lap', s.lap);
      kart.setValue(RaceState, 'lapsCompleted', s.lapsCompleted);
      kart.setValue(RaceState, 'lastLap', s.lastLap);
      kart.setValue(RaceState, 'delta', s.delta);
      kart.setValue(RaceState, 'bestLap', s.bestLap);
      kart.setValue(RaceState, 'bestVersion', s.bestVersion);
      for (let i = 0; i < LAP_FIELDS.length; i++) kart.setValue(RaceState, LAP_FIELDS[i], s.laps[i]);
      if (event === LapEvent.Finish) kart.setValue(RaceState, 'phase', RacePhase.Finished);
    }
  }
}
