import { createSystem, Entity, Euler, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { Dashboard, Kart, KartControls, SteeringWheel } from '../race-components.js';
import { CURB_DRAG_FROM } from '../sim/kart-physics.js';
import { lateralOffset } from '../track.js';
import { type EntityRef, trackSingle } from './query-refs.js';

const MAX_WHEEL_YAW = 0.45;
const IMPACT_DECAY = 2.2;
/** Peak sprung-body motion on a hard hit: small enough to read as a jolt, not a lurch. */
const IMPACT_LIFT = 0.022;
const IMPACT_ROLL = 0.025;
const CURB_RUMBLE = 0.004;
const SPEED_BUZZ = 0.0012;

/** A cockpit part that rides on the sprung body; `base` is its rest position. */
class Mount {
  entity: Entity | undefined;
  readonly base = new Vector3();
}

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
  private kartRef!: EntityRef;
  private wheelRef!: EntityRef;
  private dashRef!: EntityRef;
  private readonly wheelMount = new Mount();
  private readonly dashMount = new Mount();
  private body: Object3D | null = null;
  private steerPivots: Object3D[] = [];
  private spinPivots: Object3D[] = [];
  private spinRadii: number[] = [];
  private shake = 0;
  private time = 0;
  private readonly offset = new Vector3();
  private readonly euler = new Euler();
  private readonly quat = new Quaternion();

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
    this.wheelRef = trackSingle(this.queries.wheel, this.cleanupFuncs);
    this.dashRef = trackSingle(this.queries.dash, this.cleanupFuncs);
  }

  update(delta: number): void {
    const kart = this.kartRef.current;
    const obj = kart?.object3D;
    if (!kart || !obj) return;
    if (!this.body) this.bind(obj);
    const dt = Math.min(delta, 0.05);
    this.time += dt;

    const speed = kart.getValue(Kart, 'speed')!;
    const steer = kart.getValue(KartControls, 'steer')!;
    const yaw = -steer * MAX_WHEEL_YAW;
    for (let i = 0; i < this.steerPivots.length; i++) this.steerPivots[i].rotation.y = yaw;
    for (let i = 0; i < this.spinPivots.length; i++) this.spinPivots[i].rotation.x -= (speed / this.spinRadii[i]) * dt;

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
    this.ride(this.wheelMount, this.wheelRef.current);
    this.ride(this.dashMount, this.dashRef.current);
  }

  private ride(mount: Mount, entity: Entity | undefined): void {
    const o = entity?.object3D;
    if (!o) return;
    if (mount.entity !== entity) {
      mount.entity = entity;
      mount.base.copy(o.position);
    }
    o.position.copy(mount.base).applyQuaternion(this.quat).add(this.offset);
  }

  private bind(obj: Object3D): void {
    this.body = obj.getObjectByName('Body') ?? null;
    obj.traverse((child) => {
      if (child.name.startsWith('WheelSteer-F')) this.steerPivots.push(child);
      if (child.name.startsWith('WheelSpin-')) {
        this.spinPivots.push(child);
        this.spinRadii.push(child.userData.radius as number);
      }
    });
  }
}
