import { KART_LATERAL_LIMIT, lateralOffset, NORMAL_X, NORMAL_Z, nearestSample, SPAWN } from '../track.js';

/**
 * Pure arcade kart integrator, shared by KartDriveSystem (rendered game) and
 * the headless race simulator. No DOM, no Three, no ECS: mutates plain state.
 */

export const ACCEL = 13;
export const BRAKE = 24;
export const REVERSE_ACCEL = 6;
export const MAX_REVERSE = 6;
export const ROLL_DRAG = 0.25;
export const COAST_DRAG = 1.2;
export const GRIP = 7;
export const MAX_YAW_RATE = 2.0;
export const WALL_RESTITUTION = 0.3;
export const WALL_SCRUB = 0.8;
export const DEFAULT_MAX_SPEED = 25;
/** Largest step the integrator accepts; larger frame deltas are clamped. */
export const MAX_STEP = 0.05;

export interface KartState {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  /** Signed forward speed, m/s. */
  speed: number;
  /** Magnitude of sideways velocity, m/s. */
  slip: number;
  /** Normal speed into the barrier on the last step (0 when no contact). */
  impact: number;
  /** Nearest centerline sample, -1 before the first step. */
  trackIdx: number;
  /** Signed lateral offset from the centerline at `trackIdx`. */
  offset: number;
}

export interface KartInput {
  throttle: number;
  brake: number;
  steer: number;
}

/** How the race phase gates the controls. */
export enum DriveMode {
  /** Idle / countdown: kart is held on the grid. */
  Locked = 0,
  Racing = 1,
  /** After the flag: throttle cut, light auto-brake, steering kept. */
  Finished = 2,
}

export function createKartState(): KartState {
  const s: KartState = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, slip: 0, impact: 0, trackIdx: -1, offset: 0 };
  resetKartState(s);
  return s;
}

export function resetKartState(s: KartState): void {
  s.x = SPAWN.x;
  s.z = SPAWN.z;
  s.yaw = SPAWN.yaw;
  s.vx = 0;
  s.vz = 0;
  s.speed = 0;
  s.slip = 0;
  s.impact = 0;
  s.trackIdx = -1;
  s.offset = 0;
}

export function stepKart(s: KartState, input: KartInput, dt: number, mode: DriveMode, maxSpeed = DEFAULT_MAX_SPEED): void {
  if (dt <= 0) return;
  dt = Math.min(dt, MAX_STEP);
  const racing = mode === DriveMode.Racing;
  const finished = mode === DriveMode.Finished;
  const throttle = racing ? input.throttle : 0;
  const brake = racing ? input.brake : finished ? 0.4 : 0;
  const steer = racing || finished ? input.steer : 0;

  let yaw = s.yaw;
  let vx = s.vx;
  let vz = s.vz;
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

  let x = s.x + vx * dt;
  let z = s.z + vz * dt;

  let impact = 0;
  const idx = nearestSample(x, z, s.trackIdx);
  let off = lateralOffset(idx, x, z);
  if (Math.abs(off) > KART_LATERAL_LIMIT) {
    const sign = Math.sign(off);
    const nx = NORMAL_X[idx] * sign;
    const nz = NORMAL_Z[idx] * sign;
    const push = Math.abs(off) - KART_LATERAL_LIMIT;
    x -= nx * push;
    z -= nz * push;
    off = sign * KART_LATERAL_LIMIT;
    const vn = vx * nx + vz * nz;
    if (vn > 0) {
      vx -= (1 + WALL_RESTITUTION) * vn * nx;
      vz -= (1 + WALL_RESTITUTION) * vn * nz;
      vx *= WALL_SCRUB;
      vz *= WALL_SCRUB;
      impact = vn;
    }
  }

  s.x = x;
  s.z = z;
  s.yaw = yaw;
  s.vx = vx;
  s.vz = vz;
  s.speed = vx * fx + vz * fz;
  s.slip = Math.abs(vx * rx + vz * rz);
  s.impact = impact;
  s.trackIdx = idx;
  s.offset = off;
}
