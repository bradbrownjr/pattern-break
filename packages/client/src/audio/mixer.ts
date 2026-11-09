// Plays the sound effects (docs/SOUND-EFFECTS.md, "Mixing"). Each effect is rendered once
// to an AudioBuffer by chipfx and played by a buffer source per play, panned by where it
// happened. The booms send to an echo (a delay feeding back through a low-pass, the Web
// Audio spec allows a cycle that has a DelayNode in it) and a reverb (a ConvolverNode with
// a generated impulse response). Everything goes through a compressor, so stacked
// explosions don't clip, then the effects volume. Cosmetic: never touches the song clock
// or the sim.

import { renderMix } from '@game/chipfx';
import { EFFECTS, effectLayers, isPitched, type Effect } from './effects.ts';
import type { PitchClass } from './song-notes.ts';

/** Voices playing at once; past this, a new effect replaces the lowest-priority one or is dropped. */
export const MAX_VOICES = 14;
const ECHO_SECONDS = 0.18;
const ECHO_FEEDBACK = 0.35;
const ECHO_LOWPASS_HZ = 2400;
const REVERB_SECONDS = 1.6;

interface Voice {
  source: AudioBufferSourceNode;
  priority: number;
}

/** A stereo impulse response: noise falling 60 dB over `seconds`, from a fixed seed. */
export function reverbImpulse(context: BaseAudioContext, seconds = REVERB_SECONDS): AudioBuffer {
  const length = Math.round(seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  const k = Math.log(1000) / length;
  let seed = 0x2545f491;
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // xorshift32: a fixed seed, so the room sounds the same on every load.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff - 0.5) * 2 * Math.exp(-k * i);
    }
  }
  return buffer;
}

export class EffectsMixer {
  /** Where menu sounds and other dry sources connect: before the compressor and volume. */
  readonly input: GainNode;
  readonly #context: BaseAudioContext;
  readonly #volume: GainNode;
  readonly #echo: GainNode;
  readonly #reverb: GainNode;
  readonly #buffers = new Map<string, AudioBuffer>();
  readonly #nextVariant = new Map<Effect, number>();
  #voices: Voice[] = [];
  /** The pitch effects take when the caller doesn't give one. */
  pitch: PitchClass = 0;

  constructor(context: BaseAudioContext, destination: AudioNode = context.destination) {
    const ctx = context;
    this.#context = ctx;
    this.input = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    this.#volume = ctx.createGain();
    this.input.connect(compressor);
    compressor.connect(this.#volume);
    this.#volume.connect(destination);

    // The echo: input -> delay -> low-pass -> feedback -> delay, and the delay out to the bus.
    this.#echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = ECHO_SECONDS;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = ECHO_LOWPASS_HZ;
    const feedback = ctx.createGain();
    feedback.gain.value = ECHO_FEEDBACK;
    this.#echo.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(this.input);

    this.#reverb = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse(ctx);
    this.#reverb.connect(convolver);
    convolver.connect(this.input);
  }

  /** The effects volume, a gain from 0 (off) to 1. */
  set volume(gain: number) {
    this.#volume.gain.value = gain;
  }

  get volume(): number {
    return this.#volume.gain.value;
  }

  /**
   * Renders every effect that doesn't depend on the song's pitch, one per timer callback so
   * the page never stalls, so the first play of each doesn't wait for it.
   */
  prewarm(): void {
    const work: [Effect, number][] = [];
    for (const effect of Object.keys(EFFECTS) as Effect[]) {
      if (isPitched(effect)) continue;
      for (let v = 0; v < (EFFECTS[effect].variants ?? 1); v++) work.push([effect, v]);
    }
    const next = (): void => {
      const job = work.shift();
      if (!job) return;
      this.#buffer(job[0], job[1], 0);
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  /**
   * Plays `effect`, panned by `pan` (-1 left to 1 right). Pitched effects use `pitch`, or the
   * mixer's `pitch`. Returns false when the voices are full of more important sounds.
   */
  play(effect: Effect, pan = 0, pitch: PitchClass = this.pitch): boolean {
    if (this.#volume.gain.value === 0) return false;
    const spec = EFFECTS[effect];
    if (!this.#claimVoice(spec.priority)) return false;
    const variants = spec.variants ?? 1;
    const variant = this.#nextVariant.get(effect) ?? 0;
    this.#nextVariant.set(effect, (variant + 1) % variants);
    const ctx = this.#context;
    const source = ctx.createBufferSource();
    source.buffer = this.#buffer(effect, variant, isPitched(effect) ? pitch : 0);
    const jitter = spec.jitter ?? 0;
    if (jitter > 0) source.playbackRate.value = 1 + jitter * (2 * Math.random() - 1);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(panner);
    panner.connect(this.input);
    const sends: GainNode[] = [];
    for (const [amount, bus] of [
      [spec.echo ?? 0, this.#echo],
      [spec.reverb ?? 0, this.#reverb],
    ] as const) {
      if (amount <= 0) continue;
      const send = ctx.createGain();
      send.gain.value = amount;
      panner.connect(send);
      send.connect(bus);
      sends.push(send);
    }
    const voice: Voice = { source, priority: spec.priority };
    this.#voices.push(voice);
    source.onended = () => {
      this.#voices = this.#voices.filter((v) => v !== voice);
      source.disconnect();
      panner.disconnect();
      for (const s of sends) s.disconnect();
    };
    source.start();
    return true;
  }

  /** Stops every effect playing, for leaving a run. The echo and reverb tails ring out. */
  stopAll(): void {
    for (const v of this.#voices) v.source.stop();
  }

  /** Makes room for a voice of `priority`, stopping the lowest below it if all are in use. */
  #claimVoice(priority: number): boolean {
    if (this.#voices.length < MAX_VOICES) return true;
    let lowest: Voice | null = null;
    for (const v of this.#voices) if (!lowest || v.priority < lowest.priority) lowest = v;
    if (!lowest || lowest.priority >= priority) return false;
    this.#voices = this.#voices.filter((v) => v !== lowest);
    lowest.source.stop();
    return true;
  }

  #buffer(effect: Effect, variant: number, pitch: PitchClass): AudioBuffer {
    const key = `${effect}:${variant}:${pitch}`;
    let buffer = this.#buffers.get(key);
    if (!buffer) {
      const samples = renderMix(effectLayers(effect, variant, pitch), this.#context.sampleRate);
      buffer = this.#context.createBuffer(1, Math.max(1, samples.length), this.#context.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.#buffers.set(key, buffer);
    }
    return buffer;
  }
}
