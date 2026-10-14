import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import {
  BARRIER_OFFSET,
  BARRIER_THICKNESS,
  CURB_WIDTH,
  GATE_INDICES,
  NORMAL_X,
  NORMAL_Z,
  SAMPLE_COUNT,
  SAMPLE_X,
  SAMPLE_Z,
  TRACK_HALF_WIDTH,
} from '../track.js';

const COLORS = {
  grass: 0x6cbf4a,
  asphalt: 0x6f6d6a,
  curbRed: 0xd8342c,
  curbWhite: 0xf4f1ea,
  barrier: 0x2f6fd6,
  pole: 0x3a3a3a,
  leaf: 0x3f9a3a,
  trunk: 0x7a5232,
};

/** Builds a ribbon between two lateral offsets along the centerline. */
function ribbon(inner: number, outer: number, y: number, stripe?: [Color, Color]): BufferGeometry {
  const positions = new Float32Array(SAMPLE_COUNT * 6 * 3);
  const colors = stripe ? new Float32Array(SAMPLE_COUNT * 6 * 3) : null;
  let p = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const j = (i + 1) % SAMPLE_COUNT;
    const a = [SAMPLE_X[i] + NORMAL_X[i] * inner, y, SAMPLE_Z[i] + NORMAL_Z[i] * inner];
    const b = [SAMPLE_X[i] + NORMAL_X[i] * outer, y, SAMPLE_Z[i] + NORMAL_Z[i] * outer];
    const c = [SAMPLE_X[j] + NORMAL_X[j] * inner, y, SAMPLE_Z[j] + NORMAL_Z[j] * inner];
    const d = [SAMPLE_X[j] + NORMAL_X[j] * outer, y, SAMPLE_Z[j] + NORMAL_Z[j] * outer];
    // Counter-clockwise seen from above (normal +Y) for either offset order.
    // With right = (-tz, tx), (inner->outer) x (i->j) points up only when inner < outer.
    const quad = inner < outer ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
    const col = stripe ? stripe[Math.floor(i / 3) % 2] : null;
    for (const v of quad) {
      if (colors && col) {
        colors[p] = col.r;
        colors[p + 1] = col.g;
        colors[p + 2] = col.b;
      }
      positions[p++] = v[0];
      positions[p++] = v[1];
      positions[p++] = v[2];
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  if (colors) geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const root = new Group();
root.name = 'Sunny Circuit';

const sun = new DirectionalLight(0xfff4e0, 1.6);
sun.position.set(80, 140, 60);
root.add(sun);

const ground = new Mesh(
  new PlaneGeometry(560, 400),
  new MeshStandardMaterial({ color: COLORS.grass, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(-3, -0.02, -13);
ground.name = 'Grass';
root.add(ground);

const asphalt = new Mesh(
  ribbon(-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0.01),
  new MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.95, flatShading: true }),
);
asphalt.name = 'Asphalt';
root.add(asphalt);

const red = new Color(COLORS.curbRed);
const white = new Color(COLORS.curbWhite);
const curbMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
for (const side of [1, -1]) {
  const curb = new Mesh(
    ribbon(side * TRACK_HALF_WIDTH, side * (TRACK_HALF_WIDTH + CURB_WIDTH), 0.025, [red, white]),
    curbMaterial,
  );
  curb.name = side > 0 ? 'Curb Right' : 'Curb Left';
  root.add(curb);
}

// Barriers: one instanced box per 2 samples on each side.
{
  const step = 2;
  const perSide = Math.ceil(SAMPLE_COUNT / step);
  const barriers = new InstancedMesh(
    new BoxGeometry(1, 0.9, 1),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }),
    perSide * 2,
  );
  barriers.name = 'Barriers';
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  const up = new Vector3(0, 1, 0);
  const blue = new Color(COLORS.barrier);
  let n = 0;
  for (const side of [1, -1]) {
    for (let k = 0; k < perSide; k++) {
      const i = k * step;
      const j = (i + step) % SAMPLE_COUNT;
      const ax = SAMPLE_X[i] + NORMAL_X[i] * side * BARRIER_OFFSET;
      const az = SAMPLE_Z[i] + NORMAL_Z[i] * side * BARRIER_OFFSET;
      const bx = SAMPLE_X[j] + NORMAL_X[j] * side * BARRIER_OFFSET;
      const bz = SAMPLE_Z[j] + NORMAL_Z[j] * side * BARRIER_OFFSET;
      const len = Math.hypot(bx - ax, bz - az);
      pos.set((ax + bx) / 2, 0.45, (az + bz) / 2);
      q.setFromAxisAngle(up, Math.atan2(-(bz - az), bx - ax));
      scl.set(len + 0.05, 1, BARRIER_THICKNESS);
      m.compose(pos, q, scl);
      barriers.setMatrixAt(n, m);
      barriers.setColorAt(n, k % 2 === 0 ? white : blue);
      n++;
    }
  }
  root.add(barriers);
}

// Start/finish checker line across gate 0.
{
  const g = GATE_INDICES[0];
  const cols = 10;
  const rows = 2;
  const cell = (TRACK_HALF_WIDTH * 2) / cols;
  const checker = new InstancedMesh(
    new BoxGeometry(cell, 0.01, cell),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    cols * rows,
  );
  checker.name = 'Start Line';
  const tx = -NORMAL_Z[g];
  const tz = NORMAL_X[g];
  const yaw = Math.atan2(-tz, tx);
  const m = new Matrix4();
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const pos = new Vector3();
  const one = new Vector3(1, 1, 1);
  const black = new Color(0x1d1d1d);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = -TRACK_HALF_WIDTH + cell * (c + 0.5);
      const lon = (r - 0.5) * cell;
      pos.set(
        SAMPLE_X[g] + NORMAL_X[g] * lat + tx * lon,
        0.03,
        SAMPLE_Z[g] + NORMAL_Z[g] * lat + tz * lon,
      );
      m.compose(pos, q, one);
      checker.setMatrixAt(n, m);
      checker.setColorAt(n, (r + c) % 2 === 0 ? white : black);
      n++;
    }
  }
  root.add(checker);

  // Gantry over the line.
  const poleMat = new MeshStandardMaterial({ color: COLORS.pole, roughness: 0.6, flatShading: true });
  const gantry = new Group();
  gantry.name = 'Gantry';
  for (const side of [1, -1]) {
    const pole = new Mesh(new BoxGeometry(0.4, 6, 0.4), poleMat);
    pole.position.set(NORMAL_X[g] * side * (BARRIER_OFFSET + 1), 3, NORMAL_Z[g] * side * (BARRIER_OFFSET + 1));
    gantry.add(pole);
  }
  const beam = new Mesh(new BoxGeometry((BARRIER_OFFSET + 1) * 2 + 0.4, 1, 0.6), new MeshStandardMaterial({ color: COLORS.curbRed, roughness: 0.6, flatShading: true }));
  beam.position.y = 6;
  beam.rotation.y = Math.atan2(-NORMAL_Z[g], NORMAL_X[g]);
  gantry.add(beam);
  gantry.position.set(SAMPLE_X[g], 0, SAMPLE_Z[g]);
  root.add(gantry);
}

