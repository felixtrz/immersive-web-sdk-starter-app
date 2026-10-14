import { createSystem, Entity, PhysicsBody, PhysicsManipulation } from '@iwsdk/core';
import { Cone, Kart, KartControls, RacePhase, RaceState } from '../race-components.js';
import { KART_LATERAL_LIMIT, lateralOffset, NORMAL_X, NORMAL_Z, nearestSample, SPAWN } from '../track.js';

const ACCEL = 13;
const BRAKE = 24;
const REVERSE_ACCEL = 6;
const MAX_REVERSE = 6;
const ROLL_DRAG = 0.25;
const COAST_DRAG = 1.2;
const GRIP = 7;
const MAX_YAW_RATE = 2.0;
const WALL_RESTITUTION = 0.3;
const WALL_SCRUB = 0.8;
const CONE_RADIUS = 1.0;

/**
 * Arcade kart integrator. Writes the kart object3D pose directly, resolves
 * barrier contact against the track's lateral limit and knocks cones (Havok
 * Dynamic bodies) by handing them a velocity through PhysicsManipulation.
 */
export class KartDriveSystem extends createSystem({
  kart: { required: [Kart, KartControls, RaceState] },
  cones: { required: [Cone, PhysicsBody] },
}) {
  private coneVel: [number, number, number] = [0, 0, 0];

  init(): void {
    this.queries.kart.subscribe('qualify', (entity) => {
      const obj = entity.object3D;
      if (!obj) return;
      obj.position.set(SPAWN.x, 0, SPAWN.z);
      obj.rotation.set(0, SPAWN.yaw, 0);
      entity.setValue(Kart, 'yaw', SPAWN.yaw);
    }, true);
  }

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!kart || !obj) return;
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;

    const phase = kart.getValue(RaceState, 'phase');
    const racing = phase === RacePhase.Racing;
    const finished = phase === RacePhase.Finished;
    const throttle = racing ? kart.getValue(KartControls, 'throttle')! : 0;
    const brake = racing ? kart.getValue(KartControls, 'brake')! : finished ? 0.4 : 0;
    const steer = racing || finished ? kart.getValue(KartControls, 'steer')! : 0;
    const maxSpeed = kart.getValue(Kart, 'maxSpeed')!;

    let yaw = kart.getValue(Kart, 'yaw')!;
    let vx = kart.getValue(Kart, 'velX')!;
    let vz = kart.getValue(Kart, 'velZ')!;
    if (!racing && !finished) {
      vx = 0;
      vz = 0;
    }

    let fx = -Math.sin(yaw);
    let fz = -Math.cos(yaw);
    let rx = Math.cos(yaw);
    let rz = -Math.sin(yaw);
    let fwd = vx * fx + vz * fz;
    let lat = vx * rx + vz * rz;

    if (throttle > 0) fwd += throttle * ACCEL * Math.max(0, 1 - fwd / maxSpeed) * dt;
    if (brake > 0) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - brake * BRAKE * dt);
      else fwd = Math.max(-MAX_REVERSE, fwd - brake * REVERSE_ACCEL * dt);
    }
    fwd -= fwd * (throttle > 0 ? ROLL_DRAG * 0.2 : ROLL_DRAG) * dt;
    if (throttle === 0 && brake === 0) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), COAST_DRAG * dt);

    const speedFactor = Math.min(1, Math.abs(fwd) / 5) * (1 - 0.4 * Math.min(1, Math.abs(fwd) / maxSpeed));
    const yawRate = steer * MAX_YAW_RATE * speedFactor * Math.sign(fwd);
    yaw -= yawRate * dt;
    // Turning slings velocity sideways a little; grip pulls it back -> light drift.
    lat += fwd * yawRate * dt * 0.35;
    lat *= Math.exp(-GRIP * dt);

    fx = -Math.sin(yaw);
    fz = -Math.cos(yaw);
    rx = Math.cos(yaw);
    rz = -Math.sin(yaw);
    vx = fx * fwd + rx * lat;
    vz = fz * fwd + rz * lat;

    let x = obj.position.x + vx * dt;
    let z = obj.position.z + vz * dt;

    // Barrier contact.
    let impact = 0;
    const idx = nearestSample(x, z, kart.getValue(Kart, 'trackIdx')!);
    const off = lateralOffset(idx, x, z);
    if (Math.abs(off) > KART_LATERAL_LIMIT) {
      const s = Math.sign(off);
      const nx = NORMAL_X[idx] * s;
      const nz = NORMAL_Z[idx] * s;
      const push = Math.abs(off) - KART_LATERAL_LIMIT;
      x -= nx * push;
      z -= nz * push;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        vx -= (1 + WALL_RESTITUTION) * vn * nx;
        vz -= (1 + WALL_RESTITUTION) * vn * nz;
        vx *= WALL_SCRUB;
        vz *= WALL_SCRUB;
        impact = vn;
      }
    }

    // Cones.
    for (const cone of this.queries.cones.entities) {
      const co = cone.object3D;
      if (!co || cone.hasComponent(PhysicsManipulation)) continue;
      const dx = co.position.x - x;
      const dz = co.position.z - z;
      if (dx * dx + dz * dz < CONE_RADIUS * CONE_RADIUS && co.position.y < 0.6) {
        this.coneVel[0] = vx * 1.2 + dx * 2;
        this.coneVel[1] = 3 + Math.hypot(vx, vz) * 0.15;
        this.coneVel[2] = vz * 1.2 + dz * 2;
        cone.addComponent(PhysicsManipulation, { linearVelocity: this.coneVel });
        vx *= 0.95;
        vz *= 0.95;
        impact = Math.max(impact, 1.5);
      }
    }

    obj.position.set(x, 0, z);
    obj.rotation.set(0, yaw, 0);
    kart.setValue(Kart, 'yaw', yaw);
    kart.setValue(Kart, 'velX', vx);
    kart.setValue(Kart, 'velZ', vz);
    kart.setValue(Kart, 'speed', vx * fx + vz * fz);
    kart.setValue(Kart, 'slip', Math.abs(vx * rx + vz * rz));
    kart.setValue(Kart, 'impact', impact);
    kart.setValue(Kart, 'trackIdx', idx);
  }
}
