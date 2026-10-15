import { LAP_COUNT } from '../track.js';

const PAD2: string[] = [];
for (let i = 0; i < 100; i++) PAD2.push(i < 10 ? `0${i}` : String(i));

const INT_TABLE_SIZE = 400;
const INTS: string[] = [];
for (let i = 0; i < INT_TABLE_SIZE; i++) INTS.push(String(i));

/** Interned decimal string for small non-negative integers (speed, countdown). */
export function intLabel(n: number): string {
  return n >= 0 && n < INT_TABLE_SIZE ? INTS[n] : String(n);
}

/** "2/3" lap counters, prebuilt. */
export const LAP_OF: readonly string[] = Array.from({ length: LAP_COUNT + 1 }, (_, i) => `${i}/${LAP_COUNT}`);
/** "LAP 2" banners, prebuilt. */
export const LAP_BANNER: readonly string[] = Array.from({ length: LAP_COUNT + 2 }, (_, i) => `LAP ${i}`);

export const NO_TIME = '--:--.--';
export const NO_DELTA = '--.--';

function formatCentis(cs: number): string {
  const m = Math.floor(cs / 6000);
  const rem = cs - m * 6000;
  const s = Math.floor(rem / 100);
  return `${m}:${PAD2[s]}.${PAD2[rem - s * 100]}`;
}

/**
 * m:ss.cc label that only builds a new string when the displayed centisecond
 * changes, so a value that holds still costs nothing per refresh.
 */
export class TimeLabel {
  private key = Number.NaN;
  private text = '';
  constructor(private readonly prefix = '') {}

  get(t: number): string {
    const key = t < 0 ? -1 : Math.round(t * 100);
    if (key !== this.key) {
      this.key = key;
      this.text = key < 0 ? this.prefix + NO_TIME : this.prefix + formatCentis(key);
    }
    return this.text;
  }
}

/** Signed "+1.23" / "-0.45" delta label, rebuilt only when the displayed value changes. */
export class DeltaLabel {
  private key = Number.NaN;
  private text = '';

  get(d: number): string {
    const cs = Math.round(Math.abs(d) * 100);
    const key = d < 0 ? -cs - 1 : cs;
    if (key !== this.key) {
      this.key = key;
      const whole = Math.floor(cs / 100);
      this.text = `${d < 0 ? '-' : '+'}${whole}.${PAD2[cs - whole * 100]}`;
    }
    return this.text;
  }
}
