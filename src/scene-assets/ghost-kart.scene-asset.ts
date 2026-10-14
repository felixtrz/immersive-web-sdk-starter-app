import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

/** Translucent best-lap ghost. Same footprint as the player kart, forward -Z. */
const ghost = new Group();
ghost.name = 'Ghost Kart';

const mat = new MeshStandardMaterial({
  color: 0x7fd4ff,
  emissive: 0x2a7fb0,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  flatShading: true,
});

const chassis = new Mesh(new BoxGeometry(1.2, 0.3, 2.4), mat);
chassis.position.set(0, 0.3, -0.4);
ghost.add(chassis);
const driver = new Mesh(new BoxGeometry(0.45, 0.55, 0.4), mat);
driver.position.set(0, 0.7, 0.2);
ghost.add(driver);

export default ghost;
