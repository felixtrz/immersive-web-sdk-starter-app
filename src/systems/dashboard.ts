import { createSystem, Entity, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { Kart, KartControls, RacePhase, RaceState } from '../race-components.js';
import { LAP_COUNT } from '../track.js';

const REFRESH = 0.1;
const PEDAL_REFRESH = 1 / 30;
const PEDAL_HEIGHT = 150;
const LIGHT_ON = '#e8322b';
const LIGHT_GO = '#3fcf5a';
const LIGHT_OFF = '#3a3f47';
const GREEN = '#3fcf5a';
const RED = '#ff5a4f';
const AMBER = '#ffb020';
const CREAM = '#f4f1ea';
const WHITE = '#ffffff';
const TEXT_FIELDS = ['speed', 'lap', 'time', 'best', 'delta', 'status'] as const;

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
 * Drives the steering-column display: gauges, start lights, race messages and
 * live throttle/brake bars. In VR this is the only race readout, so it carries
 * everything the floating desktop HUD shows.
 */
export class DashboardSystem extends createSystem({
  kart: { required: [Kart, RaceState, KartControls] },
}) {
  private text: Partial<Record<(typeof TEXT_FIELDS)[number], UIKit.Text>> = {};
  private lights: UIKit.Container[] = [];
  private thr: UIKit.Container | undefined;
  private brk: UIKit.Container | undefined;
  private cache: Record<string, string> = {};
  private elapsed = 0;
  private pedalElapsed = 0;

  init(): void {
    const dash = this.world.getSceneObject<UIKitMLAsset>('dashboard');
    for (const id of TEXT_FIELDS) {
      const el = dash?.getElementById<UIKit.Text>(id);
      if (el) this.text[id] = el;
    }
    for (let i = 1; i <= 3; i++) {
      const el = dash?.getElementById<UIKit.Container>(`light-${i}`);
      if (el) this.lights.push(el);
    }
    this.thr = dash?.getElementById<UIKit.Container>('thr-fill') ?? undefined;
    this.brk = dash?.getElementById<UIKit.Container>('brk-fill') ?? undefined;

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
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;

    this.pedalElapsed += delta;
    if (this.pedalElapsed >= PEDAL_REFRESH) {
      this.pedalElapsed = 0;
      this.pedal('thr', this.thr, kart.getValue(KartControls, 'throttle')!);
      this.pedal('brk', this.brk, kart.getValue(KartControls, 'brake')!);
    }

    this.elapsed += delta;
    if (this.elapsed < REFRESH) return;
    this.elapsed = 0;

    const phase = kart.getValue(RaceState, 'phase');
    const kmh = Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6);
    const best = kart.getValue(RaceState, 'bestLap')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    const lapTime = kart.getValue(RaceState, 'lapTime')!;
    const lapDelta = kart.getValue(RaceState, 'delta')!;
    const last = kart.getValue(RaceState, 'lastLap')!;
    const racing = phase === RacePhase.Racing;

    this.set('speed', String(kmh));
    this.set('lap', `${Math.min(kart.getValue(RaceState, 'lap')!, LAP_COUNT)}/${LAP_COUNT}`);
    this.set('time', fmt(phase === RacePhase.Finished ? last : racing ? lapTime : 0));
    this.set('best', fmt(best));

    const live = this.globals.liveDelta as number | undefined;
    const hasLive = racing && live !== undefined && !Number.isNaN(live);
    const shownDelta = hasLive ? live : lapDelta;
    const hasDelta = hasLive || (done > 1 && last >= 0);
    this.set('delta', hasDelta ? signed(shownDelta) : '--.--');
    this.color('delta', !hasDelta ? WHITE : shownDelta <= 0 ? GREEN : RED);

    let status = '';
    let statusColor = CREAM;
    let lit = 0;
    let go = false;
    if (phase === RacePhase.Idle) {
      status = 'READY - THROTTLE';
    } else if (phase === RacePhase.Countdown) {
      const c = kart.getValue(RaceState, 'countdown')!;
      lit = 3 - Math.ceil(c) + 1;
      status = String(Math.max(1, Math.ceil(c)));
      statusColor = AMBER;
    } else if (racing) {
      go = lapTime < 1.5 && done === 0;
      if (go) {
        status = 'GO!';
        statusColor = GREEN;
      } else if (done > 0 && lapTime < 2.5) {
        status = done === LAP_COUNT - 1 ? 'FINAL LAP' : `LAP ${done + 1}`;
        statusColor = done === LAP_COUNT - 1 ? AMBER : CREAM;
      } else {
        status = last >= 0 ? `LAST ${fmt(last)}` : '';
      }
    } else {
      const laps = [
        kart.getValue(RaceState, 'lap1')!,
        kart.getValue(RaceState, 'lap2')!,
        kart.getValue(RaceState, 'lap3')!,
      ];
      const total = laps.every((l) => l >= 0) ? laps[0] + laps[1] + laps[2] : -1;
      status = `FINISH ${fmt(total)}`;
      statusColor = GREEN;
    }
    this.set('status', status);
    this.color('status', statusColor);

    this.lights.forEach((light, i) => {
      const color = go ? LIGHT_GO : i < lit ? LIGHT_ON : LIGHT_OFF;
      const key = `light-${i}`;
      if (this.cache[key] !== color) {
        this.cache[key] = color;
        light.setProperties({ backgroundColor: color });
      }
    });
  }

  private pedal(key: string, el: UIKit.Container | undefined, value: number): void {
    const h = String(Math.round(Math.max(0, Math.min(1, value)) * PEDAL_HEIGHT));
    if (this.cache[key] === h) return;
    this.cache[key] = h;
    el?.setProperties({ height: Number(h) });
  }

  private color(id: (typeof TEXT_FIELDS)[number], value: string): void {
    const k = `${id}:color`;
    if (this.cache[k] === value) return;
    this.cache[k] = value;
    this.text[id]?.setProperties({ color: value });
  }

  private set(id: (typeof TEXT_FIELDS)[number], value: string): void {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    this.text[id]?.setProperties({ text: value });
  }
}
