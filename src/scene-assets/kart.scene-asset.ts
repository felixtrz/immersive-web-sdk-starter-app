import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

/** Player kart. Forward is -Z; origin on the ground under the seat. */
const kart = new Group();
kart.name = 'Kart';

const body = new MeshStandardMaterial({ color: 0xf07a1a, roughness: 0.55, flatShading: true });
const dark = new MeshStandardMaterial({ color: 0x262626, roughness: 0.8, flatShading: true });
const seatMat = new MeshStandardMaterial({ color: 0x2b3440, roughness: 0.9, flatShading: true });

const chassis = new Mesh(new BoxGeometry(1.2, 0.18, 2.2), body);
chassis.position.set(0, 0.2, -0.35);
kart.add(chassis);

const nose = new Mesh(new BoxGeometry(0.9, 0.22, 0.6), body);
nose.position.set(0, 0.3, -1.3);
nose.rotation.x = -0.25;
kart.add(nose);

for (const side of [-1, 1]) {
  const pod = new Mesh(new BoxGeometry(0.22, 0.26, 1.1), body);
  pod.position.set(side * 0.55, 0.36, -0.35);
  kart.add(pod);
}

const seat = new Mesh(new BoxGeometry(0.5, 0.12, 0.45), seatMat);
seat.position.set(0, 0.34, 0.2);
kart.add(seat);
const back = new Mesh(new BoxGeometry(0.5, 0.5, 0.1), seatMat);
back.position.set(0, 0.6, 0.45);
back.rotation.x = -0.2;
kart.add(back);

const column = new Mesh(new CylinderGeometry(0.025, 0.025, 0.6, 6), dark);
column.position.set(0, 0.48, -0.42);
column.rotation.x = 1.05;
kart.add(column);

const wheelGeo = new CylinderGeometry(0.2, 0.2, 0.2, 10);
for (const [x, z] of [
  [-0.7, -1.1],
  [0.7, -1.1],
  [-0.72, 0.4],
  [0.72, 0.4],
] as const) {
  const w = new Mesh(wheelGeo, dark);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.2, z);
  kart.add(w);
}

export default kart;
