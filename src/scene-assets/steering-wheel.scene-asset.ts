import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from '@iwsdk/core';

/** Steering wheel; rim lies in the local XY plane, facing +Z (the driver). */
const wheel = new Group();
wheel.name = 'Steering Wheel';

const grip = new MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.85, flatShading: true });
const hubMat = new MeshStandardMaterial({ color: 0xf07a1a, roughness: 0.5, flatShading: true });

wheel.add(new Mesh(new TorusGeometry(0.17, 0.022, 8, 24), grip));

const hub = new Mesh(new CylinderGeometry(0.045, 0.045, 0.04, 10), hubMat);
hub.rotation.x = Math.PI / 2;
wheel.add(hub);

for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
  const spoke = new Mesh(new BoxGeometry(0.17, 0.025, 0.015), grip);
  spoke.position.set(Math.cos(angle + Math.PI / 2) * 0.085, Math.sin(angle + Math.PI / 2) * 0.085 - 0.0, 0);
  spoke.rotation.z = angle + Math.PI / 2;
  wheel.add(spoke);
}

// Top-center marker so the turn angle reads at a glance.
const marker = new Mesh(new BoxGeometry(0.03, 0.05, 0.05), hubMat);
marker.position.set(0, 0.17, 0);
wheel.add(marker);

export default wheel;
