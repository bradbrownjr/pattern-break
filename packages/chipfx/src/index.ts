// chipfx: a small sound effect generator in the style of sfxr (DrPetter, 2007) and its
// ports, jsfxr and ZzFX. A sound is a plain object of parameters; render() turns it into
// samples. No dependencies, no Web Audio, no randomness: the same parameters give the same
// samples, so sounds can be tested in Node and rendered once at load. Research, sources and
// design notes are in docs/SOUND-EFFECTS.md.
//
// Units are physical (Hz, seconds, octaves per second, semitones), not sfxr's 0..1 slider
// values, so a sound reads as what it does.

/**
 * The oscillator. `noise` and `metal` are the NES noise channel's two modes: a 15-bit shift
 * register clocked at `freq`, long (32 767 steps, hiss) or short (93 or 31 steps, a
 * metallic buzz). See https://www.nesdev.org/wiki/APU_Noise.
 */
export type Wave = 'square' | 'saw' | 'triangle' | 'sine' | 'noise' | 'metal';

export interface PitchJump {
  /** Seconds from the start (or from the last repeat). */
  at: number;
  /** Semitones to move by, up if positive. */
  semitones: number;
}

export interface Sound {
  wave: Wave;
  /** Start frequency in Hz. For noise, the rate the shift register is clocked at. */
  freq: number;
  /** Pitch change in octaves per second; negative falls. */
  slide?: number;
  /** Change of `slide` in octaves per second, per second. */
  slideAccel?: number;
  /** The sound stops when a falling pitch goes below this, in Hz (sfxr's frequency cutoff). */
  minFreq?: number;
  /** Highest frequency a rising pitch reaches, in Hz. Default 20 000. */
  maxFreq?: number;
  /** Square wave duty cycle, 0.02 to 0.5. Default 0.5. */
  duty?: number;
  /** Duty change per second. */
  dutySlide?: number;
  /** Envelope: rise, hold and fall times in seconds. */
  attack?: number;
  sustain?: number;
  decay?: number;
  /** Extra level at the start of the hold, fading to none by its end (sfxr's punch), 0 to 1. It lifts the sound above `volume`. */
  punch?: number;
  /** Shape of the fall: 1 is linear, higher falls away faster and tails longer. Default 1. */
  decayCurve?: number;
  /** Pitch jumps, as in an arpeggio or a coin sound. */
  jumps?: readonly PitchJump[];
  /** Restarts pitch, slide and jumps every this many seconds, for a repeating sweep. */
  repeat?: number;
  /** Vibrato depth in semitones and rate in Hz. */
  vibratoDepth?: number;
  vibratoRate?: number;
  /** One-pole low-pass cutoff in Hz, and its change in octaves per second. */
  lowpass?: number;
  lowpassSlide?: number;
  /** One-pole high-pass cutoff in Hz. */
  highpass?: number;
  /** Level of the hold, 0 to 1; `punch` and filter overshoot can go above it. Default 0.5. */
  volume?: number;
  /** The noise shift register's starting state, 1 to 32 767; other seeds give variants. */
  seed?: number;
}

/**
 * sfxr renders at 8 times the output rate and averages, so square waves alias less. Only
 * waves with hard edges need it: a sine has nothing to alias, and noise is noise either way.
 */
const OVERSAMPLE: Record<Wave, number> = { square: 8, saw: 8, triangle: 4, sine: 1, noise: 2, metal: 2 };
const LFSR_MASK = 0x7fff;

/**
 * One step of the NES noise shift register: bit 0 XOR bit 1 (long mode) or bit 6 (short
 * mode), shifted right, with the result in bit 14.
 */
export function stepLfsr(state: number, short: boolean): number {
  const feedback = (state ^ (state >> (short ? 6 : 1))) & 1;
  return (state >> 1) | (feedback << 14);
}

/** The sound's length in seconds: attack, sustain and decay. */
export function duration(sound: Sound): number {
  return (sound.attack ?? 0) + (sound.sustain ?? 0) + (sound.decay ?? 0);
}

/**
 * Renders `sound` as mono samples at `sampleRate`. Pitch, duty, the envelope and the
 * low-pass cutoff move once per output sample; the oscillator and the filters run at
 * OVERSAMPLE times the rate for the wave, averaged down, as in sfxr.
 */
