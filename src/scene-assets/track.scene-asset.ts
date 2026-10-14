import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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
  asphalt: 0x5f5d5b,
  line: 0xf4f1ea,
  curbRed: 0xd8342c,
  curbWhite: 0xf4f1ea,
  barrier: 0x2f6fd6,
  pole: 0x3a3a3a,
  trunk: 0x7a5232,
};

const UP = new Vector3(0, 1, 0);

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Builds a ribbon between two lateral offsets along the centerline. `yInner`/`yOuter`
 * let curbs slope up so they catch light; `colorAt` gives per-quad vertex colors.
 */
function ribbon(
  inner: number,
  outer: number,
  yInner: number,
  yOuter: number,
  colorAt?: (i: number) => Color,
): BufferGeometry {
  const positions = new Float32Array(SAMPLE_COUNT * 6 * 3);
  const colors = colorAt ? new Float32Array(SAMPLE_COUNT * 6 * 3) : null;
  let p = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const j = (i + 1) % SAMPLE_COUNT;
    const a = [SAMPLE_X[i] + NORMAL_X[i] * inner, yInner, SAMPLE_Z[i] + NORMAL_Z[i] * inner];
    const b = [SAMPLE_X[i] + NORMAL_X[i] * outer, yOuter, SAMPLE_Z[i] + NORMAL_Z[i] * outer];
    const c = [SAMPLE_X[j] + NORMAL_X[j] * inner, yInner, SAMPLE_Z[j] + NORMAL_Z[j] * inner];
    const d = [SAMPLE_X[j] + NORMAL_X[j] * outer, yOuter, SAMPLE_Z[j] + NORMAL_Z[j] * outer];
    // Counter-clockwise seen from above (normal +Y) for either offset order.
    const quad = inner < outer ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
    const col = colorAt ? colorAt(i) : null;
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

function receive<T extends Mesh>(mesh: T): T {
  mesh.receiveShadow = true;
  return mesh;
}

const root = new Group();
root.name = 'Sunny Circuit';

// Sun: CameraModeSystem's environment pass keeps its shadow frustum centered on the kart.
const sun = new DirectionalLight(0xfff1d6, 3.2);
sun.name = 'Sun';
sun.position.set(50, 38, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -36;
sun.shadow.camera.right = 36;
sun.shadow.camera.top = 36;
sun.shadow.camera.bottom = -36;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
root.add(sun, sun.target);

// Grass: large vertex-colored plane with mowing stripes and soft noise for speed cues.
{
  const geo = new PlaneGeometry(1400, 1400, 175, 175);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const rand = seeded(11);
  const base = new Color(COLORS.grass);
  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const stripe = Math.floor(x / 8) % 2 === 0 ? 1.04 : 0.95;
    const noise = 0.92 + rand() * 0.14;
    tmp.copy(base).multiplyScalar(stripe * noise);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  const ground = receive(
    new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-3, -0.02, -13);
  ground.name = 'Grass';
  root.add(ground);
}

// Asphalt: four lanes of patchwork shading so the surface visibly streams past.
{
  const rand = seeded(23);
  const base = new Color(COLORS.asphalt);
  const lanes = 4;
  const laneW = (TRACK_HALF_WIDTH * 2) / lanes;
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const asphalt = new Group();
  asphalt.name = 'Asphalt';
  for (let l = 0; l < lanes; l++) {
    const shades = Array.from({ length: SAMPLE_COUNT }, () => {
      const r = rand();
      const k = r < 0.06 ? 0.93 : r > 0.95 ? 1.05 : 0.97 + rand() * 0.05;
      return base.clone().multiplyScalar(k);
    });
    const inner = -TRACK_HALF_WIDTH + laneW * l;
    asphalt.add(receive(new Mesh(ribbon(inner, inner + laneW, 0.01, 0.01, (i) => shades[i]), mat)));
  }
  const lineMat = new MeshStandardMaterial({ color: COLORS.line, roughness: 0.6 });
  for (const side of [1, -1]) {
    asphalt.add(
      receive(new Mesh(ribbon(side * (TRACK_HALF_WIDTH - 0.45), side * (TRACK_HALF_WIDTH - 0.25), 0.016, 0.016), lineMat)),
    );
  }
  root.add(asphalt);
}

// Curbs slope up toward the outside edge so the red/white bands read as raised kerbs.
{
  const red = new Color(COLORS.curbRed);
  const white = new Color(COLORS.curbWhite);
  const curbMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  for (const side of [1, -1]) {
    const curb = receive(
      new Mesh(
        ribbon(side * TRACK_HALF_WIDTH, side * (TRACK_HALF_WIDTH + CURB_WIDTH), 0.02, 0.11, (i) =>
          Math.floor(i / 2) % 2 === 0 ? red : white,
        ),
        curbMaterial,
      ),
    );
    curb.name = side > 0 ? 'Curb Right' : 'Curb Left';
    root.add(curb);
  }
}

// Barriers: one instanced box per 2 samples on each side.
{
  const step = 2;
  const perSide = Math.ceil(SAMPLE_COUNT / step);
  const barriers = new InstancedMesh(
    new BoxGeometry(1, 0.9, 1),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }),
    perSide * 2,
  );
  barriers.name = 'Barriers';
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  const blue = new Color(COLORS.barrier);
  const white = new Color(COLORS.curbWhite);
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
      q.setFromAxisAngle(UP, Math.atan2(-(bz - az), bx - ax));
      scl.set(len + 0.05, 1, BARRIER_THICKNESS);
      m.compose(pos, q, scl);
      barriers.setMatrixAt(n, m);
      barriers.setColorAt(n, k % 2 === 0 ? white : blue);
      n++;
    }
  }
  root.add(barriers);
}

