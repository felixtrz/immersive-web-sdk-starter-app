import { createSystem, VisibilityState } from '@iwsdk/core';
import { Kart } from '../race-components.js';

/** Driver eye point in kart space, shared by the browser cockpit camera and the XR rig. */
export const BROWSER_EYE = { y: 1.08, z: 0.2, pitch: -0.1 };

/** Parents the player rig to the kart so the cockpit carries the camera in both modes. */
export class CockpitRigSystem extends createSystem({
  kart: { required: [Kart] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      this.queries.kart.subscribe(
        'qualify',
        (entity) => {
          const obj = entity.object3D;
          if (!obj) return;
          obj.add(this.player);
          this.player.position.set(0, 0, 0);
          this.player.rotation.set(0, 0, 0);
          this.applyMode(this.world.visibilityState.peek());
        },
        true,
      ),
      this.world.visibilityState.subscribe((state) => this.applyMode(state)),
    );
  }

  private applyMode(state: VisibilityState): void {
    if (state === VisibilityState.NonImmersive) {
      this.player.position.set(0, 0, 0);
      this.camera.position.set(0, BROWSER_EYE.y, BROWSER_EYE.z);
      this.camera.rotation.set(BROWSER_EYE.pitch, 0, 0);
    } else {
      // The XR session uses a 'local' reference space, whose origin is the headset pose at
      // session start. Putting that origin on the driver's eye seats any player, standing or
      // sitting, at the right height.
      this.player.position.set(0, BROWSER_EYE.y, BROWSER_EYE.z);
    }
  }
}
