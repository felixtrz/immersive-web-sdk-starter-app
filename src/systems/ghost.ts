import { createSystem } from '@iwsdk/core';
import { type EntityRef, trackSingle } from './query-refs.js';
import { Ghost, Kart, RacePhase, RaceState } from '../race-components.js';

const RATE = 30;
const MAX_SECONDS = 180;
const CAPACITY = RATE * MAX_SECONDS;

/** Records the current lap at 30 Hz into preallocated buffers; replays the best lap. */
export class GhostSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
  ghost: { required: [Ghost] },
}) {
  private rec = { x: new Float32Array(CAPACITY), z: new Float32Array(CAPACITY), yaw: new Float32Array(CAPACITY) };
  private best = { x: new Float32Array(CAPACITY), z: new Float32Array(CAPACITY), yaw: new Float32Array(CAPACITY) };
  private recLen = 0;
  private bestLen = 0;
  private lastLaps = 0;
  private lastBestVersion = 0;

  private kartRef!: EntityRef;
  private ghostRef!: EntityRef;

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
    this.ghostRef = trackSingle(this.queries.ghost, this.cleanupFuncs);
    this.cleanupFuncs.push(
      this.queries.ghost.subscribe(
        'qualify',
        (entity) => {
          if (entity.object3D) entity.object3D.visible = false;
        },
        true,
      ),
    );
  }

  update(): void {
    const kart = this.kartRef.current;
    const ghost = this.ghostRef.current;
    if (!kart?.object3D) return;

    const laps = kart.getValue(RaceState, 'lapsCompleted')!;
    if (laps !== this.lastLaps) {
      const version = kart.getValue(RaceState, 'bestVersion')!;
      if (laps > this.lastLaps && version !== this.lastBestVersion) {
        const tmp = this.best;
        this.best = this.rec;
        this.rec = tmp;
        this.bestLen = this.recLen;
        this.lastBestVersion = version;
      }
      this.recLen = 0;
      this.lastLaps = laps;
    }

    const phase = kart.getValue(RaceState, 'phase');
    const t = kart.getValue(RaceState, 'lapTime')!;
    if (phase === RacePhase.Racing) {
      const frame = Math.floor(t * RATE);
      while (this.recLen <= frame && this.recLen < CAPACITY) {
        this.rec.x[this.recLen] = kart.object3D.position.x;
        this.rec.z[this.recLen] = kart.object3D.position.z;
        this.rec.yaw[this.recLen] = kart.getValue(Kart, 'yaw')!;
        this.recLen++;
      }
    }

    const obj = ghost?.object3D;
    if (!ghost || !obj) return;
    const show = phase === RacePhase.Racing && this.bestLen > 1;
    obj.visible = show;
    ghost.setValue(Ghost, 'active', show);
    if (!show) return;
    const f = Math.min(t * RATE, this.bestLen - 1.001);
    const i = Math.floor(f);
    const a = f - i;
    const b = this.best;
    obj.position.set(b.x[i] + (b.x[i + 1] - b.x[i]) * a, 0, b.z[i] + (b.z[i + 1] - b.z[i]) * a);
    let dy = b.yaw[i + 1] - b.yaw[i];
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    obj.rotation.set(0, b.yaw[i] + dy * a, 0);
  }
}
