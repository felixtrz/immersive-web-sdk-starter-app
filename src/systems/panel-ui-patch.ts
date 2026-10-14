import { type Object3D, PanelUISystem, UIKitDocument } from '@iwsdk/core';

/**
 * Workaround for @iwsdk/core PanelUISystem.update, which allocates a Set and a
 * closure and traverses the entire scene graph every frame to find UIKit
 * documents. The track has thousands of objects, so that walk is the single
 * largest per-frame cost. The document list is instead rescanned on a fixed
 * cadence into a reused array; panels are created rarely, so a new one waits at
 * most RESCAN_FRAMES before its first tick.
 */
const RESCAN_FRAMES = 30;

const documents: UIKitDocument[] = [];
let framesUntilRescan = 0;

function collect(object: Object3D): void {
  if (object instanceof UIKitDocument && !object.disposed && !documents.includes(object)) {
    documents.push(object);
  }
}

type PanelUISystemInternals = { scene: Object3D; camera: Object3D };

PanelUISystem.prototype.update = function update(this: PanelUISystemInternals, delta: number): void {
  if (framesUntilRescan-- <= 0) {
    framesUntilRescan = RESCAN_FRAMES;
    documents.length = 0;
    this.scene.traverse(collect);
    this.camera.traverse(collect);
  }
  const deltaMs = delta * 1000;
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i];
    if (!document.disposed) document.rootElement.update?.(deltaMs);
  }
};
