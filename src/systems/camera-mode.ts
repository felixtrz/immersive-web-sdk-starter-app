import { createSystem, Entity, Object3D, Vector3, VisibilityState } from '@iwsdk/core';
import { Kart } from '../race-components.js';
import { CURB_DRAG_FROM } from '../sim/kart-physics.js';
import { lateralOffset, SAMPLE_COUNT, SAMPLE_X, SAMPLE_Z } from '../track.js';
import { BROWSER_EYE } from './cockpit-rig.js';

export const CameraMode = {
  Cockpit: 'cockpit',
  Chase: 'chase',
  Orbit: 'orbit',
  Overview: 'overview',
} as const;
export type CameraMode = (typeof CameraMode)[keyof typeof CameraMode];

const TOGGLE_ORDER: CameraMode[] = [CameraMode.Cockpit, CameraMode.Chase];
const CHASE_BACK = 5.2;
const CHASE_UP = 2.1;
const CHASE_FOLLOW_RATE = 7;
const ORBIT_RADIUS = 4.2;
const ORBIT_HEIGHT = 1.5;
const ORBIT_RATE = 0.35;
const SHAKE_AMPLITUDE = 0.12;

/**
 * Browser-only camera framing. `C` toggles cockpit/chase; `?cam=orbit|overview`
 * selects showcase framings used for captures. In XR the headset owns the camera.
 */
export class CameraModeSystem extends createSystem({
  kart: { required: [Kart] },
}) {
  private mode: CameraMode = CameraMode.Cockpit;
  private readonly desired = new Vector3();
  private readonly smoothed = new Vector3();
  private readonly target = new Vector3();
  private readonly local = new Vector3();
  private readonly overviewPos = new Vector3();
  private readonly overviewTarget = new Vector3();
  private hasSmoothed = false;
  private orbitAngle = 0.6;
  private shake = 0;
  private bobPhase = 0;
  private driver: Object3D | null = null;
  private baseFov = 50;

  init(): void {
    this.baseFov = this.camera.fov;
    const requested = new URLSearchParams(location.search).get('cam');
    if (requested && (Object.values(CameraMode) as string[]).includes(requested)) {
      this.mode = requested as CameraMode;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      minX = Math.min(minX, SAMPLE_X[i]);
      maxX = Math.max(maxX, SAMPLE_X[i]);
      minZ = Math.min(minZ, SAMPLE_Z[i]);
      maxZ = Math.max(maxZ, SAMPLE_Z[i]);
    }
    const span = Math.max(maxX - minX, maxZ - minZ);
    this.overviewTarget.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.overviewPos.set(this.overviewTarget.x, span * 0.75, this.overviewTarget.z + span * 0.7);
    this.globals.cameraMode = () => this.mode;
  }

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!kart || !obj) return;
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!this.driver) this.driver = obj.getObjectByName('Driver') ?? null;
    if (this.driver) this.driver.visible = !immersive && this.mode !== CameraMode.Cockpit;
    if (immersive) return;

    if (this.input.keyboard.getKeyDown('KeyC')) {
      const i = TOGGLE_ORDER.indexOf(this.mode);
      this.mode = TOGGLE_ORDER[(i + 1) % TOGGLE_ORDER.length];
      this.hasSmoothed = false;
    }

    const impact = kart.getValue(Kart, 'impact')!;
    if (impact > 0.5) this.shake = Math.min(1, Math.max(this.shake, impact / 4));
    this.shake = Math.max(0, this.shake - delta * 3);
    const jitter = this.shake * this.shake * SHAKE_AMPLITUDE;

    const cam = this.camera;
    // Desktop-only speed cue; never altered in XR, where FOV changes cause discomfort.
    const speedT = Math.min(1, Math.abs(kart.getValue(Kart, 'speed')!) / 25);
    const fov = this.baseFov + speedT * speedT * 9;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.mode === CameraMode.Cockpit) {
      this.bobPhase += Math.min(delta, 0.05) * (8 + speedT * 30);
      const idx = kart.getValue(Kart, 'trackIdx')!;
      const onCurb =
        idx >= 0 && speedT > 0.15 && Math.abs(lateralOffset(idx, obj.position.x, obj.position.z)) > CURB_DRAG_FROM;
      const bob = Math.sin(this.bobPhase) * 0.005 * speedT + (onCurb ? (Math.random() - 0.5) * 0.018 : 0);
      cam.position.set(
        (Math.random() - 0.5) * jitter,
        BROWSER_EYE.y + bob + (Math.random() - 0.5) * jitter,
        BROWSER_EYE.z,
      );
      cam.rotation.set(BROWSER_EYE.pitch + (Math.random() - 0.5) * jitter, 0, (Math.random() - 0.5) * jitter);
      return;
    }

    const yaw = kart.getValue(Kart, 'yaw')!;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const p = obj.position;

    if (this.mode === CameraMode.Chase) {
      this.desired.set(p.x - fx * CHASE_BACK, p.y + CHASE_UP, p.z - fz * CHASE_BACK);
      if (!this.hasSmoothed) {
        this.smoothed.copy(this.desired);
        this.hasSmoothed = true;
      } else {
        this.smoothed.lerp(this.desired, 1 - Math.exp(-CHASE_FOLLOW_RATE * Math.min(delta, 0.05)));
      }
      this.target.set(p.x + fx * 4, p.y + 0.6, p.z + fz * 4);
    } else if (this.mode === CameraMode.Orbit) {
      this.orbitAngle += ORBIT_RATE * Math.min(delta, 0.05);
      this.smoothed.set(
        p.x + Math.sin(this.orbitAngle) * ORBIT_RADIUS,
        p.y + ORBIT_HEIGHT,
        p.z + Math.cos(this.orbitAngle) * ORBIT_RADIUS,
      );
      this.target.set(p.x, p.y + 0.45, p.z);
    } else {
      this.smoothed.copy(this.overviewPos);
      this.target.copy(this.overviewTarget);
    }

    this.player.updateWorldMatrix(true, false);
    this.local.copy(this.smoothed);
    this.player.worldToLocal(this.local);
    cam.position.copy(this.local);
    cam.updateWorldMatrix(true, false);
    cam.lookAt(this.target);
  }
}
