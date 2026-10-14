import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';

/** Glowing cyan best-lap ghost: kart-shaped so it reads as a rival, tinted so it never reads as solid. */
const ghost = new Group();
ghost.name = 'Ghost Kart';

const mat = new MeshStandardMaterial({
  color: 0x8fe6ff,
  emissive: 0x2fb6e8,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  flatShading: true,
});

function add(geo: BoxGeometry | CylinderGeometry | SphereGeometry, x: number, y: number, z: number, rz = 0): void {
  const m = new Mesh(geo, mat);
  m.position.set(x, y + 0.05, z);
  m.rotation.z = rz;
  ghost.add(m);
}

add(new BoxGeometry(1.1, 0.22, 2.3), 0, 0.28, -0.35);
add(new BoxGeometry(0.9, 0.2, 0.7), 0, 0.36, -1.35);
add(new BoxGeometry(0.42, 0.42, 0.28), 0, 0.68, 0.28);
add(new SphereGeometry(0.17, 10, 8), 0, 1.0, 0.26);
for (const [x, z, r] of [
  [0.68, -1.15, 0.22],
  [-0.68, -1.15, 0.22],
  [0.72, 0.55, 0.27],
  [-0.72, 0.55, 0.27],
] as const) {
  add(new CylinderGeometry(r, r, 0.24, 12), x, r, z, Math.PI / 2);
}

export default ghost;