export function render(sound: Sound, sampleRate = 48_000): Float32Array<ArrayBuffer> {
  const attack = sound.attack ?? 0;
  const sustain = sound.sustain ?? 0;
  const decay = sound.decay ?? 0;
  const length = Math.ceil(duration(sound) * sampleRate);
  const out = new Float32Array(length);
  const dt = 1 / sampleRate;
  const oversample = OVERSAMPLE[sound.wave];
  const subDt = dt / oversample;

  const volume = sound.volume ?? 0.5;
  const punch = sound.punch ?? 0;
  const curve = sound.decayCurve ?? 1;
  const minFreq = sound.minFreq ?? 0;
  const maxFreq = sound.maxFreq ?? 20_000;
  const slideAccel = sound.slideAccel ?? 0;
  const dutySlide = sound.dutySlide ?? 0;
  const lowpassStep = 2 ** ((sound.lowpassSlide ?? 0) * dt);
  const jumps = [...(sound.jumps ?? [])].sort((a, b) => a.at - b.at);
  const vibDepth = sound.vibratoDepth ?? 0;
  const vibRate = sound.vibratoRate ?? 0;
  const noise = sound.wave === 'noise' || sound.wave === 'metal';
  const short = sound.wave === 'metal';
  const wave = sound.wave;

  // Pitch moves by a factor per sample, so a slide is a straight line in octaves. The
  // factor needs a power only when the slide itself changes.
  let base = 0;
  let slide = 0;
  let slideStep = 1;
  let nextJump = 0;
  let sinceRepeat = 0;
  const restart = (): void => {
    base = sound.freq;
    slide = sound.slide ?? 0;
    slideStep = 2 ** (slide * dt);
    nextJump = 0;
    sinceRepeat = 0;
  };
  restart();

  let duty = sound.duty ?? 0.5;
  let phase = 0;
  let lfsr = (sound.seed ?? 1) & LFSR_MASK || 1;
  let lowCut = sound.lowpass ?? 0;
  let lowA = 0;
  let low = 0;
  let highIn = 0;
  let high = 0;
  const highA = sound.highpass ? Math.exp(-2 * Math.PI * sound.highpass * subDt) : 0;
  const highOn = highA > 0;

  for (let i = 0; i < length; i++) {
    const t = i * dt;
    if (sound.repeat && sinceRepeat >= sound.repeat) restart();
    while (nextJump < jumps.length && sinceRepeat >= jumps[nextJump]!.at) base *= 2 ** (jumps[nextJump++]!.semitones / 12);
    sinceRepeat += dt;
    if (slideAccel !== 0) {
      slide += slideAccel * dt;
      slideStep = 2 ** (slide * dt);
    }
    base *= slideStep;
    let freq = vibDepth === 0 ? base : base * 2 ** ((vibDepth * Math.sin(2 * Math.PI * vibRate * t)) / 12);
    if (freq < minFreq) return out;
    if (freq > maxFreq) freq = maxFreq;
    const step = freq * subDt;
    duty = Math.min(0.5, Math.max(0.02, duty + dutySlide * dt));
    if (lowCut > 0) {
      lowCut *= lowpassStep;
      // The coefficient needs an exp(); the cutoff moves slowly, so every 16 samples will do.
      if ((i & 15) === 0) lowA = 1 - Math.exp(-2 * Math.PI * Math.min(lowCut, sampleRate * 2) * subDt);
    }

    // The envelope: punch lifts the start of the hold above `volume`.
    let env: number;
    if (t < attack) env = t / attack;
    else if (t < attack + sustain) env = 1 + punch * (1 - (t - attack) / sustain);
    else {
      const left = decay > 0 ? Math.max(0, 1 - (t - attack - sustain) / decay) : 0;
      env = curve === 1 ? left : left ** curve;
    }

    let sum = 0;
    for (let k = 0; k < oversample; k++) {
      phase += step;
      let v: number;
      if (noise) {
        // The shift register steps once per period: each whole cycle of phase.
        while (phase >= 1) {
          phase -= 1;
          lfsr = stepLfsr(lfsr, short);
        }
        v = (lfsr & 1) === 0 ? 1 : -1;
      } else {
        if (phase >= 1) phase -= Math.floor(phase);
        if (wave === 'square') v = phase < duty ? 1 : -1;
        else if (wave === 'saw') v = 1 - 2 * phase;
        else if (wave === 'triangle') v = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
        else v = Math.sin(2 * Math.PI * phase);
      }
      if (lowA > 0) {
        low += lowA * (v - low);
        v = low;
      }
      if (highOn) {
        high = highA * (high + v - highIn);
        highIn = v;
        v = high;
      }
      sum += v;
    }
    const s = (sum / oversample) * env * volume;
    out[i] = s > 1 ? 1 : s < -1 ? -1 : s;
  }
  return out;
}

/** Renders several sounds and adds them, for layered effects such as a boom under a crack. */
export function renderMix(sounds: readonly Sound[], sampleRate = 48_000): Float32Array<ArrayBuffer> {
  const parts = sounds.map((s) => render(s, sampleRate));
  const out = new Float32Array(Math.max(0, ...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i]! += p[i]!;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]!));
  return out;
}

/** The highest absolute sample value. */
export function peak(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i]!));
  return p;
}

/** Root mean square level. */
export function rms(samples: Float32Array): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i]! * samples[i]!;
  return samples.length === 0 ? 0 : Math.sqrt(s / samples.length);
}
