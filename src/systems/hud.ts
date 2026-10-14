import { createSystem, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { LAP_COUNT, SAMPLE_COUNT } from '../track.js';
import { type EntityRef, trackSingle } from './query-refs.js';
import { DeltaLabel, intLabel, LAP_BANNER, LAP_OF, NO_DELTA, TimeLabel } from './race-labels.js';

const REFRESH = 0.1;
const BAR_BG = 'rgba(18, 22, 29, 0.82)';
const BAR_HIT = 'rgba(196, 38, 32, 0.9)';
const GREEN = '#3fcf5a';
const RED = '#ff5a4f';
const AMBER = '#ffb020';
const WHITE = '#ffffff';
const BAR_IDS = ['hud-lap', 'hud-time', 'hud-best', 'hud-delta', 'hud-speed'] as const;
const CENTER_IDS = ['msg-big', 'msg-sub', 'res-total', 'res-l1', 'res-l2', 'res-l3', 'res-best'] as const;
const READY_SUB = 'Press W or pull the trigger to start';

type TextId = (typeof BAR_IDS)[number] | (typeof CENTER_IDS)[number];
type ElKey = 'bar' | 'msg' | 'results' | 'badge' | 'panel';
type Styled = UIKit.Text | UIKit.Container;

/**
 * Screen-space race HUD: live bar (lap/time/best/delta/speed), centered countdown and
 * lap banners, finish results card, impact flash. Hides the instructions panel while racing.
 * Text is only rebuilt when its displayed value changes, and nothing is formatted while
 * the HUD is hidden (always, in XR).
 */
export class HudSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  private kartRef!: EntityRef;
  private text: Partial<Record<TextId, UIKit.Text | null>> = {};
  private els: Partial<Record<ElKey, UIKit.Container | null>> = {};
  private textCache: Partial<Record<TextId, string>> = {};
  private styleCache: Record<string, string> = {};
  private shown: Partial<Record<ElKey, boolean>> = {};
  private elapsed = 0;
  private flash = 0;
  private bestAtStart = -1;
  /** Lap time at each track sample for the current lap and the best lap: drives the live delta. */
  private curSplits = new Float32Array(SAMPLE_COUNT).fill(-1);
  private bestSplits = new Float32Array(SAMPLE_COUNT).fill(-1);
  private splitLap = -1;
  private liveDelta = Number.NaN;
  private readonly timeLabel = new TimeLabel();
  private readonly bestLabel = new TimeLabel();
  private readonly deltaLabel = new DeltaLabel();
  private readonly totalLabel = new TimeLabel();
  private readonly lapLabels = [new TimeLabel(), new TimeLabel(), new TimeLabel()];
  private readonly resBestLabel = new TimeLabel();
  private readonly bannerTime = new TimeLabel();
  private readonly bannerDelta = new DeltaLabel();
  private bannerSubLap = -1;
  private bannerSub = '';

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
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

  private trackSplits(): void {
    const kart = this.kartRef.current!;
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

  update(delta: number): void {
    const kart = this.kartRef.current;
    if (!kart) return;
    const impact = kart.getValue(Kart, 'impact')!;
    if (impact > 0.5) this.flash = 0.35;
    this.flash = Math.max(0, this.flash - delta);
    this.trackSplits();

    this.elapsed += delta;
    if (this.elapsed < REFRESH) return;
    this.elapsed = 0;

    const phase = kart.getValue(RaceState, 'phase');
    const best = kart.getValue(RaceState, 'bestLap')!;
    const racing = phase === RacePhase.Racing;
    const finished = phase === RacePhase.Finished;
    const idle = phase === RacePhase.Idle;
    if (idle) {
      this.bestAtStart = best;
      this.bannerSubLap = -1;
    }

    // In VR the steering-column display carries all of this; nothing floats over the track.
    const desktop = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.globals.liveDelta = racing ? this.liveDelta : Number.NaN;
    this.show('panel', idle);
    const barVisible = desktop && !idle && !finished;
    this.show('bar', barVisible);
    if (!desktop) {
      this.show('msg', false);
      this.show('results', false);
      return;
    }

    const lapTime = kart.getValue(RaceState, 'lapTime')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    const last = kart.getValue(RaceState, 'lastLap')!;
    const d = kart.getValue(RaceState, 'delta')!;

    if (barVisible) {
      this.style('bar:bg', 'bar', 'backgroundColor', this.flash > 0 ? BAR_HIT : BAR_BG);
      this.set('hud-lap', LAP_OF[Math.min(kart.getValue(RaceState, 'lap')!, LAP_COUNT)]);
      this.set('hud-time', this.timeLabel.get(racing ? lapTime : 0));
      this.set('hud-best', this.bestLabel.get(best));
      const live = racing && !Number.isNaN(this.liveDelta);
      const shown = live ? this.liveDelta : d;
      const hasDelta = live || (done > 1 && last >= 0);
      this.set('hud-delta', hasDelta ? this.deltaLabel.get(shown) : NO_DELTA);
      this.style('delta:color', 'hud-delta', 'color', !hasDelta ? WHITE : shown <= 0 ? GREEN : RED);
      this.set('hud-speed', intLabel(Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6)));
    }

    let big = '';
    let sub = '';
    let bigColor = WHITE;
    if (idle) {
      big = 'READY';
      sub = READY_SUB;
    } else if (phase === RacePhase.Countdown) {
      big = intLabel(Math.max(1, Math.ceil(kart.getValue(RaceState, 'countdown')!)));
      sub = 'Get ready';
      bigColor = AMBER;
    } else if (racing && done === 0 && lapTime < 0.8) {
      big = 'GO!';
      bigColor = GREEN;
    } else if (racing && done > 0 && lapTime < 1.8) {
      const final = done === LAP_COUNT - 1;
      big = final ? 'FINAL LAP' : LAP_BANNER[done + 1];
      if (this.bannerSubLap !== done) {
        this.bannerSubLap = done;
        const lastText = this.bannerTime.get(last);
        this.bannerSub = done > 1 && last >= 0 ? `${lastText}   ${this.bannerDelta.get(d)}` : lastText;
      }
      sub = this.bannerSub;
      bigColor = final ? AMBER : WHITE;
    }
    this.show('msg', big !== '');
    if (big !== '') {
      this.set('msg-big', big);
      this.set('msg-sub', sub);
      this.style('big:size', 'msg-big', 'fontSize', big.length > 4 ? '64px' : '96px');
      this.style('big:color', 'msg-big', 'color', bigColor);
      this.style('sub:display', 'msg-sub', 'display', sub ? 'flex' : 'none');
    }

    this.show('results', finished);
    if (finished) {
      const l1 = kart.getValue(RaceState, 'lap1')!;
      const l2 = kart.getValue(RaceState, 'lap2')!;
      const l3 = kart.getValue(RaceState, 'lap3')!;
      this.set('res-total', this.totalLabel.get(l1 >= 0 && l2 >= 0 && l3 >= 0 ? l1 + l2 + l3 : -1));
      this.set('res-l1', this.lapLabels[0].get(l1));
      this.set('res-l2', this.lapLabels[1].get(l2));
      this.set('res-l3', this.lapLabels[2].get(l3));
      this.set('res-best', this.resBestLabel.get(best));
      this.style('l1:color', 'res-l1', 'color', l1 >= 0 && l1 === best ? GREEN : WHITE);
      this.style('l2:color', 'res-l2', 'color', l2 >= 0 && l2 === best ? GREEN : WHITE);
      this.style('l3:color', 'res-l3', 'color', l3 >= 0 && l3 === best ? GREEN : WHITE);
      this.show('badge', best >= 0 && (this.bestAtStart < 0 || best < this.bestAtStart));
    }
  }

  private show(key: ElKey, visible: boolean): void {
    if (this.shown[key] === visible) return;
    this.shown[key] = visible;
    this.els[key]?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  /** `cacheKey` must be a constant string so lookups never build a key at runtime. */
  private style(cacheKey: string, target: TextId | ElKey, prop: string, value: string): void {
    if (this.styleCache[cacheKey] === value) return;
    this.styleCache[cacheKey] = value;
    const el: Styled | null | undefined = this.text[target as TextId] ?? this.els[target as ElKey];
    el?.setProperties({ [prop]: value } as never);
  }

  private set(id: TextId, value: string): void {
    if (this.textCache[id] === value) return;
    this.textCache[id] = value;
    this.text[id]?.setProperties({ text: value });
  }
}