// Brake marker boards (3-2-1 bars) before every significant corner, both sides.
{
  let lapLength = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const j = (i + 1) % SAMPLE_COUNT;
    lapLength += Math.hypot(SAMPLE_X[j] - SAMPLE_X[i], SAMPLE_Z[j] - SAMPLE_Z[i]);
  }
  const spacing = lapLength / SAMPLE_COUNT;
  const heading = (i: number) => {
    const k = ((i % SAMPLE_COUNT) + SAMPLE_COUNT) % SAMPLE_COUNT;
    return Math.atan2(NORMAL_X[k], -NORMAL_Z[k]);
  };
  const window = Math.max(2, Math.round(18 / spacing));
  const turning = (i: number) => {
    let d = heading(i + window) - heading(i);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) > 0.45;
  };
  const entries: number[] = [];
  const minGap = Math.round(90 / spacing);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    if (turning(i) && !turning(i - 1)) {
      const last = entries[entries.length - 1];
      if (last === undefined || i - last > minGap) entries.push(i);
    }
  }

  const boards: Array<{ i: number; side: number; bars: number }> = [];
  for (const e of entries) {
    for (const [dist, bars] of [
      [60, 3],
      [40, 2],
      [20, 1],
    ] as const) {
      const i = (e - Math.round(dist / spacing) + SAMPLE_COUNT * 4) % SAMPLE_COUNT;
      for (const side of [1, -1]) boards.push({ i, side, bars });
    }
  }
  const barCount = boards.reduce((s, b) => s + b.bars, 0);
  const posts = new InstancedMesh(
    new BoxGeometry(0.12, 2.2, 0.12),
    new MeshStandardMaterial({ color: COLORS.pole, roughness: 0.6, flatShading: true }),
    boards.length * 2,
  );
  const panels = new InstancedMesh(
    new BoxGeometry(1.5, 1.1, 0.08),
    new MeshStandardMaterial({ color: COLORS.curbWhite, roughness: 0.5, flatShading: true }),
    boards.length,
  );
  const stripes = new InstancedMesh(
    new BoxGeometry(1.15, 0.16, 0.02),
    new MeshStandardMaterial({ color: COLORS.curbRed, roughness: 0.5, flatShading: true }),
    Math.max(1, barCount),
  );
  posts.name = 'Brake Board Posts';
  panels.name = 'Brake Boards';
  stripes.name = 'Brake Board Bars';
  posts.castShadow = panels.castShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const one = new Vector3(1, 1, 1);
  let pi = 0;
  let si = 0;
  boards.forEach(({ i, side, bars }, bi) => {
    const tx = -NORMAL_Z[i];
    const tz = NORMAL_X[i];
    // Face the approaching driver: board normal points back along -tangent.
    q.setFromAxisAngle(UP, Math.atan2(-tx, -tz));
    const off = side * (BARRIER_OFFSET + 1.1);
    const cx = SAMPLE_X[i] + NORMAL_X[i] * off;
    const cz = SAMPLE_Z[i] + NORMAL_Z[i] * off;
    for (const lat of [-0.6, 0.6]) {
      pos.set(cx + NORMAL_X[i] * lat, 1.1, cz + NORMAL_Z[i] * lat);
      m.compose(pos, q, one);
      posts.setMatrixAt(pi++, m);
    }
    pos.set(cx, 2.1, cz);
    m.compose(pos, q, one);
    panels.setMatrixAt(bi, m);
    for (let b = 0; b < bars; b++) {
      const y = 2.1 + (b - (bars - 1) / 2) * 0.3;
      pos.set(cx - tx * 0.06, y, cz - tz * 0.06);
      m.compose(pos, q, one);
      stripes.setMatrixAt(si++, m);
    }
  });
  stripes.count = si;
  root.add(posts, panels, stripes);
}

