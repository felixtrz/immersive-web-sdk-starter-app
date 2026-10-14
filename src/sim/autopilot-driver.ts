import { SAMPLE_COUNT, SAMPLE_X, SAMPLE_Z } from '../track.js';
import type { KartInput, KartState } from './kart-physics.js';

/** Pure-pursuit on the track centerline. Shared by AutopilotSystem and the simulator. */

export interface AutopilotTuning {
  baseLookahead: number;
  lookaheadPerMps: number;
  steerGain: number;
  cornerSpeed: number;
}

export const DEFAULT_AUTOPILOT: AutopilotTuning = {
  baseLookahead: 7,
  lookaheadPerMps: 0.45,
  steerGain: 2.2,
  cornerSpeed: 15,
};

/** `direction` -1 drives the circuit backwards (used to test lap anti-cheat). */
export function computeAutopilot(
  s: KartState,
  out: KartInput,
  tuning: AutopilotTuning = DEFAULT_AUTOPILOT,
  direction: 1 | -1 = 1,
): void {
  const px = s.x;
  const pz = s.z;
  const idx = s.trackIdx < 0 ? 0 : s.trackIdx;

  const lookahead = tuning.baseLookahead + Math.abs(s.speed) * tuning.lookaheadPerMps;
  let target = idx;
  for (let n = 0; n < SAMPLE_COUNT; n++) {
    target = (target + direction + SAMPLE_COUNT) % SAMPLE_COUNT;
    if (Math.hypot(SAMPLE_X[target] - px, SAMPLE_Z[target] - pz) >= lookahead) break;
  }

  const dx = SAMPLE_X[target] - px;
  const dz = SAMPLE_Z[target] - pz;
  const ahead = -Math.sin(s.yaw) * dx - Math.cos(s.yaw) * dz;
  const lateral = Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz;
  const steer = Math.max(-1, Math.min(1, tuning.steerGain * Math.atan2(lateral, Math.max(ahead, 0.1))));

  const cornering = Math.abs(steer) > 0.55 && s.speed > tuning.cornerSpeed;
  out.steer = steer;
  out.throttle = cornering ? 0.2 : 1;
  out.brake = cornering && Math.abs(steer) > 0.85 ? 0.5 : 0;
}
