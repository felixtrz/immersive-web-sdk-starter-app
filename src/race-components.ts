import { createComponent, Types } from '@iwsdk/core';

/** Player kart simulation state, written by KartDriveSystem. */
export const Kart = createComponent('Kart', {
  speed: { type: Types.Float32, default: 0 },
  velX: { type: Types.Float32, default: 0 },
  velZ: { type: Types.Float32, default: 0 },
  yaw: { type: Types.Float32, default: 0 },
  slip: { type: Types.Float32, default: 0 },
  impact: { type: Types.Float32, default: 0 },
  trackIdx: { type: Types.Int16, default: -1 },
  maxSpeed: { type: Types.Float32, default: 25 },
});

/** Normalized driver input, written by KartInputSystem. steer: -1 left .. 1 right. */
export const KartControls = createComponent('KartControls', {
  throttle: { type: Types.Float32, default: 0 },
  brake: { type: Types.Float32, default: 0 },
  steer: { type: Types.Float32, default: 0 },
  wheelGrabbed: { type: Types.Boolean, default: false },
});

export const RacePhase = {
  Idle: 'idle',
  Countdown: 'countdown',
  Racing: 'racing',
  Finished: 'finished',
} as const;

/** Race/lap state on the kart entity, written by RaceSystem and LapSystem. */
export const RaceState = createComponent('RaceState', {
  phase: { type: Types.Enum, enum: RacePhase, default: RacePhase.Idle },
  countdown: { type: Types.Float32, default: 0 },
  lap: { type: Types.Int8, default: 1 },
  lapsCompleted: { type: Types.Int8, default: 0 },
  lapTime: { type: Types.Float32, default: 0 },
  lastLap: { type: Types.Float32, default: -1 },
  bestLap: { type: Types.Float32, default: -1 },
  bestVersion: { type: Types.Int16, default: 0 },
  delta: { type: Types.Float32, default: 0 },
  nextGate: { type: Types.Int8, default: 0 },
  lapArmed: { type: Types.Boolean, default: false },
  lap1: { type: Types.Float32, default: -1 },
  lap2: { type: Types.Float32, default: -1 },
  lap3: { type: Types.Float32, default: -1 },
});

export const SteeringWheel = createComponent('SteeringWheel', {
  maxAngle: { type: Types.Float32, default: 1.57 },
  angle: { type: Types.Float32, default: 0 },
});

export const Ghost = createComponent('Ghost', {
  active: { type: Types.Boolean, default: false },
});

/** Tag for knockable traffic cones (paired with a Dynamic PhysicsBody). */
export const Cone = createComponent('Cone', {});

export const KartAudioState = createComponent('KartAudioState', {
  enginePitch: { type: Types.Float32, default: 1 },
  squealGain: { type: Types.Float32, default: 0 },
});

export const Dashboard = createComponent('Dashboard', {});
export const RacePanel = createComponent('RacePanel', {});
