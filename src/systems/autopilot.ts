import { createSystem, Entity } from '@iwsdk/core';
import { Kart, KartControls } from '../race-components.js';
import { computeAutopilot } from '../sim/autopilot-driver.js';
import { createKartState, type KartInput } from '../sim/kart-physics.js';

/**
 * Attract-mode driver, registered only when the URL contains `?autopilot`.
 * Runs the same pure-pursuit driver as the headless simulator; overwrites
 * KartControls after KartInputSystem.
 */
export class AutopilotSystem extends createSystem({
  kart: { required: [Kart, KartControls] },
}) {
  private state = createKartState();
  private out: KartInput = { throttle: 0, brake: 0, steer: 0 };

  update(): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!kart || !obj) return;
    const s = this.state;
    s.x = obj.position.x;
    s.z = obj.position.z;
    s.yaw = kart.getValue(Kart, 'yaw')!;
    s.speed = kart.getValue(Kart, 'speed')!;
    s.trackIdx = kart.getValue(Kart, 'trackIdx')!;
    computeAutopilot(s, this.out);
    kart.setValue(KartControls, 'steer', this.out.steer);
    kart.setValue(KartControls, 'throttle', this.out.throttle);
    kart.setValue(KartControls, 'brake', this.out.brake);
  }
}
