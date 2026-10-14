/**
 * Sunny Circuit track geometry. Pure and deterministic: imported by scene
 * assets (evaluated in both the runtime and editor realms) and by systems.
 */

const CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-81, 108],
  [81, 108],
  [148, 81],
  [169, 27],
  [148, -27],
  [81, -40],
  [40, -81],
  [54, -121],
  [0, -135],
  [-81, -121],
  [-148, -81],
  [-175, -13],
  [-162, 54],
  [-135, 94],
];

const SAMPLES_PER_SEGMENT = 40;

export const TRACK_HALF_WIDTH = 5;
export const CURB_WIDTH = 0.8;
export const BARRIER_OFFSET = 7;
export const BARRIER_THICKNESS = 1;
/** Max lateral offset of the kart's center before it touches a barrier. */
export const KART_LATERAL_LIMIT = BARRIER_OFFSET - BARRIER_THICKNESS / 2 - 0.75;

export const SAMPLE_COUNT = CONTROL_POINTS.length * SAMPLES_PER_SEGMENT;
/** Centerline samples (x, z). */
export const SAMPLE_X = new Float32Array(SAMPLE_COUNT);
export const SAMPLE_Z = new Float32Array(SAMPLE_COUNT);
/** Unit normal pointing to the right of the driving direction (x, z). */
export const NORMAL_X = new Float32Array(SAMPLE_COUNT);
export const NORMAL_Z = new Float32Array(SAMPLE_COUNT);

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

{
  const n = CONTROL_POINTS.length;
  for (let seg = 0; seg < n; seg++) {
    const p0 = CONTROL_POINTS[(seg - 1 + n) % n];
    const p1 = CONTROL_POINTS[seg];
    const p2 = CONTROL_POINTS[(seg + 1) % n];
    const p3 = CONTROL_POINTS[(seg + 2) % n];
    for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT;
      const i = seg * SAMPLES_PER_SEGMENT + s;
      SAMPLE_X[i] = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
      SAMPLE_Z[i] = catmullRom(p0[1], p1[1], p2[1], p3[1], t);
    }
  }
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const next = (i + 1) % SAMPLE_COUNT;
    const prev = (i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT;
    const tx = SAMPLE_X[next] - SAMPLE_X[prev];
    const tz = SAMPLE_Z[next] - SAMPLE_Z[prev];
    const len = Math.hypot(tx, tz) || 1;
    // right = tangent x up  ->  (-tz, tx) for a y-up, right-handed frame
    NORMAL_X[i] = -tz / len;
    NORMAL_Z[i] = tx / len;
  }
}

/** Index of the nearest centerline sample. Searches near `hint` when given. */
export function nearestSample(x: number, z: number, hint = -1, window = 24): number {
  let best = 0;
  let bestD = Infinity;
  if (hint >= 0) {
    for (let k = -window; k <= window; k++) {
      const i = (hint + k + SAMPLE_COUNT) % SAMPLE_COUNT;
      const dx = SAMPLE_X[i] - x;
      const dz = SAMPLE_Z[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Fall back to a full search if the hint has drifted (e.g. after a teleport).
    if (bestD < 15 * 15) return best;
    bestD = Infinity;
  }
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const dx = SAMPLE_X[i] - x;
    const dz = SAMPLE_Z[i] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Signed lateral offset from the centerline at sample `i` (positive = right). */
export function lateralOffset(i: number, x: number, z: number): number {
  return (x - SAMPLE_X[i]) * NORMAL_X[i] + (z - SAMPLE_Z[i]) * NORMAL_Z[i];
}

const GATE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 108],
  [169, 27],
  [0, -135],
  [-175, -13],
];
/** Gate sample indices; gate 0 is the start/finish line. */
export const GATE_INDICES: readonly number[] = GATE_POINTS.map(([x, z]) => nearestSample(x, z));

export const LAP_COUNT = 3;

/** Spawn on the grid behind the start line, facing +x (yaw -90deg, kart forward is -Z). */
export const SPAWN = { x: -8, z: 108, yaw: -Math.PI / 2 } as const;