// Trees, scattered deterministically and kept clear of the circuit.
{
  const rand = seeded(7);
  const spots: Array<[number, number, number]> = [];
  let guard = 0;
  while (spots.length < 90 && guard++ < 4000) {
    const x = -270 + rand() * 540;
    const z = -205 + rand() * 390;
    let clear = true;
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const dx = SAMPLE_X[i] - x;
      const dz = SAMPLE_Z[i] - z;
      if (dx * dx + dz * dz < 16 * 16) {
        clear = false;
        break;
      }
    }
    if (clear) spots.push([x, z, 0.8 + rand() * 0.7]);
  }
  const leaves = new InstancedMesh(
    new ConeGeometry(2.4, 6, 7),
    new MeshStandardMaterial({ color: COLORS.leaf, roughness: 0.9, flatShading: true }),
    spots.length,
  );
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.35, 0.45, 2, 6),
    new MeshStandardMaterial({ color: COLORS.trunk, roughness: 1, flatShading: true }),
    spots.length,
  );
  leaves.name = 'Tree Leaves';
  trunks.name = 'Tree Trunks';
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  spots.forEach(([x, z, s], i) => {
    scl.setScalar(s);
    pos.set(x, 1 * s, z);
    m.compose(pos, q, scl);
    trunks.setMatrixAt(i, m);
    pos.set(x, 5 * s, z);
    m.compose(pos, q, scl);
    leaves.setMatrixAt(i, m);
  });
  root.add(trunks, leaves);
}

export default root;
