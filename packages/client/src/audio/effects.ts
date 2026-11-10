// The game's sound effects as chipfx parameters (docs/SOUND-EFFECTS.md has the research
// each one follows and why). Rendered once to buffers, then played by the mixer. Pitched
// effects take a pitch class from the song and keep to octaves and fifths above it, which
// fit any key.

import type { Sound } from '@game/chipfx';
import { midiToHz } from './sfx.ts';
import type { PitchClass } from './song-notes.ts';

export type Effect =
  | 'shot'
  | 'laser'
  | 'tankHit'
  | 'killShip'
  | 'killTurret'
  | 'killTank'
  | 'beat'
  | 'bombDrop'
  | 'bomb'
  | 'missile'
  | 'missileBlast'
  | 'nuke'
  | 'lifeLost'
  | 'shield'
  | 'pickup'
  | 'buy'
  | 'nukeReady'
  | 'boost'
  | 'step'
  | 'clank'
  | 'thunk'
  | 'insert'
  | 'click'
  | 'hiss'
  | 'canopy';

/** How an effect plays: its layers, how it varies, and how much goes to the echo and reverb. */
export interface EffectSpec {
  /** The layers, mixed. A pitched effect builds them from the song's pitch class. */
  layers: readonly Sound[] | ((pitch: PitchClass) => readonly Sound[]);
  /** Noise variants, rendered with different seeds and played in turn. Default 1. */
  variants?: number;
  /** Random playback-rate change per play, as a fraction (ZzFX's default is 0.05). Pitched effects use 0. */
  jitter?: number;
  /** Share sent to the echo and the reverb, 0 to 1. */
  echo?: number;
  reverb?: number;
  /** Plays over others when voices run out; higher wins. */
  priority: number;
}

const note = (pitch: PitchClass, base: number, semitones = 0): number => midiToHz(base + pitch + semitones);

/** C5 in MIDI numbers: the pitched effects sit one and two octaves above it. */
const C5 = 72;
const C6 = 84;

