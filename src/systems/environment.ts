import { createSystem, DirectionalLight, Entity, Fog, Mesh, MeshStandardMaterial, PCFSoftShadowMap } from '@iwsdk/core';
import { Kart } from '../race-components.js';

const FOG_COLOR = 0xb8d6ed;
const SUN_OFFSET = { x: 40, y: 70, z: 30 } as const;
const SHADOW_EXTENT = 45;
const SHADOW_PASSES_AT = [30, 180] as const;

/**
 * Enables sun shadows and distance fog. The shadow frustum follows the kart so it stays
 * sharp; mesh flags are applied after the level and scene assets finish streaming in.
 */
export class EnvironmentSystem extends createSystem({
  kart: { required: [Kart] },
}) {
  private sun: DirectionalLight | null = null;
  private frames = 0;

  init(): void {
    const renderer = this.world.renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.scene.fog = new Fog(FOG_COLOR, 110, 560);
  }

  update(): void {
    this.frames++;
    if (!this.sun) {
      const found = this.scene.getObjectByName('Sun');
      if (!(found instanceof DirectionalLight)) return;
      this.sun = found;
      found.castShadow = true;
      found.shadow.mapSize.set(2048, 2048);
      found.shadow.bias = -0.0004;
      found.shadow.normalBias = 0.03;
      const cam = found.shadow.camera;
      cam.left = cam.bottom = -SHADOW_EXTENT;
      cam.right = cam.top = SHADOW_EXTENT;
      cam.near = 1;
      cam.far = 220;
      cam.updateProjectionMatrix();
    }
    if ((SHADOW_PASSES_AT as readonly number[]).includes(this.frames)) this.applyShadowFlags();

    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!obj) return;
    const p = obj.position;
    this.sun.position.set(p.x + SUN_OFFSET.x, p.y + SUN_OFFSET.y, p.z + SUN_OFFSET.z);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }

  /** Opaque lit meshes cast and receive; translucent ones (ghost, blob shadows) and UI are left alone. */
  private applyShadowFlags(): void {
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial;
      if (Array.isArray(mat) || !(mat instanceof MeshStandardMaterial) || mat.transparent) return;
      mesh.receiveShadow = true;
      if (!/^(Ground|Grass|Hills)/.test(mesh.name)) mesh.castShadow = true;
    });
  }
}
