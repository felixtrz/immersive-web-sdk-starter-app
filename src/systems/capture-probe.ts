import { createSystem, Entity } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { computeAutopilot } from '../sim/autopilot-driver.js';
import { createKartState, DriveMode, type KartInput, stepKart } from '../sim/kart-physics.js';
import { createLapState, LapEvent, stepLap } from '../sim/lap-tracker.js';
import { lateralOffset } from '../track.js';

const LAP_FIELDS = ['lap1', 'lap2', 'lap3'] as const;
const SIM_DT = 1 / 90;

/**
 * Automation hooks for capture/judging, registered only with `?capture`.
 * - `window.__race()` returns a plain snapshot of the kart and race state.
 * - `window.__fastForward(maxSeconds)` steps the shared pure race sim
 *   (autopilot + physics + laps) synchronously from the live state until the
 *   race finishes, then writes the result back, so automation does not have to
 *   wait minutes of real time on a software renderer.
 */
export class CaptureProbeSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  init(): void {
    const kartEntity = () => this.queries.kart.entities.values().next().value as Entity | undefined;

    const snapshot = () => {
      const kart = kartEntity();
      const obj = kart?.object3D;
      if (!kart || !obj) return null;
      const idx = kart.getValue(Kart, 'trackIdx')!;
      return {
        phase: kart.getValue(RaceState, 'phase'),
        speedKmh: Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6),
        lap: kart.getValue(RaceState, 'lap'),
        lapsCompleted: kart.getValue(RaceState, 'lapsCompleted'),
        lapTime: kart.getValue(RaceState, 'lapTime'),
        laps: LAP_FIELDS.map((f) => kart.getValue(RaceState, f)),
        bestLap: kart.getValue(RaceState, 'bestLap'),
        trackIdx: idx,
        lateral: idx >= 0 ? lateralOffset(idx, obj.position.x, obj.position.z) : null,
        slip: kart.getValue(Kart, 'slip'),
        impact: kart.getValue(Kart, 'impact'),
        cameraMode: (this.globals.cameraMode as (() => string) | undefined)?.() ?? 'cockpit',
      };
    };

    const fastForward = (maxSeconds = 300, untilLap = Number.POSITIVE_INFINITY) => {
      const kart = kartEntity();
      const obj = kart?.object3D;
      if (!kart || !obj || kart.getValue(RaceState, 'phase') !== RacePhase.Racing) return snapshot();

      const k = createKartState();
      k.x = obj.position.x;
      k.z = obj.position.z;
      k.yaw = kart.getValue(Kart, 'yaw')!;
      k.vx = kart.getValue(Kart, 'velX')!;
      k.vz = kart.getValue(Kart, 'velZ')!;
      k.speed = kart.getValue(Kart, 'speed')!;
      k.trackIdx = kart.getValue(Kart, 'trackIdx')!;
      const maxSpeed = kart.getValue(Kart, 'maxSpeed')!;

      const lap = createLapState();
      lap.lap = kart.getValue(RaceState, 'lap')!;
      lap.lapsCompleted = kart.getValue(RaceState, 'lapsCompleted')!;
      lap.lapTime = kart.getValue(RaceState, 'lapTime')!;
      lap.bestLap = kart.getValue(RaceState, 'bestLap')!;
      lap.bestVersion = kart.getValue(RaceState, 'bestVersion')!;
      lap.nextGate = kart.getValue(RaceState, 'nextGate')!;
      lap.lapArmed = kart.getValue(RaceState, 'lapArmed')!;
      lap.prevIdx = k.trackIdx;
      for (let i = 0; i < LAP_FIELDS.length; i++) lap.laps[i] = kart.getValue(RaceState, LAP_FIELDS[i])!;

      const input: KartInput = { throttle: 0, brake: 0, steer: 0 };
      let finished = false;
      for (let t = 0; t < maxSeconds && !finished && lap.lap < untilLap; t += SIM_DT) {
        computeAutopilot(k, input);
        stepKart(k, input, SIM_DT, DriveMode.Racing, maxSpeed);
        finished = stepLap(lap, k.trackIdx, SIM_DT) === LapEvent.Finish;
      }

      obj.position.set(k.x, 0, k.z);
      obj.rotation.set(0, k.yaw, 0);
      kart.setValue(Kart, 'yaw', k.yaw);
      kart.setValue(Kart, 'velX', k.vx);
      kart.setValue(Kart, 'velZ', k.vz);
      kart.setValue(Kart, 'speed', k.speed);
      kart.setValue(Kart, 'trackIdx', k.trackIdx);
      kart.setValue(RaceState, 'lap', lap.lap);
      kart.setValue(RaceState, 'lapsCompleted', lap.lapsCompleted);
      kart.setValue(RaceState, 'lapTime', lap.lapTime);
      kart.setValue(RaceState, 'lastLap', lap.lastLap);
      kart.setValue(RaceState, 'delta', lap.delta);
      kart.setValue(RaceState, 'bestLap', lap.bestLap);
      kart.setValue(RaceState, 'bestVersion', lap.bestVersion);
      kart.setValue(RaceState, 'nextGate', lap.nextGate);
      kart.setValue(RaceState, 'lapArmed', lap.lapArmed);
      for (let i = 0; i < LAP_FIELDS.length; i++) kart.setValue(RaceState, LAP_FIELDS[i], lap.laps[i]);
      if (finished) kart.setValue(RaceState, 'phase', RacePhase.Finished);
      return snapshot();
    };

    const w = window as unknown as { __race: typeof snapshot; __fastForward: typeof fastForward };
    w.__race = snapshot;
    w.__fastForward = fastForward;
  }
}
