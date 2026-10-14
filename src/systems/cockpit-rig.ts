import { createSystem, VisibilityState } from '@iwsdk/core';
import { Kart } from '../race-components.js';

/** Seated headset eye height above local-floor is ~1.2 m; the kart eye point is ~0.95 m. */
const XR_SEAT_OFFSET_Y = -0.3;
const BROWSER_EYE = { y: 0.98, z: 0.22, pitch: -0.14 };

/** Parents the player rig to the kart so the cockpit carries the camera in both modes. */
export class CockpitRigSystem extends createSystem({
  kart: { required: [Kart] },
}) {
  init(): void {
    this.queries.kart.subscribe('qualify', (entity) => {
      const obj = entity.object3D;
      if (!obj) return;
      obj.add(this.player);
      this.player.position.set(0, 0, 0);
      this.player.rotation.set(0, 0, 0);
      this.applyMode(this.world.visibilityState.peek());
    }, true);
    this.cleanupFuncs.push(this.world.visibilityState.subscribe((state) => this.applyMode(state)));
  }

  private applyMode(state: VisibilityState): void {
    if (state === VisibilityState.NonImmersive) {
      this.player.position.y = 0;
      this.camera.position.set(0, BROWSER_EYE.y, BROWSER_EYE.z);
      this.camera.rotation.set(BROWSER_EYE.pitch, 0, 0);
    } else {
      this.player.position.y = XR_SEAT_OFFSET_Y;
    }
  }
}
