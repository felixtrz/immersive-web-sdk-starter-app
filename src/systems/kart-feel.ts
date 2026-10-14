import { createSystem, Entity, Euler, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Dashboard, Kart, KartControls, SteeringWheel } from '../race-components.js';
import { CURB_DRAG_FROM } from '../sim/kart-physics.js';
import { lateralOffset } from '../track.js';

const MAX_WHEEL_YAW = 0.45;
const IMPACT_DECAY = 2.2;
/** Peak sprung-body motion on a hard hit: small enough to read as a jolt, not a lurch. */
const IMPACT_LIFT = 0.022;
const IMPACT_ROLL = 0.025;
const CURB_RUMBLE = 0.004;
const SPEED_BUZZ = 0.0012;

type Mounted = { obj: Object3D; base: Vector3 };

/**
 * Rolls and steers the wheels and shakes the sprung body (plus the dash and
 * steering wheel mounted to it). The player rig hangs off the kart root, not the
 * body, so in VR the car vibrates around the player while the head stays still.
 */
export class KartFeelSystem extends createSystem({
  kart: { required: [Kart, KartControls] },
  wheel: { required: [SteeringWheel] },
  dash: { required: [Dashboard] },
}) {
  private body: Object3D | null = null;
  private steerPivots: Object3D[] = [];
  private spinPivots: Object3D[] = [];
  private mounted = new Map<Entity, Mounted>();
  private shake = 0;
  private time = 0;
  private readonly offset = new Vector3();
  private readonly euler = new Euler();
  private readonly quat = new Quaternion();
  private readonly tmp = new Vector3();

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!kart || !obj) return;
    if (!this.body) this.bind(obj);
    const dt = Math.min(delta, 0.05);
    this.time += dt;

    const speed = kart.getValue(Kart, 'speed')!;
    const steer = kart.getValue(KartControls, 'steer')!;
    for (const pivot of this.steerPivots) pivot.rotation.y = -steer * MAX_WHEEL_YAW;
    for (const pivot of this.spinPivots) pivot.rotation.x -= (speed / (pivot.userData.radius as number)) * dt;

    const impact = kart.getValue(Kart, 'impact')!;
    if (impact > 0.5) this.shake = Math.min(1, Math.max(this.shake, impact / 4));
    this.shake = Math.max(0, this.shake - dt * IMPACT_DECAY);
    const speedT = Math.min(1, Math.abs(speed) / 25);
    const idx = kart.getValue(Kart, 'trackIdx')!;
    const onCurb =
      idx >= 0 && speedT > 0.15 && Math.abs(lateralOffset(idx, obj.position.x, obj.position.z)) > CURB_DRAG_FROM;

    const t = this.time;
    const hit = this.shake * this.shake;
    const rumble = onCurb ? CURB_RUMBLE * speedT : 0;
    const lift =
      Math.sin(t * 38) * hit * IMPACT_LIFT +
      Math.sin(t * 71) * rumble +
      Math.sin(t * 53) * SPEED_BUZZ * speedT;
    const roll = Math.sin(t * 29 + 1.3) * hit * IMPACT_ROLL + Math.sin(t * 64) * rumble * 1.5;
    const pitch = Math.sin(t * 33 + 0.7) * hit * IMPACT_ROLL * 0.6 + Math.sin(t * 47) * rumble;

    this.offset.set(0, lift, 0);
    this.euler.set(pitch, 0, roll);
    this.quat.setFromEuler(this.euler);
    if (this.body) {
      this.body.position.copy(this.offset);
      this.body.quaternion.copy(this.quat);
    }

    for (const entity of [...this.queries.wheel.entities, ...this.queries.dash.entities]) {
      const o = entity.object3D;
      if (!o) continue;
      let m = this.mounted.get(entity);
      if (!m) {
        m = { obj: o, base: o.position.clone() };
        this.mounted.set(entity, m);
      }
      o.position.copy(this.tmp.copy(m.base).applyQuaternion(this.quat).add(this.offset));
    }
  }

  private bind(obj: Object3D): void {
    this.body = obj.getObjectByName('Body') ?? null;
    obj.traverse((child) => {
      if (child.name.startsWith('WheelSteer-F')) this.steerPivots.push(child);
      if (child.name.startsWith('WheelSpin-')) this.spinPivots.push(child);
    });
  }
}
