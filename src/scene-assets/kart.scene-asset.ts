import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from '@iwsdk/core';

/** Player kart. Forward is -Z; origin on the ground under the seat. */
const kart = new Group();
kart.name = 'Kart';

const orange = new MeshStandardMaterial({ color: 0xf07a1a, roughness: 0.45, metalness: 0.05, flatShading: true });
const cream = new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5, flatShading: true });
const dark = new MeshStandardMaterial({ color: 0x23262b, roughness: 0.75, flatShading: true });
const tire = new MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.95, flatShading: true });
const steel = new MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.6, flatShading: true });
const seatMat = new MeshStandardMaterial({ color: 0x2b3440, roughness: 0.85, flatShading: true });
const suit = new MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.7, flatShading: true });
const visor = new MeshStandardMaterial({ color: 0x14181f, roughness: 0.15, metalness: 0.4 });

function part(
  geo: BufferGeometry,
  mat: Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  parent: Group = kart,
): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Chassis: floor pan, central tub, nose fairing, sidepods.
part(new BoxGeometry(1.0, 0.05, 2.25), dark, 0, 0.12, -0.3);
part(new BoxGeometry(0.64, 0.2, 1.35), orange, 0, 0.24, -0.05);
part(new BoxGeometry(0.92, 0.16, 0.55), orange, 0, 0.25, -1.22, -0.18);
part(new BoxGeometry(0.62, 0.05, 0.5), cream, 0, 0.34, -1.2, -0.18);
for (const side of [-1, 1]) {
  part(new BoxGeometry(0.26, 0.22, 0.95), orange, side * 0.56, 0.26, -0.3);
  part(new BoxGeometry(0.27, 0.04, 0.6), cream, side * 0.56, 0.38, -0.3);
}

// Bumpers.
const bar = new CylinderGeometry(0.035, 0.035, 1, 8);
part(bar, steel, 0, 0.2, -1.58, 0, 0, Math.PI / 2).scale.set(1, 1.15, 1);
part(bar, steel, 0, 0.26, 1.0, 0, 0, Math.PI / 2).scale.set(1, 1.45, 1);
for (const side of [-1, 1]) {
  part(new CylinderGeometry(0.03, 0.03, 0.4, 6), steel, side * 0.45, 0.2, -1.4, Math.PI / 2);
  part(new CylinderGeometry(0.03, 0.03, 0.35, 6), steel, side * 0.5, 0.24, 0.82, Math.PI / 2);
}

// Dash cowl and steering column anchored into it (wheel entity sits at 0, 0.62, -0.28).
part(new BoxGeometry(0.46, 0.14, 0.34), orange, 0, 0.36, -0.86, -0.2);
part(new CylinderGeometry(0.03, 0.04, 0.68, 8), dark, 0, 0.48, -0.59, 1.15);
part(new CylinderGeometry(0.06, 0.06, 0.08, 10), dark, 0, 0.6, -0.31, 1.15);

// Bucket seat with bolsters and headrest.
part(new BoxGeometry(0.5, 0.1, 0.45), seatMat, 0, 0.31, 0.2);
part(new BoxGeometry(0.5, 0.55, 0.08), seatMat, 0, 0.58, 0.45, -0.22);
part(new BoxGeometry(0.3, 0.16, 0.08), seatMat, 0, 0.92, 0.52, -0.22);
for (const side of [-1, 1]) {
  part(new BoxGeometry(0.07, 0.3, 0.42), seatMat, side * 0.27, 0.45, 0.25, 0, side * 0.12);
}

// Engine block, exhaust, rear axle.
part(new BoxGeometry(0.34, 0.3, 0.32), steel, 0.32, 0.36, 0.68);
part(new BoxGeometry(0.36, 0.08, 0.34), dark, 0.32, 0.53, 0.68);
part(new CylinderGeometry(0.045, 0.045, 0.4, 8), steel, 0.5, 0.42, 0.9, Math.PI / 2);
part(new CylinderGeometry(0.03, 0.03, 1.5, 6), dark, 0, 0.23, 0.42, 0, 0, Math.PI / 2);
part(new CylinderGeometry(0.03, 0.03, 1.3, 6), dark, 0, 0.19, -1.1, 0, 0, Math.PI / 2);

// Wheels: wider, taller rears; cream rims with orange hubs on the outer face.
const hubGeo = new CylinderGeometry(0.05, 0.05, 0.04, 8);
for (const [x, z, r, w] of [
  [-0.7, -1.1, 0.19, 0.18],
  [0.7, -1.1, 0.19, 0.18],
  [-0.74, 0.42, 0.23, 0.26],
  [0.74, 0.42, 0.23, 0.26],
] as const) {
  const side = Math.sign(x);
  part(new CylinderGeometry(r, r, w, 14), tire, x, r, z, 0, 0, Math.PI / 2);
  part(new CylinderGeometry(r * 0.6, r * 0.6, w + 0.01, 10), cream, x, r, z, 0, 0, Math.PI / 2);
  part(hubGeo, orange, x + side * (w / 2 + 0.01), r, z, 0, 0, Math.PI / 2);
}

// Driver figure: hidden in cockpit/XR by CameraModeSystem so it never blocks the player's view.
const driver = new Group();
driver.name = 'Driver';
kart.add(driver);
part(new BoxGeometry(0.4, 0.42, 0.26), suit, 0, 0.6, 0.3, -0.2, 0, 0, driver);
part(new SphereGeometry(0.16, 12, 10), cream, 0, 0.98, 0.26, 0, 0, 0, driver);
part(new BoxGeometry(0.22, 0.08, 0.06), visor, 0, 0.99, 0.12, 0, 0, 0, driver);
part(new BoxGeometry(0.34, 0.04, 0.3), orange, 0, 1.06, 0.27, 0, 0, 0, driver);
for (const side of [-1, 1]) {
  part(new BoxGeometry(0.09, 0.09, 0.5), suit, side * 0.17, 0.66, 0.02, 0.45, side * -0.18, 0, driver);
  part(new BoxGeometry(0.12, 0.12, 0.55), suit, side * 0.12, 0.38, -0.25, 0.1, 0, 0, driver);
}

export default kart;
