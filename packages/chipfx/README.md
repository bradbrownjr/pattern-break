# chipfx

A small sound effect generator in the style of sfxr: describe a sound as a plain object of
parameters and get back mono samples as a `Float32Array`. One TypeScript file, no
dependencies, no Web Audio, no randomness. MIT licensed, like the rest of Pattern Break.

The research it follows, with sources, is in Pattern Break's
[`docs/SOUND-EFFECTS.md`](../../docs/SOUND-EFFECTS.md).

## Use

```ts
import { render, renderMix, type Sound } from '@game/chipfx';

// A laser: a square wave whose pitch falls fast, cut off at 200 Hz.
const zap: Sound = { wave: 'square', freq: 1250, slide: -22, minFreq: 200, duty: 0.25, sustain: 0.012, decay: 0.05, punch: 0.4, highpass: 260, volume: 0.3 };
const samples = render(zap, 48_000);

// In a browser, once, then play the buffer as often as you like.
const ctx = new AudioContext();
const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
buffer.copyToChannel(samples, 0);
const source = ctx.createBufferSource();
source.buffer = buffer;
source.playbackRate.value = 1 + 0.05 * (2 * Math.random() - 1); // a little variation per play
source.connect(ctx.destination);
source.start();
```

`renderMix([a, b])` renders several sounds and adds them, for layered effects such as an
explosion's noise over a sine thump.

To use it outside this repository, copy `src/index.ts`; it imports nothing.

## Parameters

Everything but `wave` and `freq` is optional.

| Parameter | Unit | What it does |
|---|---|---|
| `wave` | | `square`, `saw`, `triangle`, `sine`, `noise` (NES long-mode noise: hiss), `metal` (NES short-mode noise: a metallic buzz) |
| `freq` | Hz | start pitch; for noise, the rate the noise is clocked at |
| `slide`, `slideAccel` | octaves/s, octaves/s² | pitch change, and its change |
| `minFreq`, `maxFreq` | Hz | a falling pitch below `minFreq` ends the sound; a rising one stops at `maxFreq` (default 20 000) |
| `duty`, `dutySlide` | 0.02 to 0.5, per second | square wave duty cycle (default 0.5) |
| `attack`, `sustain`, `decay` | s | the envelope; the sound lasts their sum |
| `punch` | 0 to 1 | extra level at the start of the sustain, fading over it |
| `decayCurve` | | 1 is a linear fall; higher falls faster and tails longer |
| `jumps` | `{ at: s, semitones }[]` | pitch jumps, as in a coin sound or an arpeggio |
| `repeat` | s | restarts the pitch, slide, and jumps this often |
| `vibratoDepth`, `vibratoRate` | semitones, Hz | vibrato |
| `lowpass`, `lowpassSlide` | Hz, octaves/s | one-pole low-pass and its sweep |
| `highpass` | Hz | one-pole high-pass |
| `volume` | 0 to 1 | the sustain level (default 0.5); punch and filter overshoot can go above it, and output is clipped to plus or minus 1 |
| `seed` | 1 to 32 767 | the noise register's starting state; different seeds give variants of a noisy sound |

Also exported: `duration(sound)`, `peak(samples)`, `rms(samples)`, and `stepLfsr(state,
short)`, one step of the NES noise shift register.

## How it works

- **Oscillators** run at several times the output rate and are averaged down, as sfxr
  does, so hard edges alias less: 8 times for square and saw, 4 for triangle, 2 for noise,
  1 for sine.
- **Noise** is the NES noise channel's 15-bit shift register: bit 0 XOR bit 1 (long) or bit
  6 (short), shifted right into bit 14, stepped once per period of `freq`
  ([nesdev wiki](https://www.nesdev.org/wiki/APU_Noise)). The tests check its periods:
  32 767 steps long, 93 or 31 short.
- **Pitch, duty, and the envelope** move once per output sample; the low-pass coefficient
  every 16 samples.
- Rendering a 2-second, 3-layer boom takes about 30 to 60 ms on an old server CPU, so
  render each sound once and reuse the buffer.

## Tests

`pnpm --filter @game/chipfx test`: lengths, levels, determinism, pitch, slides, jumps, the
frequency cutoff, punch, filtering, mixing, and the noise register's periods.
