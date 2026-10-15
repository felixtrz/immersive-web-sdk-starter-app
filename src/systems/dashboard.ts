import { createSystem, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { Kart, KartControls, RacePhase, RaceState } from '../race-components.js';
import { LAP_COUNT } from '../track.js';
import { type EntityRef, trackSingle } from './query-refs.js';
import { DeltaLabel, intLabel, LAP_BANNER, LAP_OF, NO_DELTA, TimeLabel } from './race-labels.js';

const REFRESH = 0.1;
const PEDAL_REFRESH = 1 / 30;
/** Pedal bars scale in fixed steps so a held pedal pushes no updates and nothing re-runs layout. */
const PEDAL_STEPS = 16;
const PEDAL_MIN_SCALE = 0.001;
const LIGHT_ON = '#e8322b';
const LIGHT_GO = '#3fcf5a';
const LIGHT_OFF = '#3a3f47';
const GREEN = '#3fcf5a';
const RED = '#ff5a4f';
const AMBER = '#ffb020';
const CREAM = '#f4f1ea';
const WHITE = '#ffffff';
const TEXT_FIELDS = ['speed', 'lap', 'time', 'best', 'delta', 'status'] as const;
type Field = (typeof TEXT_FIELDS)[number];
type ColorField = 'delta' | 'status';

/**
 * Drives the steering-column display: gauges, start lights, race messages and
 * live throttle/brake bars. In VR this is the only race readout, so it carries
 * everything the floating desktop HUD shows. Values are compared as numbers and
 * only formatted / pushed to UIKit when what is displayed actually changes.
 */
export class DashboardSystem extends createSystem({
  kart: { required: [Kart, RaceState, KartControls] },
}) {
  private kartRef!: EntityRef;
  private text: Partial<Record<Field, UIKit.Text>> = {};
  private lights: UIKit.Container[] = [];
  private lightColors: string[] = [];
  private thr: UIKit.Container | undefined;
  private brk: UIKit.Container | undefined;
  private thrStep = 0;
  private brkStep = 0;
  private textCache: Partial<Record<Field, string>> = {};
  private colorCache: Partial<Record<ColorField, string>> = {};
  private elapsed = 0;
  private pedalElapsed = 0;
  private readonly timeLabel = new TimeLabel();
  private readonly bestLabel = new TimeLabel();
  private readonly lastLabel = new TimeLabel('LAST ');
  private readonly finishLabel = new TimeLabel('FINISH ');
  private readonly deltaLabel = new DeltaLabel();

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
    const dash = this.world.getSceneObject<UIKitMLAsset>('dashboard');
    for (const id of TEXT_FIELDS) {
      const el = dash?.getElementById<UIKit.Text>(id);
      if (el) this.text[id] = el;
    }
    for (let i = 1; i <= 3; i++) {
      const el = dash?.getElementById<UIKit.Container>(`light-${i}`);
      if (el) {
        this.lights.push(el);
        this.lightColors.push('');
      }
    }
    this.thr = dash?.getElementById<UIKit.Container>('thr-fill') ?? undefined;
    this.brk = dash?.getElementById<UIKit.Container>('brk-fill') ?? undefined;
    this.thr?.setProperties({ transformOriginY: 'bottom', transformScaleY: PEDAL_MIN_SCALE });
    this.brk?.setProperties({ transformOriginY: 'bottom', transformScaleY: PEDAL_MIN_SCALE });

    const panel = this.world.getSceneObject<UIKitMLAsset>('race-panel');
    const xrButton = panel?.getElementById('xr-button');
    const restartButton = panel?.getElementById('restart-button');
    const restart = () => (this.globals.restartRace as (() => void) | undefined)?.();
    restartButton?.addEventListener('click', restart);
    this.cleanupFuncs.push(() => restartButton?.removeEventListener('click', restart));
    if (xrButton) {
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
      } else {
        const launch = () => this.world.launchXR();
        xrButton.addEventListener('click', launch);
        this.cleanupFuncs.push(
          () => xrButton.removeEventListener('click', launch),
          this.world.visibilityState.subscribe((state) => {
            xrButton.setProperties({ display: state === VisibilityState.NonImmersive ? 'flex' : 'none' });
          }),
        );
      }
    }
  }

  update(delta: number): void {
    const kart = this.kartRef.current;
    if (!kart) return;

    this.pedalElapsed += delta;
    if (this.pedalElapsed >= PEDAL_REFRESH) {
      this.pedalElapsed = 0;
      const thr = pedalStep(kart.getValue(KartControls, 'throttle')!);
      if (thr !== this.thrStep) {
        this.thrStep = thr;
        this.thr?.setProperties({ transformScaleY: stepScale(thr) });
      }
      const brk = pedalStep(kart.getValue(KartControls, 'brake')!);
      if (brk !== this.brkStep) {
        this.brkStep = brk;
        this.brk?.setProperties({ transformScaleY: stepScale(brk) });
      }
    }

    this.elapsed += delta;
    if (this.elapsed < REFRESH) return;
    this.elapsed = 0;

    const phase = kart.getValue(RaceState, 'phase');
    const best = kart.getValue(RaceState, 'bestLap')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    const lapTime = kart.getValue(RaceState, 'lapTime')!;
    const lapDelta = kart.getValue(RaceState, 'delta')!;
    const last = kart.getValue(RaceState, 'lastLap')!;
    const racing = phase === RacePhase.Racing;

    this.set('speed', intLabel(Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6)));
    this.set('lap', LAP_OF[Math.min(kart.getValue(RaceState, 'lap')!, LAP_COUNT)]);
    this.set('time', this.timeLabel.get(phase === RacePhase.Finished ? last : racing ? lapTime : 0));
    this.set('best', this.bestLabel.get(best));

    const live = this.globals.liveDelta as number | undefined;
    const hasLive = racing && live !== undefined && !Number.isNaN(live);
    const shownDelta = hasLive ? live : lapDelta;
    const hasDelta = hasLive || (done > 1 && last >= 0);
    this.set('delta', hasDelta ? this.deltaLabel.get(shownDelta) : NO_DELTA);
    this.color('delta', !hasDelta ? WHITE : shownDelta <= 0 ? GREEN : RED);

    let status = '';
    let statusColor = CREAM;
    let lit = 0;
    let go = false;
    if (phase === RacePhase.Idle) {
      status = 'READY - THROTTLE';
    } else if (phase === RacePhase.Countdown) {
      const c = Math.ceil(kart.getValue(RaceState, 'countdown')!);
      lit = 3 - c + 1;
      status = intLabel(Math.max(1, c));
      statusColor = AMBER;
    } else if (racing) {
      go = lapTime < 1.5 && done === 0;
      if (go) {
        status = 'GO!';
        statusColor = GREEN;
      } else if (done > 0 && lapTime < 2.5) {
        const final = done === LAP_COUNT - 1;
        status = final ? 'FINAL LAP' : LAP_BANNER[done + 1];
        statusColor = final ? AMBER : CREAM;
      } else {
        status = last >= 0 ? this.lastLabel.get(last) : '';
      }
    } else {
      const l1 = kart.getValue(RaceState, 'lap1')!;
      const l2 = kart.getValue(RaceState, 'lap2')!;
      const l3 = kart.getValue(RaceState, 'lap3')!;
      status = this.finishLabel.get(l1 >= 0 && l2 >= 0 && l3 >= 0 ? l1 + l2 + l3 : -1);
      statusColor = GREEN;
    }
    this.set('status', status);
    this.color('status', statusColor);

    for (let i = 0; i < this.lights.length; i++) {
      const color = go ? LIGHT_GO : i < lit ? LIGHT_ON : LIGHT_OFF;
      if (this.lightColors[i] === color) continue;
      this.lightColors[i] = color;
      this.lights[i].setProperties({ backgroundColor: color });
    }
  }

  private color(id: ColorField, value: string): void {
    if (this.colorCache[id] === value) return;
    this.colorCache[id] = value;
    this.text[id]?.setProperties({ color: value });
  }

  private set(id: Field, value: string): void {
    if (this.textCache[id] === value) return;
    this.textCache[id] = value;
    this.text[id]?.setProperties({ text: value });
  }
}

function pedalStep(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * PEDAL_STEPS);
}

function stepScale(step: number): number {
  return step === 0 ? PEDAL_MIN_SCALE : step / PEDAL_STEPS;
}
