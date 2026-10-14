import { createSystem, VisibilityState } from '@iwsdk/core';

/**
 * Keeps tracked-hand meshes hidden while hands still drive steering and pedals.
 *
 * XRInputManager writes `visual.model.visible = isPrimary` every frame inside
 * InputSystem (priority -4), which overrides toggleVisual(false). With the
 * visual disabled its bones stop updating, so the mesh reappeared as a frozen
 * hand. This system must be registered with a priority above -4 so it runs
 * after InputSystem and right before render.
 */
export class HandVisibilitySystem extends createSystem({}) {
  init(): void {
    const hands = this.input.xr.visualAdapters.hand;
    hands.left.toggleVisual(false);
    hands.right.toggleVisual(false);
  }

  update(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    const hands = this.input.xr.visualAdapters.hand;
    const left = hands.left.visual;
    const right = hands.right.visual;
    if (left) left.model.visible = false;
    if (right) right.model.visible = false;
  }
}