// Start/finish checker line across gate 0, plus gantry.
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
  checker.receiveShadow = true;
  const tx = -NORMAL_Z[g];
  const tz = NORMAL_X[g];
  const yaw = Math.atan2(-tz, tx);
  const m = new Matrix4();
  const q = new Quaternion().setFromAxisAngle(UP, yaw);
  const pos = new Vector3();
  const one = new Vector3(1, 1, 1);
  const white = new Color(COLORS.curbWhite);
  const black = new Color(0x1d1d1d);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = -TRACK_HALF_WIDTH + cell * (c + 0.5);
      const lon = (r - 0.5) * cell;
      pos.set(SAMPLE_X[g] + NORMAL_X[g] * lat + tx * lon, 0.03, SAMPLE_Z[g] + NORMAL_Z[g] * lat + tz * lon);
      m.compose(pos, q, one);
      checker.setMatrixAt(n, m);
      checker.setColorAt(n, (r + c) % 2 === 0 ? white : black);
      n++;
    }
  }
  root.add(checker);

  const poleMat = new MeshStandardMaterial({ color: COLORS.pole, roughness: 0.6, flatShading: true });
  const gantry = new Group();
  gantry.name = 'Gantry';
  for (const side of [1, -1]) {
    const pole = new Mesh(new BoxGeometry(0.4, 6, 0.4), poleMat);
    pole.castShadow = true;
    pole.position.set(NORMAL_X[g] * side * (BARRIER_OFFSET + 1), 3, NORMAL_Z[g] * side * (BARRIER_OFFSET + 1));
    gantry.add(pole);
  }
  const beamYaw = Math.atan2(-NORMAL_Z[g], NORMAL_X[g]);
  const beam = new Mesh(
    new BoxGeometry((BARRIER_OFFSET + 1) * 2 + 0.4, 1, 0.6),
    new MeshStandardMaterial({ color: COLORS.curbRed, roughness: 0.6, flatShading: true }),
  );
  beam.castShadow = true;
  beam.position.y = 6;
  beam.rotation.y = beamYaw;
  gantry.add(beam);
  const sign = new Mesh(
    new BoxGeometry((BARRIER_OFFSET + 1) * 1.2, 0.5, 0.62),
    new MeshStandardMaterial({ color: COLORS.curbWhite, roughness: 0.5, flatShading: true }),
  );
  sign.position.y = 6;
  sign.rotation.y = beamYaw;
  gantry.add(sign);
  gantry.position.set(SAMPLE_X[g], 0, SAMPLE_Z[g]);
  root.add(gantry);

  // Grandstand with a striped roof and a seated crowd beside the start straight.
  const stand = new Group();
  stand.name = 'Grandstand';
  const standMat = new MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.8, flatShading: true });
  const STAND_LEN = 30;
  const TIERS = 5;
  for (let i = 0; i < TIERS; i++) {
    const tier = new Mesh(new BoxGeometry(1.4, 0.7 * (i + 1), STAND_LEN), standMat);
    tier.position.set(i * 1.4, 0.35 * (i + 1), 0);
    stand.add(tier);
  }
  const roofMat = new MeshStandardMaterial({ color: COLORS.curbRed, roughness: 0.6, flatShading: true });
  const roof = new Mesh(new BoxGeometry(TIERS * 1.4 + 1.2, 0.25, STAND_LEN + 1), roofMat);
  roof.position.set(TIERS * 0.7 - 0.7, 6.6, 0);
  roof.rotation.z = 0.12;
  stand.add(roof);
  for (const zz of [-STAND_LEN / 2 + 0.3, 0, STAND_LEN / 2 - 0.3]) {
    const post = new Mesh(new BoxGeometry(0.3, 6.4, 0.3), poleMat);
    post.position.set(TIERS * 1.4 - 0.2, 3.2, zz);
    stand.add(post);
  }
  const backWall = new Mesh(new BoxGeometry(0.4, 6.4, STAND_LEN + 0.6), standMat);
  backWall.position.set(TIERS * 1.4 - 0.5, 3.2, 0);
  stand.add(backWall);
  for (const zz of [-STAND_LEN / 2 - 0.1, STAND_LEN / 2 + 0.1]) {
    const side = new Mesh(new BoxGeometry(TIERS * 1.4, 0.7 * TIERS + 0.3, 0.3), standMat);
    side.position.set(TIERS * 0.7 - 0.7, (0.7 * TIERS + 0.3) / 2, zz);
    stand.add(side);
  }
  const crowdRand = seeded(23);
  const crowdColors = [0x3b5b8c, 0xc8553d, 0xe2c792, 0x5d6d4a, 0xf2efe8, 0x34343c, 0xf07a1a].map((c) => new Color(c));
  const perTier = 22;
  const crowd = new InstancedMesh(
    new BoxGeometry(0.42, 0.62, 0.42),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }),
    TIERS * perTier,
  );
  crowd.name = 'Crowd';
  const cm = new Matrix4();
  const cq = new Quaternion();
  const cp = new Vector3();
  const cs = new Vector3(1, 1, 1);
  let ci = 0;
  for (let i = 0; i < TIERS; i++) {
    for (let k = 0; k < perTier; k++) {
      cp.set(i * 1.4, 0.7 * (i + 1) + 0.31, -STAND_LEN / 2 + 0.8 + k * ((STAND_LEN - 1.6) / (perTier - 1)) + (crowdRand() - 0.5) * 0.3);
      cs.set(1, 0.85 + crowdRand() * 0.35, 1);
      cm.compose(cp, cq, cs);
      crowd.setMatrixAt(ci, cm);
      crowd.setColorAt(ci++, crowdColors[Math.floor(crowdRand() * crowdColors.length)]);
    }
  }
  stand.add(crowd);
  const standSide = -1;
  const standOffset = BARRIER_OFFSET + 4;
  stand.position.set(
    SAMPLE_X[g] + NORMAL_X[g] * standSide * standOffset,
    0,
    SAMPLE_Z[g] + NORMAL_Z[g] * standSide * standOffset,
  );
  // Local +X runs away from the track; local Z runs along it.
  stand.rotation.y = Math.atan2(-NORMAL_Z[g] * standSide, NORMAL_X[g] * standSide);
  root.add(stand);
}

