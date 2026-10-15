import { createSystem } from '@iwsdk/core';
import { Kart, KartAudioState, RacePhase, RaceState } from '../race-components.js';
import { type EntityRef, trackSingle } from './query-refs.js';

const ENGINE_BASE_HZ = 48;
const ENGINE_HZ_PER_MS = 5.2;
const HZ_EPSILON = 0.4;
const GAIN_EPSILON = 0.002;

/**
 * WebAudio synth (no audio files in the repo): engine = two detuned oscillators
 * through a low-pass, squeal = band-passed noise, plus impact/beep/chime one-shots.
 * The engine pitch ratio is mirrored into KartAudioState so it can be asserted in ECS.
 */
export class KartAudioSystem extends createSystem({
  kart: { required: [Kart, KartAudioState, RaceState] },
}) {
  private ctx: AudioContext | null = null;
  private engineA: OscillatorNode | null = null;
  private engineB: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private squealGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPhase = '';
  private lastLight = -1;
  private lastLaps = 0;
  private lastBestVersion = 0;
  private impactCooldown = 0;
  private sentHz = -1;
  private sentEngineGain = -1;
  private sentSquealGain = -1;
  private kartRef!: EntityRef;

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
    const unlock = () => this.ensureContext();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', unlock),
      () => window.removeEventListener('pointerdown', unlock),
      this.world.visibilityState.subscribe(() => this.ensureContext()),
      () => {
        void this.ctx?.close();
        this.ctx = null;
      },
    );
  }

  update(delta: number): void {
    const kart = this.kartRef.current;
    if (!kart) return;
    const speed = Math.abs(kart.getValue(Kart, 'speed')!);
    const slip = kart.getValue(Kart, 'slip')!;
    const pitch = (ENGINE_BASE_HZ + speed * ENGINE_HZ_PER_MS) / ENGINE_BASE_HZ;
    const squeal = Math.min(1, Math.max(0, (slip - 1.2) / 3)) * Math.min(1, speed / 8);
    kart.setValue(KartAudioState, 'enginePitch', pitch);
    kart.setValue(KartAudioState, 'squealGain', squeal);

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Each setTargetAtTime queues an automation event on the audio thread; only
    // schedule one when the target has moved by an audible amount.
    const now = ctx.currentTime;
    const hz = ENGINE_BASE_HZ * pitch;
    if (Math.abs(hz - this.sentHz) > HZ_EPSILON) {
      this.sentHz = hz;
      this.engineA?.frequency.setTargetAtTime(hz, now, 0.05);
      this.engineB?.frequency.setTargetAtTime(hz * 2.01, now, 0.05);
    }
    const engineGain = 0.05 + Math.min(1, speed / 25) * 0.07;
    if (Math.abs(engineGain - this.sentEngineGain) > GAIN_EPSILON) {
      this.sentEngineGain = engineGain;
      this.engineGain?.gain.setTargetAtTime(engineGain, now, 0.1);
    }
    const squealGain = squeal * 0.12;
    if (Math.abs(squealGain - this.sentSquealGain) > GAIN_EPSILON || (squealGain === 0 && this.sentSquealGain !== 0)) {
      this.sentSquealGain = squealGain;
      this.squealGain?.gain.setTargetAtTime(squealGain, now, 0.05);
    }

    this.impactCooldown -= delta;
    const impact = kart.getValue(Kart, 'impact')!;
    if (impact > 1 && this.impactCooldown <= 0) {
      this.thud(Math.min(1, impact / 10));
      this.impactCooldown = 0.25;
    }

    const phase = kart.getValue(RaceState, 'phase')!;
    if (phase === RacePhase.Countdown) {
      const light = Math.ceil(kart.getValue(RaceState, 'countdown')!);
      if (light !== this.lastLight) this.beep(440, 0.15);
      this.lastLight = light;
    } else if (phase === RacePhase.Racing && this.lastPhase === RacePhase.Countdown) {
      this.beep(880, 0.4);
      this.lastLight = -1;
    }
    this.lastPhase = phase;

    const laps = kart.getValue(RaceState, 'lapsCompleted')!;
    const version = kart.getValue(RaceState, 'bestVersion')!;
    if (laps > this.lastLaps) {
      if (version !== this.lastBestVersion && laps > 1) {
        this.beep(660, 0.12);
        this.beep(880, 0.12, 0.12);
        this.beep(1320, 0.35, 0.24);
      } else {
        this.beep(990, 0.25);
      }
    }
    this.lastLaps = laps;
    this.lastBestVersion = version;
  }

  private ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    lp.connect(this.engineGain).connect(master);
    this.engineA = ctx.createOscillator();
    this.engineA.type = 'sawtooth';
    this.engineB = ctx.createOscillator();
    this.engineB.type = 'square';
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    this.engineA.connect(lp);
    this.engineB.connect(bGain).connect(lp);
    this.engineA.start();
    this.engineB.start();

    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const squealSrc = ctx.createBufferSource();
    squealSrc.buffer = this.noise;
    squealSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 6;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    squealSrc.connect(bp).connect(this.squealGain).connect(master);
    squealSrc.start();
    void ctx.resume();
  }

  private beep(freq: number, duration: number, offset = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private thud(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 * strength + 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.32);
  }
}