export const EFFECTS: Record<Effect, EffectSpec> = {
  // sfxr's laserShoot: square, a fast fall in pitch, a high-pass so it doesn't thump.
  // Short and quiet, since the gun fires 15 times a second while held.
  shot: {
    layers: [
      { wave: 'square', freq: 1250, slide: -22, minFreq: 200, duty: 0.25, dutySlide: 1.5, sustain: 0.012, decay: 0.05, punch: 0.4, highpass: 260, volume: 0.15 },
    ],
    jitter: 0.04,
    priority: 1,
  },
  // A brighter, longer saw with a fast vibrato: the laser hums where the gun clicks.
  laser: {
    layers: [
      { wave: 'saw', freq: 2100, slide: -9, sustain: 0.035, decay: 0.08, punch: 0.3, vibratoDepth: 0.7, vibratoRate: 38, highpass: 420, lowpass: 9000, volume: 0.24 },
    ],
    jitter: 0.03,
    priority: 1,
  },
  // sfxr's hitHurt, on the NES short-mode noise: a metallic tick for a tank that took a hit.
  tankHit: {
    layers: [{ wave: 'metal', freq: 9000, slide: -12, sustain: 0.01, decay: 0.06, punch: 0.5, highpass: 700, volume: 0.32 }],
    variants: 3,
    jitter: 0.05,
    priority: 3,
  },
  // sfxr's explosion: noise with a falling clock and a punch, under a short square drop.
  killShip: {
    layers: [
      { wave: 'noise', freq: 5000, slide: -5, sustain: 0.03, decay: 0.22, punch: 0.7, decayCurve: 1.6, lowpass: 7000, lowpassSlide: -4, volume: 0.34 },
      { wave: 'square', freq: 520, slide: -9, minFreq: 60, sustain: 0.02, decay: 0.08, volume: 0.16 },
    ],
    variants: 3,
    jitter: 0.06,
    priority: 4,
  },
  // Turrets sit on the walls: the same burst with a metallic crack on top.
  killTurret: {
    layers: [
      { wave: 'noise', freq: 3200, slide: -4, sustain: 0.03, decay: 0.26, punch: 0.7, decayCurve: 1.6, lowpass: 5000, lowpassSlide: -3, volume: 0.3 },
      { wave: 'metal', freq: 7000, slide: -6, decay: 0.05, highpass: 1200, volume: 0.14 },
    ],
    variants: 3,
    jitter: 0.06,
    priority: 4,
  },
  // Tanks are heavy: lower noise, longer, with a sine thump under it.
  killTank: {
    layers: [
      { wave: 'noise', freq: 1800, slide: -3, sustain: 0.05, decay: 0.4, punch: 0.8, decayCurve: 2, lowpass: 3500, lowpassSlide: -3, volume: 0.32 },
      { wave: 'sine', freq: 140, slide: -3, sustain: 0.03, decay: 0.25, volume: 0.34 },
    ],
    variants: 3,
    jitter: 0.04,
    reverb: 0.12,
    priority: 5,
  },
  // A kill on the beat: a thin square chime on the note the enemy's instrument is playing,
  // jumping an octave.
  beat: {
    layers: (p) => [
      { wave: 'square', freq: note(p, C6), duty: 0.125, sustain: 0.02, decay: 0.16, jumps: [{ at: 0.04, semitones: 12 }], volume: 0.2 },
    ],
    echo: 0.25,
    priority: 4,
  },
  bombDrop: {
    layers: [{ wave: 'square', freq: 1500, slide: -6, sustain: 0.03, decay: 0.08, lowpass: 4000, volume: 0.2 }],
    jitter: 0.03,
    priority: 2,
  },
  // The deep boom docs/PLAN.md asks for: noise through a closing low-pass over a diving sine,
  // with the echo and reverb.
  bomb: {
    layers: [
      { wave: 'noise', freq: 1400, slide: -2.5, sustain: 0.06, decay: 0.85, punch: 0.9, decayCurve: 2.2, lowpass: 5000, lowpassSlide: -3, volume: 0.3 },
      { wave: 'sine', freq: 95, slide: -1.8, sustain: 0.04, decay: 0.6, decayCurve: 1.5, volume: 0.4 },
    ],
    variants: 2,
    jitter: 0.04,
    echo: 0.3,
    reverb: 0.35,
    priority: 7,
  },
  // A rising whoosh: noise with its clock climbing.
  missile: {
    layers: [{ wave: 'noise', freq: 900, slide: 4, attack: 0.02, sustain: 0.06, decay: 0.12, highpass: 500, lowpass: 6000, volume: 0.28 }],
    variants: 2,
    jitter: 0.05,
    priority: 3,
  },
  missileBlast: {
    layers: [
      { wave: 'noise', freq: 2600, slide: -3, sustain: 0.04, decay: 0.45, punch: 0.8, decayCurve: 2, lowpass: 6000, lowpassSlide: -3, volume: 0.32 },
      { wave: 'sine', freq: 160, slide: -2.5, sustain: 0.02, decay: 0.3, volume: 0.32 },
    ],
    variants: 2,
    jitter: 0.05,
    echo: 0.15,
    reverb: 0.25,
    priority: 6,
  },
  // The biggest boom: longer, lower, with a metallic sweep, and the most reverb.
  nuke: {
    layers: [
      { wave: 'noise', freq: 900, slide: -1.2, attack: 0.005, sustain: 0.15, decay: 1.8, punch: 0.6, decayCurve: 2.5, lowpass: 3500, lowpassSlide: -1.2, volume: 0.28 },
      { wave: 'sine', freq: 70, slide: -1, sustain: 0.1, decay: 1.5, decayCurve: 1.5, volume: 0.36 },
      { wave: 'metal', freq: 3000, slide: -3, sustain: 0.05, decay: 0.5, highpass: 1000, volume: 0.12 },
    ],
    echo: 0.35,
    reverb: 0.5,
    priority: 9,
  },
  // A boom with a falling, wavering square: the ship going down.
  lifeLost: {
    layers: [
      { wave: 'noise', freq: 2000, slide: -2, sustain: 0.05, decay: 0.7, punch: 0.8, decayCurve: 2, lowpass: 4500, lowpassSlide: -2.5, volume: 0.34 },
      { wave: 'square', freq: 660, slide: -2.2, dutySlide: -0.6, sustain: 0.15, decay: 0.45, vibratoDepth: 0.4, vibratoRate: 9, lowpass: 3000, volume: 0.16 },
    ],
    echo: 0.3,
    reverb: 0.35,
    priority: 8,
  },
  // A ping: a triangle ringing with a quick shimmer, and a thin square on top.
  shield: {
    layers: [
      { wave: 'triangle', freq: 1760, sustain: 0.01, decay: 0.25, decayCurve: 1.5, vibratoDepth: 0.3, vibratoRate: 30, volume: 0.3 },
      { wave: 'square', freq: 2637, duty: 0.25, decay: 0.12, volume: 0.08 },
    ],
    echo: 0.2,
    priority: 7,
  },
  // sfxr's pickupCoin: a saw with a punch that jumps up once, here a fifth, from the song's note.
  pickup: {
    layers: (p) => [
      { wave: 'saw', freq: note(p, C6), sustain: 0.04, decay: 0.2, punch: 0.5, jumps: [{ at: 0.06, semitones: 7 }], lowpass: 8000, volume: 0.26 },
    ],
    priority: 5,
  },
  // sfxr's powerUp: a rising sweep, repeated, from the song's note.
  buy: {
    layers: (p) => [
      { wave: 'square', freq: note(p, C5), slide: 2.5, repeat: 0.075, duty: 0.25, sustain: 0.26, decay: 0.12, volume: 0.22 },
    ],
    echo: 0.2,
    priority: 6,
  },
  // A nuke charged: root, fifth, octave, twelfth, from the song's note.
  nukeReady: {
    layers: (p) => [
      {
        wave: 'square',
        freq: note(p, C5),
        sustain: 0.22,
        decay: 0.2,
        jumps: [
          { at: 0.06, semitones: 7 },
          { at: 0.12, semitones: 5 },
          { at: 0.18, semitones: 7 },
        ],
        volume: 0.2,
      },
    ],
    echo: 0.25,
    priority: 6,
  },
  // A rush of air: band-limited noise that falls a little.
  boost: {
    layers: [{ wave: 'noise', freq: 3000, slide: -2, attack: 0.03, sustain: 0.12, decay: 0.2, lowpass: 2500, highpass: 300, volume: 0.32 }],
    variants: 2,
    jitter: 0.05,
    priority: 2,
  },

  // The hangar intro (game/hangar.ts). A boot on a metal deck: a short low-passed thud with
  // a tick on top, in the hangar's reverb.
  step: {
    layers: [
      { wave: 'noise', freq: 1100, slide: -3, sustain: 0.004, decay: 0.07, punch: 0.6, lowpass: 1600, volume: 0.26 },
      { wave: 'metal', freq: 5000, decay: 0.02, highpass: 1500, volume: 0.05 },
    ],
    variants: 3,
    jitter: 0.08,
    reverb: 0.3,
    priority: 2,
  },
  // A boot on a ladder rung: a metallic knock over a short triangle ring.
  clank: {
    layers: [
      { wave: 'metal', freq: 3800, slide: -2, sustain: 0.005, decay: 0.09, punch: 0.4, highpass: 600, volume: 0.18 },
      { wave: 'triangle', freq: 590, decay: 0.16, decayCurve: 1.5, volume: 0.2 },
    ],
    variants: 2,
    jitter: 0.06,
    reverb: 0.35,
    priority: 2,
  },
  // Dropping into the seat, and the canopy locking shut: a low sine thump with a muffled knock.
  thunk: {
    layers: [
      { wave: 'sine', freq: 120, slide: -2.5, sustain: 0.02, decay: 0.16, volume: 0.36 },
      { wave: 'noise', freq: 900, slide: -2, decay: 0.07, punch: 0.5, lowpass: 900, volume: 0.24 },
    ],
    reverb: 0.2,
    priority: 3,
  },
  // The cassette pushed home: a plastic clack, bright and short, over a small knock.
  insert: {
    layers: [
      { wave: 'metal', freq: 7000, decay: 0.025, punch: 0.5, highpass: 1800, volume: 0.2 },
      { wave: 'square', freq: 330, slide: -6, duty: 0.25, decay: 0.045, lowpass: 2200, volume: 0.14 },
    ],
    priority: 3,
  },
  // The deck's Play key going down.
  click: {
    layers: [{ wave: 'metal', freq: 9000, decay: 0.015, punch: 0.4, highpass: 2500, volume: 0.18 }],
    priority: 3,
  },
  // Tape hiss as the tape starts, fading under the song.
  hiss: {
    layers: [{ wave: 'noise', freq: 9000, attack: 0.04, sustain: 0.3, decay: 0.5, highpass: 3500, lowpass: 9000, volume: 0.07 }],
    priority: 1,
  },
  // The canopy closing: a falling pneumatic rush.
  canopy: {
    layers: [
      { wave: 'noise', freq: 2600, slide: -0.9, attack: 0.05, sustain: 0.35, decay: 0.35, highpass: 350, lowpass: 3200, lowpassSlide: -1, volume: 0.22 },
    ],
    priority: 2,
  },
};

/** Whether the effect's layers depend on the song's pitch. */
export function isPitched(effect: Effect): boolean {
  return typeof EFFECTS[effect].layers === 'function';
}

/** The layers of `effect`, variant `variant` (noise seeds differ), at `pitch` if it is pitched. */
export function effectLayers(effect: Effect, variant = 0, pitch: PitchClass = 0): Sound[] {
  const spec = EFFECTS[effect];
  const layers = typeof spec.layers === 'function' ? spec.layers(pitch) : spec.layers;
  // Seeds spread over the 15-bit register so the variants' noise differs from the first step.
  return layers.map((l, i) => ({ ...l, seed: 1 + ((variant * 7919 + i * 104_729) % 32_766) }));
}