// Puffy low-poly clouds so the sky is not an empty gradient.
{
  const rand = seeded(57);
  const puffs = 3;
  const count = 26;
  const clouds = new InstancedMesh(
    new IcosahedronGeometry(1, 0),
    new MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe9f2, emissiveIntensity: 0.55, roughness: 1, flatShading: true }),
    count * puffs,
  );
  clouds.name = 'Clouds';
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 120 + rand() * 260;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = 70 + rand() * 45;
    const size = 9 + rand() * 9;
    for (let k = 0; k < puffs; k++) {
      pos.set(cx + (k - 1) * size * 1.1, cy + (k === 1 ? size * 0.35 : 0), cz + (rand() - 0.5) * size * 0.6);
      q.setFromAxisAngle(UP, rand() * Math.PI);
      scl.set(size * (k === 1 ? 1.25 : 0.9), size * 0.6, size * 0.8);
      m.compose(pos, q, scl);
      clouds.setMatrixAt(n++, m);
    }
  }
  root.add(clouds);
}

// Trees: pines and round broadleafs with per-instance tint, each grounded by a soft blob shadow.
{
  const rand = seeded(7);
  const spots: Array<[number, number, number, boolean]> = [];
  let guard = 0;
  while (spots.length < 170 && guard++ < 8000) {
    const x = -290 + rand() * 580;
    const z = -225 + rand() * 430;
    let clear = true;
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const dx = SAMPLE_X[i] - x;
      const dz = SAMPLE_Z[i] - z;
      if (dx * dx + dz * dz < 15 * 15) {
        clear = false;
        break;
      }
    }
    if (clear) spots.push([x, z, 0.75 + rand() * 0.8, rand() < 0.6]);
  }
  const pines = spots.filter((s) => s[3]);
  const broad = spots.filter((s) => !s[3]);
  const leafMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const pineLeaves = new InstancedMesh(new ConeGeometry(2.4, 6.5, 7), leafMat, pines.length);
  const broadLeaves = new InstancedMesh(new IcosahedronGeometry(2.6, 0), leafMat, broad.length);
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.35, 0.45, 2.4, 6),
    new MeshStandardMaterial({ color: COLORS.trunk, roughness: 1, flatShading: true }),
    spots.length,
  );
  const blobs = new InstancedMesh(
    new CircleGeometry(1, 16),
    new MeshBasicMaterial({ color: 0x1d3a14, transparent: true, opacity: 0.28, depthWrite: false }),
    spots.length,
  );
  pineLeaves.name = 'Pines';
  broadLeaves.name = 'Broadleaf Trees';
  trunks.name = 'Tree Trunks';
  blobs.name = 'Tree Shadows';
  pineLeaves.castShadow = broadLeaves.castShadow = trunks.castShadow = true;
  const palette = [0x3f9a3a, 0x4fae3e, 0x2f8a3a, 0x5bb04a, 0x3c8f4f].map((c) => new Color(c));
  const m = new Matrix4();
  const q = new Quaternion();
  const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const pos = new Vector3();
  const scl = new Vector3();
  let pIdx = 0;
  let bIdx = 0;
  spots.forEach(([x, z, s, pine], i) => {
    q.setFromAxisAngle(UP, rand() * Math.PI * 2);
    scl.setScalar(s);
    pos.set(x, 1.2 * s, z);
    m.compose(pos, q, scl);
    trunks.setMatrixAt(i, m);
    const tint = palette[Math.floor(rand() * palette.length)];
    if (pine) {
      pos.set(x, 5.3 * s, z);
      m.compose(pos, q, scl);
      pineLeaves.setMatrixAt(pIdx, m);
      pineLeaves.setColorAt(pIdx++, tint);
    } else {
      pos.set(x, 4.3 * s, z);
      scl.set(s, s * 0.85, s);
      m.compose(pos, q, scl);
      broadLeaves.setMatrixAt(bIdx, m);
      broadLeaves.setColorAt(bIdx++, tint);
    }
    pos.set(x + 0.8 * s, -0.005, z + 0.6 * s);
    scl.setScalar(2.8 * s);
    m.compose(pos, flat, scl);
    blobs.setMatrixAt(i, m);
  });
  root.add(blobs, trunks, pineLeaves, broadLeaves);
}

// Distant low-poly hills ringing the circuit so the horizon is land, not a void.
{
  const rand = seeded(91);
  const count = 34;
  const hills = new InstancedMesh(
    new IcosahedronGeometry(1, 1),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    count,
  );
  hills.name = 'Hills';
  const tints = [0x5f9e4a, 0x6aa85a, 0x4f8f55, 0x78ad62].map((c) => new Color(c));
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.15;
    const r = 340 + rand() * 90;
    pos.set(-3 + Math.cos(a) * r * 1.15, -6, -13 + Math.sin(a) * r * 0.9);
    q.setFromAxisAngle(UP, rand() * Math.PI);
    scl.set(55 + rand() * 50, 22 + rand() * 38, 45 + rand() * 40);
    m.compose(pos, q, scl);
    hills.setMatrixAt(i, m);
    hills.setColorAt(i, tints[i % tints.length]);
  }
  root.add(hills);
}

export default root;
