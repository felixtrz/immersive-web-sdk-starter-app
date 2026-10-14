import { createSystem, Entity, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { Kart, RacePhase, RaceState } from '../race-components.js';
import { LAP_COUNT } from '../track.js';

const REFRESH = 0.1;
const LIGHT_ON = '#e8322b';
const LIGHT_GO = '#3fcf5a';
const LIGHT_OFF = '#3a3f47';
const TEXT_FIELDS = ['speed', 'lap', 'time', 'best', 'delta', 'status'] as const;

function fmt(t: number): string {
  if (t < 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

/** Writes race state into the cockpit dashboard at 10 Hz and wires the race panel buttons. */
export class DashboardSystem extends createSystem({
  kart: { required: [Kart, RaceState] },
}) {
  private text: Partial<Record<(typeof TEXT_FIELDS)[number], UIKit.Text>> = {};
  private lights: UIKit.Container[] = [];
  private cache: Record<string, string> = {};
  private elapsed = 0;

  init(): void {
    const dash = this.world.getSceneObject<UIKitMLAsset>('dashboard');
    for (const id of TEXT_FIELDS) {
      const el = dash?.getElementById<UIKit.Text>(id);
      if (el) this.text[id] = el;
    }
    // The center HUD owns race-state messaging; the dash keeps gauges and start lights only.
    dash?.getElementById<UIKit.Text>('status')?.setProperties({ display: 'none' });
    for (let i = 1; i <= 3; i++) {
      const el = dash?.getElementById<UIKit.Container>(`light-${i}`);
      if (el) this.lights.push(el);
    }

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
    this.elapsed += delta;
    if (this.elapsed < REFRESH) return;
    this.elapsed = 0;
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    if (!kart) return;

    const phase = kart.getValue(RaceState, 'phase');
    const kmh = Math.round(Math.abs(kart.getValue(Kart, 'speed')!) * 3.6);
    const best = kart.getValue(RaceState, 'bestLap')!;
    const done = kart.getValue(RaceState, 'lapsCompleted')!;
    const delta2 = kart.getValue(RaceState, 'delta')!;
    const last = kart.getValue(RaceState, 'lastLap')!;

    this.set('speed', String(kmh));
    this.set('lap', `${Math.min(kart.getValue(RaceState, 'lap')!, LAP_COUNT)}/${LAP_COUNT}`);
    this.set('time', fmt(phase === RacePhase.Finished ? last : kart.getValue(RaceState, 'lapTime')!));
    this.set('best', fmt(best));
    this.set('delta', done > 1 && last >= 0 ? `${delta2 > 0 ? '+' : ''}${delta2.toFixed(2)}` : '--.--');

    let status: string;
    let lit = 0;
    let go = false;
    if (phase === RacePhase.Idle) status = 'Throttle to start';
    else if (phase === RacePhase.Countdown) {
      const c = kart.getValue(RaceState, 'countdown')!;
      lit = 3 - Math.ceil(c) + 1;
      status = 'Get ready';
    } else if (phase === RacePhase.Racing) {
      go = kart.getValue(RaceState, 'lapTime')! < 1.5 && done === 0;
      status = last >= 0 ? `Last ${fmt(last)}` : 'Go!';
    } else status = 'Finished';
    this.set('status', status);

    this.lights.forEach((light, i) => {
      const color = go ? LIGHT_GO : i < lit ? LIGHT_ON : LIGHT_OFF;
      const key = `light-${i}`;
      if (this.cache[key] !== color) {
        this.cache[key] = color;
        light.setProperties({ backgroundColor: color });
      }
    });
  }

  private set(id: (typeof TEXT_FIELDS)[number], value: string): void {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    this.text[id]?.setProperties({ text: value });
  }
}
