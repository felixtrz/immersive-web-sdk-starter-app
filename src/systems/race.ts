import { createSystem, Entity, InputComponent } from '@iwsdk/core';
import { Kart, KartControls, RacePhase, RaceState } from '../race-components.js';
import { SPAWN } from '../track.js';

export const COUNTDOWN_SECONDS = 3;

/** Race phase machine: idle -> countdown -> racing (LapSystem ends it) -> finished. */
export class RaceSystem extends createSystem({
  kart: { required: [Kart, KartControls, RaceState] },
}) {
  init(): void {
    this.globals.restartRace = () => this.restart();
  }

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;
    const phase = kart.getValue(RaceState, 'phase');
    const kb = this.input.keyboard;
    const restartPressed =
      kb.getKeyDown('KeyR') || (this.input.xr.gamepads.right?.getButtonDown(InputComponent.A_Button) ?? false);
    if (restartPressed) {
      this.restart();
      return;
    }
    if (phase === RacePhase.Idle) {
      const go = kart.getValue(KartControls, 'throttle')! > 0.1 || kb.getKeyDown('Enter');
      if (go) {
        kart.setValue(RaceState, 'phase', RacePhase.Countdown);
        kart.setValue(RaceState, 'countdown', COUNTDOWN_SECONDS);
      }
    } else if (phase === RacePhase.Countdown) {
      const t = kart.getValue(RaceState, 'countdown')! - delta;
      if (t <= 0) {
        kart.setValue(RaceState, 'countdown', 0);
        kart.setValue(RaceState, 'phase', RacePhase.Racing);
      } else {
        kart.setValue(RaceState, 'countdown', t);
      }
    }
  }

  /** Back to the grid; the session best lap and its ghost are kept. */
  restart(): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart?.object3D) return;
    kart.object3D.position.set(SPAWN.x, 0, SPAWN.z);
    kart.object3D.rotation.set(0, SPAWN.yaw, 0);
    kart.setValue(Kart, 'yaw', SPAWN.yaw);
    kart.setValue(Kart, 'velX', 0);
    kart.setValue(Kart, 'velZ', 0);
    kart.setValue(Kart, 'speed', 0);
    kart.setValue(Kart, 'trackIdx', -1);
    kart.setValue(RaceState, 'phase', RacePhase.Idle);
    kart.setValue(RaceState, 'countdown', 0);
    kart.setValue(RaceState, 'lap', 1);
    kart.setValue(RaceState, 'lapsCompleted', 0);
    kart.setValue(RaceState, 'lapTime', 0);
    kart.setValue(RaceState, 'lastLap', -1);
    kart.setValue(RaceState, 'delta', 0);
    kart.setValue(RaceState, 'nextGate', 0);
    kart.setValue(RaceState, 'lapArmed', false);
    kart.setValue(RaceState, 'lap1', -1);
    kart.setValue(RaceState, 'lap2', -1);
    kart.setValue(RaceState, 'lap3', -1);
  }
}
