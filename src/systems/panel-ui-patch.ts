import { type Object3D, PanelUISystem, UIKitDocument } from '@iwsdk/core';

/**
 * Workaround for @iwsdk/core PanelUISystem.update, which allocates a Set and a
 * closure and traverses the entire scene graph every frame to find UIKit
 * documents. The track has thousands of objects, so that walk was the single
 * largest per-frame cost, and rescanning on a cadence only moves it into a
 * periodic spike.
 *
 * Instead, the document list is frozen and maintained incrementally: Three.js
 * already visits every attached document each frame in updateMatrixWorld, so a
 * document registers itself there and stamps the frame it was last seen. The
 * system ticks the frozen list and drops any document that was disposed or not
 * seen (detached, directly or via an ancestor). Per-frame cost is constant, with
 * no traversal, allocation, or rebuild. uikit itself only recalculates layout
 * when a property changes, so ticking an idle document is cheap.
 */

type TrackedDocument = UIKitDocument & {
  __panelRegistered?: boolean;
  __panelSeenFrame?: number;
};

const documents: TrackedDocument[] = [];
let frame = 0;

const baseUpdateMatrixWorld = UIKitDocument.prototype.updateMatrixWorld;

UIKitDocument.prototype.updateMatrixWorld = function updateMatrixWorld(
  this: TrackedDocument,
  force?: boolean,
): void {
  this.__panelSeenFrame = frame;
  if (!this.__panelRegistered && !this.disposed) {
    this.__panelRegistered = true;
    documents.push(this);
  }
  baseUpdateMatrixWorld.call(this, force);
};

type PanelUISystemInternals = { scene: Object3D; camera: Object3D };

PanelUISystem.prototype.update = function update(this: PanelUISystemInternals, delta: number): void {
  frame++;
  const deltaMs = delta * 1000;
  let i = 0;
  while (i < documents.length) {
    const document = documents[i];
    const seen = document.__panelSeenFrame ?? -Infinity;
    if (document.disposed || seen < frame - 2) {
      document.__panelRegistered = false;
      documents[i] = documents[documents.length - 1];
      documents.length--;
      continue;
    }
    document.rootElement.update?.(deltaMs);
    i++;
  }
};
