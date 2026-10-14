import { createSystem, Entity, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { LAP_COUNT, SAMPLE_COUNT } from '../track.js';

const REFRESH = 1 / 20;
const BAR_BG = 'rgba(18, 22, 29, 0.82)';
const BAR_HIT = 'rgba(196, 38, 32, 0.9)';
const GREEN = '#3fcf5a';
const RED = '#ff5a4f';
const AMBER = '#ffb020';
const WHITE = '#ffffff';
const BAR_IDS = ['hud-lap', 'hud-time', 'hud-best', 'hud-delta', 'hud-speed'] as const;
const CENTER_IDS = ['msg-big', 'msg-sub', 'res-total', 'res-l1', 'res-l2', 'res-l3', 'res-best'] as const;

type TextId = (typeof BAR_IDS)[number] | (typeof CENTER_IDS)[number];

function fmt(t: number): string {
  if (t < 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

function signed(d: number): string {
  return `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}`;
}

/**
 * Screen-space race HUD: live bar (lap/time/best/delta/speed), centered countdown and
 * lap banners, finish results card, impact flash. Hides the instructions panel while racing.
 */
export class HudSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  private text: Partial<Record<TextId, UIKit.Text | null>> = {};
  private els: Record<string, UIKit.Container | null | undefined> = {};
  private cache: Record<string, string> = {};
  private elapsed = 0;
  private flash = 0;
  private bestAtStart = -1;
  /** Lap time at each track sample for the current lap and the best lap: drives the live delta. */
  private curSplits = new Float32Array(SAMPLE_COUNT).fill(-1);
  private bestSplits = new Float32Array(SAMPLE_COUNT).fill(-1);
  private splitLap = -1;
  private liveDelta = Number.NaN;

  private trackSplits(kart: Entity): void {
    if (kart.getValue(RaceState, 'phase') !== RacePhase.Racing) {
      this.splitLap = -1;
      this.liveDelta = Number.NaN;
      return;
    }
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    if (done !== this.splitLap) {
      if (this.splitLap >= 0 && done > this.splitLap) {
        const last = kart.getValue(RaceState, 'lastLap')!;
        const best = kart.getValue(RaceState, 'bestLap')!;
        if (last >= 0 && last <= best + 1e-4) {
          this.bestSplits.set(this.curSplits);
          // Low frame rates (or fast-forward) skip samples; carry the last known split forward.
          let prev = 0;
          for (let i = 0; i < SAMPLE_COUNT; i++) {
            if (this.bestSplits[i] < 0) this.bestSplits[i] = prev;
            else prev = this.bestSplits[i];
          }
        }
      }
      this.curSplits.fill(-1);
      this.splitLap = done;
    }
    const idx = kart.getValue(Kart, 'trackIdx')!;
    if (idx < 0) return;
    const t = kart.getValue(RaceState, 'lapTime')!;
    this.curSplits[idx] = t;
    const ref = this.bestSplits[idx];
    this.liveDelta = ref >= 0 && t > 1 ? t - ref : Number.NaN;
  }

  init(): void {
    const bar = this.world.getSceneObject<UIKitMLAsset>('hud');
    const center = this.world.getSceneObject<UIKitMLAsset>('hud-center');
    const panel = this.world.getSceneObject<UIKitMLAsset>('race-panel');
    for (const id of BAR_IDS) this.text[id] = bar?.getElementById<UIKit.Text>(id);
    for (const id of CENTER_IDS) this.text[id] = center?.getElementById<UIKit.Text>(id);
    this.els.bar = bar?.getElementById<UIKit.Container>('hud-root');
    this.els.msg = center?.getElementById<UIKit.Container>('msg');
    this.els.results = center?.getElementById<UIKit.Container>('results');
    this.els.badge = center?.getElementById<UIKit.Container>('res-badge');
    this.els.panel = panel?.getElementById<UIKit.Container>('panel-root');
  }

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;
    const impact = kart.getValue(Kart, 'impact')!;
    if (impact > 0.5) this.flash = 0.35;
    this.flash = Math.max(0, this.flash - delta);
    this.trackSplits(kart);

    this.elapsed += delta;
    if (this.elapsed < REFRESH) return;
    this.elapsed = 0;

    const phase = kart.getValue(RaceState, 'phase');
    const lapTime = kart.getValue(RaceState, 'lapTime')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    const last = kart.getValue(RaceState, 'lastLap')!;
    const best = kart.getValue(RaceState, 'bestLap')!;
    const d = kart.getValue(RaceState, 'delta')!;
    const kmh = Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6);

    const racing = phase === RacePhase.Racing;
    const finished = phase === RacePhase.Finished;
    const idle = phase === RacePhase.Idle;
    if (idle) this.bestAtStart = best;

    // In VR the steering-column display carries all of this; nothing floats over the track.
    const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.globals.liveDelta = racing ? this.liveDelta : Number.NaN;
    this.show('bar', desktop && !idle && !finished);
    this.show('panel', idle);
    this.style('bar', 'backgroundColor', this.flash > 0 ? BAR_HIT : BAR_BG);

    this.set('hud-lap', `${Math.min(kart.getValue(RaceState, 'lap')!, LAP_COUNT)}/${LAP_COUNT}`);
    this.set('hud-time', fmt(finished ? last : racing ? lapTime : 0));
    this.set('hud-best', fmt(best));
    const live = racing && !Number.isNaN(this.liveDelta);
    const shown = live ? this.liveDelta : d;
    const hasDelta = live || (done > 1 && last >= 0);
    this.set('hud-delta', hasDelta ? signed(shown) : '--.--');
    this.style('hud-delta', 'color', !hasDelta ? WHITE : shown <= 0 ? GREEN : RED);
    this.set('hud-speed', String(kmh));

    let big = '';
    let sub = '';
    let bigColor = WHITE;
    if (idle) {
      big = 'READY';
      sub = 'Press W or pull the trigger to start';
      bigColor = WHITE;
    } else if (phase === RacePhase.Countdown) {
      big = String(Math.max(1, Math.ceil(kart.getValue(RaceState, 'countdown')!)));
      sub = 'Get ready';
      bigColor = AMBER;
    } else if (racing && done === 0 && lapTime < 0.8) {
      big = 'GO!';
      bigColor = GREEN;
    } else if (racing && done > 0 && lapTime < 1.8) {
      big = done === LAP_COUNT - 1 ? 'FINAL LAP' : `LAP ${done + 1}`;
      sub = done > 1 && last >= 0 ? `${fmt(last)}   ${signed(d)}` : fmt(last);
      bigColor = done === LAP_COUNT - 1 ? AMBER : WHITE;
    }
    this.show('msg', desktop && big !== '');
    if (big !== '') {
      this.set('msg-big', big);
      this.set('msg-sub', sub);
      this.style('msg-big', 'fontSize', big.length > 4 ? '64px' : '96px');
      this.style('msg-big', 'color', bigColor);
      this.style('msg-sub', 'display', sub ? 'flex' : 'none');
    }

    this.show('results', desktop && finished);
    if (finished) {
      const laps = [
        kart.getValue(RaceState, 'lap1')!,
        kart.getValue(RaceState, 'lap2')!,
        kart.getValue(RaceState, 'lap3')!,
      ];
      const total = laps.every((l) => l >= 0) ? laps[0] + laps[1] + laps[2] : -1;
      this.set('res-total', fmt(total));
      this.set('res-l1', fmt(laps[0]));
      this.set('res-l2', fmt(laps[1]));
      this.set('res-l3', fmt(laps[2]));
      this.set('res-best', fmt(best));
      for (let i = 0; i < 3; i++) {
        this.style(`res-l${i + 1}` as TextId, 'color', laps[i] >= 0 && laps[i] === best ? GREEN : WHITE);
      }
      this.show('badge', best >= 0 && (this.bestAtStart < 0 || best < this.bestAtStart));
    }
  }

  private show(key: string, visible: boolean): void {
    const v = visible ? 'flex' : 'none';
    const k = `show:${key}`;
    if (this.cache[k] === v) return;
    this.cache[k] = v;
    this.els[key]?.setProperties({ display: v });
  }

  private style(key: string, prop: string, value: string): void {
    const k = `${key}:${prop}`;
    if (this.cache[k] === value) return;
    this.cache[k] = value;
    const el = (this.text as Record<string, UIKit.Text | null | undefined>)[key] ?? this.els[key];
    el?.setProperties({ [prop]: value } as never);
  }

  private set(id: TextId, value: string): void {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    this.text[id]?.setProperties({ text: value });
  }
}
