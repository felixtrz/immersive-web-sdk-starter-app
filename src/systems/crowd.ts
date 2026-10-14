import { createSystem, InstancedMesh, Object3D, Vector3 } from '@iwsdk/core';
import { Kart } from '../race-components.js';
import { type EntityRef, trackSingle } from './query-refs.js';

const EXCITE_RADIUS = 45;

/**
 * Animates the grandstand crowd baked into the track asset: idle bobbing and
 * swaying for everyone, building into jumping when the kart passes the stand.
 * Writes instance translations in place; nothing is allocated per frame.
 */
export class CrowdSystem extends createSystem({
  kart: { required: [Kart] },
}) {
  private crowd: InstancedMesh | null = null;
  private base: Float32Array | null = null;
  private phase: Float32Array | null = null;
  private rate: Float32Array | null = null;
  private center = new Vector3();
  private time = 0;
  private excitement = 0;
  private kartRef!: EntityRef;

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
  }

  update(delta: number): void {
    if (!this.crowd && !this.findCrowd()) return;
    const crowd = this.crowd!;
    const base = this.base!;
    const phase = this.phase!;
    const rate = this.rate!;
    const dt = Math.min(delta, 0.05);
    this.time += dt;

    const kart = this.kartRef.current;
    let target = 0;
    if (kart?.object3D) {
      const d = Math.hypot(kart.object3D.position.x - this.center.x, kart.object3D.position.z - this.center.z);
      target = Math.max(0, 1 - d / EXCITE_RADIUS);
    }
    this.excitement += (target - this.excitement) * Math.min(1, dt * (target > this.excitement ? 4 : 0.8));

    const arr = crowd.instanceMatrix.array as Float32Array;
    const t = this.time;
    const ex = this.excitement;
    for (let i = 0; i < crowd.count; i++) {
      const o = i * 16;
      const w = t * rate[i] + phase[i];
      const idle = Math.sin(w) * 0.03;
      const jump = Math.max(0, Math.sin(w * 2.2)) * 0.35 * ex;
      arr[o + 12] = base[o + 12] + Math.sin(w * 0.5) * 0.04;
      arr[o + 13] = base[o + 13] + idle + jump;
      arr[o + 5] = base[o + 5] * (1 + Math.sin(w * 1.3) * 0.04 + ex * 0.06);
    }
    crowd.instanceMatrix.needsUpdate = true;
  }

  private findCrowd(): boolean {
    let found: Object3D | undefined;
    this.scene.traverse((o) => {
      if (!found && o.name === 'Crowd' && (o as InstancedMesh).isInstancedMesh) found = o;
    });
    if (!found) return false;
    const crowd = found as InstancedMesh;
    crowd.frustumCulled = false;
    crowd.getWorldPosition(this.center);
    this.crowd = crowd;
    this.base = (crowd.instanceMatrix.array as Float32Array).slice();
    this.phase = new Float32Array(crowd.count);
    this.rate = new Float32Array(crowd.count);
    for (let i = 0; i < crowd.count; i++) {
      const h = Math.sin(i * 12.9898) * 43758.5453;
      const r = h - Math.floor(h);
      this.phase[i] = r * Math.PI * 2;
      this.rate[i] = 2.2 + r * 1.6;
    }
    return true;
  }
}
