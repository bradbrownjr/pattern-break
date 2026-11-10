# Sound effects

How Pattern Break's sound effects are made, the research they follow, and what was
measured. The generator is its own package, `packages/chipfx`, with no game code in it, so
other projects can use it (see its [README](../packages/chipfx/README.md)).

- `packages/chipfx/src/index.ts`: the generator. Parameters in, samples out.
- `packages/client/src/audio/effects.ts`: the game's effects as chipfx parameters.
- `packages/client/src/audio/mixer.ts`: plays them: variants, panning, echo, reverb, voice
  limit, volume.
- `packages/client/src/audio/song-notes.ts`: the song's notes by tick, for pitched effects.
- `packages/client/src/game/cues.ts`: finds what happened in the sim each frame.

Researched 2026-11-09. Every claim below names its source; what wasn't checked is listed
under "Not verified".

---

## Research

### The sfxr family

Most retro game sound effects made in code come from one model: **sfxr** (DrPetter, 2007),
its JavaScript port **jsfxr** ([chr15m/jsfxr](https://github.com/chr15m/jsfxr), Unlicense),
and **ZzFX** ([KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX), MIT), which
uses the same ideas in fewer parameters. A sound is one oscillator (square, saw, sine, or
noise) with:

- a start frequency, a slide (and a change of slide), and a cutoff where a falling pitch
  ends the sound;
- a square wave's duty cycle and its slide;
- an envelope of attack, sustain, and decay, plus **punch**: extra level at the start of
  the sustain that fades over it;
- a pitch jump partway through (sfxr calls it arpeggio), a **repeat** that restarts the
  pitch sweep, vibrato, and a phaser;
- a low-pass filter with a sweep and resonance, and a high-pass filter.

jsfxr computes 8 samples for every one it outputs and averages them (`OVERSAMPLING = 8`
in `sfxr.js`, the inner loop `for (var si = 0; si < OVERSAMPLING; ++si)`), so square waves
alias less.

**What each kind of sound uses**, from the preset generators in jsfxr's `sfxr.js`
(`Params.prototype.laserShoot` and the rest, read 2026-11-09). The presets roll random
values in these ranges; "base 0.3 to 1.0" is the slider value, which `sliders.p_base_freq`
turns into Hz as `8 * 44100 * (v * v + 0.001) / 100`, so 0.3 is about 320 Hz and 1.0 about
3530 Hz.

| Preset | Wave | Pitch | Envelope | Other |
|---|---|---|---|---|
| `laserShoot` | square, saw, or sine | base 0.3 to 1.0, falling fast, often with a floor | no attack, short sustain and decay, sometimes punch | duty and duty slide, sometimes a phaser, a high-pass |
| `explosion` | noise | low base, 0.01 to 0.81 (a random value squared), sliding a little either way | no attack, short sustain, punch 0.2 to 0.8 | sometimes repeat, vibrato, or a pitch jump |
| `hitHurt` | square, saw, or noise | base 0.2 to 0.8, falling steeply | very short | sometimes a high-pass |
| `pickupCoin` | saw | base 0.4 to 0.9 | punch 0.3 to 0.6, decay 0.1 to 0.5 | half the time one pitch jump up |
| `powerUp` | saw or square | base 0.2 to 0.5, rising | no attack, sustain up to 0.4, decay 0.1 to 0.5 | half the time a repeat, else sometimes vibrato |
| `jump` | square | rising | no attack, sustain 0.1 to 0.4, decay 0.1 to 0.3 | sometimes low-pass or high-pass |
| `blipSelect` | square or saw | base 0.2 to 0.6, steady | very short | a high-pass |

### The NES noise channel

The [nesdev wiki's APU Noise page](https://www.nesdev.org/wiki/APU_Noise) describes the
noise behind most NES explosions and drums:

- A 15-bit shift register. Each clock, bit 0 is XORed with bit 1 (long mode) or bit 6
  (short mode), the register shifts right, and the result goes into bit 14.
- Long mode gives a sequence 32 767 steps long: hiss. Short mode gives one 93 or 31 steps
  long, depending on the register when the mode was set: a metallic buzz.
- The channel outputs its volume unless bit 0 is set, so the output is a square wave of
  random widths.
- The register is clocked at one of 16 rates (NTSC periods 4 to 4068 CPU cycles); a lower
  rate gives lower, rougher noise.

The page doesn't describe how games used it. The preview of chapter 14 of Manning's
[Classic Game Programming on the NES](https://www.manning.com/preview/classic-game-programming-on-the-nes/chapter-14)
builds a short "boom" from "a few alternating low notes" on the noise channel "with
varying lengths", and a "big boom" from "fewer, longer Noise notes" made into slide notes
"that rise slightly".

### Variation, so repeats don't grate

A sound heard hundreds of times a level gets tiring if every play is the same. The game
audio sources agree on two fixes:

- **A small random pitch change per play.** ZzFX's `randomness` parameter defaults to
  0.05: each play's rate is the pitch plus or minus up to 5% of it (`ZzFX.js`, the `play`
  method). Game Developer's
  ["The power of pitch shifting"](https://gamedeveloper.com/audio/the-power-of-pitch-shifting):
  "Each time a particular sound effect is played, randomly shift its pitch up or down by a
  small amount", and "The actual change to the pitch may not be noticeable."
  [Violet Recording](https://violetrecording.com/sound-design-for-video-games/): "roughly
  a couple of semitones either side, keeps a sound recognisable", and "Wider swings start
  to sound comedic".
- **Variants that don't repeat back to back**, and a little volume change. Violet
  Recording: "Most middleware can cycle through variations so the same one never plays
  twice in a row", and "A decibel or two of random level change adds life". CRI's
  AtomCraft randomizes pitch and volume per clip, track, and cue, and has "Random no
  Repeat" cues ([CRI blog](https://blog.criware.com/?p=924)).

Sounds that are too familiar are the other risk: sfxr and ZzFX presets are recognisable
from many small games. The fix here is our own parameters, and tying pitched effects to
the song.

### Sirens

An outdoor warning siren's "wail" is a slowly rising, then falling, tone on a loop, and
American sirens work between 500 and 1800 Hz under SAE J1849
([Popular Science](https://www.popsci.com/technology/history-of-police-sirens/)). The US
attack signal is "an up-and-down, rising and falling tone", against a single tone for an
alert ([Illinois Ready](https://ready.illinois.gov/plan/sirens.html)). A mechanical siren's
pitch rises as its fan speeds up (Popular Science, above). Not read: the SAE standard
itself, and FEMA's outdoor warning systems guide (CPG 1-17), which search summaries give
as a 3 to 5 minute wavering tone for an attack.

### Explosions in Web Audio

Web Audio has no noise source; noise is a buffer of random samples. MDN's
[advanced techniques guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)
plays noise through a biquad filter, and
[Opera's drum synthesis article](https://dev.opera.com/articles/drum-sounds-webaudio)
builds a kick from a sine whose pitch drops. The common explosion recipe is the two
together: noise through a low-pass whose cutoff falls, over a diving sine for the thump.

### Web Audio facts the mixer relies on

- A **ConvolverNode** takes a mono, stereo, or 4-channel impulse response buffer
  ([MDN ConvolverNode](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode)).
- A **feedback loop** must contain a DelayNode. The spec's rendering algorithm mutes every
  node of a cycle that has none ("If nodes contains cycles, mute all the AudioNodes that are
  part of this cycle"), and a delay inside a cycle can't be shorter than one render quantum
  ([Web Audio API](https://webaudio.github.io/web-audio-api/), "Rendering an Audio Graph").
- **`exponentialRampToValueAtTime` can't reach 0**: the spec says "an exponential ramp to 0
  is not possible". The menu sounds ramp to 0.0001.

---

## How the game's effects are made

### The generator

`chipfx` follows sfxr's model with physical units: Hz, seconds, octaves per second,
semitones. Its noise is the NES shift register clocked at the sound's frequency (`noise`
long mode, `metal` short mode), so a seed (the register's starting state) gives a
different but equally valid variant. It oversamples square and saw waves 8 times as sfxr
does, triangles 4, noise 2, and sines not at all, since only hard edges alias. Pitch,
duty, envelope, and the low-pass cutoff move once per output sample; the low-pass
coefficient once per 16 samples. The same parameters always give the same samples, so the
tests run in Node.

The effects are rendered once to buffers when the audio starts, one per timer callback so
the page doesn't stall, and the pitched ones on first use at each pitch.

### Pitched to the song

The on-beat chime, the capsule pickup, the unlock sound, and the nuke charge take their pitch
from the music:

- **Which note.** The chime takes the latest note at or before the kill of the instrument
  that spawned the enemy. A drum has no tune, so a turret's chime, and the effects not tied
  to an enemy, take the melody's note: the highest note of any instrument that isn't a
  drum, the same note the cave winds with (`findDrums` decides what a drum is).
- **Which pitch.** Only the pitch class (C to B) is used; each effect places it in its own
  octave. Pattern notes are 1 to 120 with 1 = C-0: OpenMPT's `NOTE_MIN = 1` and
  `NOTE_MIDDLEC = 5 * 12 + NOTE_MIN` (61, C-5) in `soundlib/modcommand.h` at the
  libopenmpt-0.8.10 tag. So the pitch class is `(note - 1) % 12`.
- **Which intervals.** The pitched effects move only by octaves and fifths, which fit any
  key.
- **No random pitch change** on pitched effects, so they stay in tune.

### Mixing

```
buffer source -> stereo pan -+-> bus -> compressor -> effects volume -> speakers
                             +-> echo send -> delay 0.18 s -> low-pass 2400 Hz -+-> bus
                             |                    ^--- feedback 0.35 <-----------+
                             +-> reverb send -> convolver (1.6 s generated room) -> bus
song worklet -> song volume (fades) -> music volume -> speakers
```

- **Panning.** Effects pan towards where they happened, at most 0.6 of the way to a side.
- **Reverb.** The impulse response is stereo noise falling 60 dB over 1.6 s, from a fixed
  seed. Only the booms, the chime, and the pickups send to it or the echo.
- **The compressor** (threshold -10 dB, ratio 8, 3 ms attack) keeps stacked explosions from
  clipping.
- **Voices.** At most 14 play at once. Each effect has a priority; when all are in use, a
  new effect stops the lowest-priority one below it, or isn't played. At most 3 kill sounds
  start in one frame (a nuke's own boom covers the rest).
- **Variation.** Noisy effects have 2 or 3 variants with different seeds, played in turn,
  and a random rate change of up to 3% to 6% (half a semitone to a semitone). Volume isn't
  randomized; pan follows where the effect happened instead.
- **Volume.** Settings has Music and Effects, each off or 1 to 5; each step down halves the
  gain (about 6 dB). The defaults are Music 5 and Effects 4. The menu sounds go through the
  effects volume too.

### Timing

Sounds start when the frame loop sees the sim reach the tick they happened on. The sim
follows the song position being heard, so an effect comes out one output latency after the
music it lines up with: about 10 to 40 ms, the figure the browser reports. Scheduling
earlier isn't possible for what the player caused, because the press happened at the
heard time.

### The effects

| Effect | When | Recipe | After |
|---|---|---|---|
| `shot` | the ship's volley | square, duty 0.25, 1250 Hz falling 22 octaves a second, 62 ms, high-pass | `laserShoot` |
| `laser` | a laser volley | saw, 2100 Hz falling, fast vibrato, 115 ms | `laserShoot` |
| `tankHit` | a tank hit but standing | short-mode noise, 70 ms | `hitHurt` |
| `killShip` | a ship destroyed | noise with punch and a closing low-pass, over a falling square | `explosion` |
| `killTurret` | a turret destroyed | the same with a short-mode crack | `explosion` |
| `killTank` | a tank destroyed | lower, longer noise over a sine thump | `explosion` |
| `beat` | a kill on the beat | thin square on the song's note, jumping an octave | `pickupCoin` |
| `bombDrop` | the bomb leaves | short falling square | |
| `bomb` | the bomb bursts | noise and a diving sine, echo and reverb | the boom recipe |
| `missile` | a missile launches | noise with a rising clock | |
| `missileBlast` | a missile bursts | a smaller boom | the boom recipe |
| `nuke` | the nuke | the longest boom, with a short-mode sweep and the most reverb | the boom recipe |
| `lifeLost` | a life lost | a boom over a falling, wavering square | |
| `shield` | the shield takes a hit or bounces off a wall | a falling sine thump and a muffled noise knock, with a short wavering triangle | |
| `extraLife` | an extra life | root, octave, twelfth, two octaves from the song's note: a square over a triangle | |
| `pickup` | a capsule picked up | saw with punch, jumping a fifth, from the song's note | `pickupCoin` |
| `unlock` | a power-up unlocked by a capsule | square rising, repeated, from the song's note | `powerUp` |
| `nukeReady` | a nuke charged | root, fifth, octave, twelfth from the song's note | |
| `boost` | boost starts | band-limited noise, falling a little | |
| `step` | a footstep in the hangar intro | a short low-passed noise thud with a short-mode tick, in reverb | |
| `clank` | a boot on a ladder rung | a short-mode knock over a ringing triangle | |
| `thunk` | dropping into the seat; the canopy locking | a sine thump under a muffled noise knock | |
| `insert` | the cassette pushed into the deck | a bright short-mode clack over a short square | |
| `click` | the deck's Play key | a short-mode click, 15 ms | |
| `hiss` | the tape starting | quiet high-passed noise, 0.84 s | |
| `canopy` | the canopy closing | band-limited noise, falling over 0.75 s | |
| `siren` | Impossible's hangar intro, twice | one wail: a triangle and a quiet square a fifth up, 520 Hz up to 875 Hz and back over 3 s, low-passed, in echo and reverb | the attack warning's wail |

Enemy bullets make no sound: there are too many.

---

## Measured

On the development server (Xeon E5-2640, Node 26.13), 2026-11-09:

- **Render time.** Every effect and variant at one pitch: about 0.3 to 0.5 s in all, the
  nuke the longest at 28 to 57 ms. That's why they render one per timer callback.
- **Levels.** Every effect peaks between 0.2 and 0.96 of full scale before the
  compressor (`test/effects.test.ts` checks each stays under 1), except the hangar intro's
  tape hiss at 0.07, which sits under the song (measured 2026-11-10).
- **Against the music** (headless Chromium, the autopilot playing level 1 for 20 s, RMS over
  the last 15 s): music alone at Music 5 measured 0.093, effects alone at Effects 4 measured
  0.062, about 3.5 dB under the music. That was with the shot at volume 0.18; it is 0.15
  now.

## Not verified

- **How they sound.** Nobody has listened yet; the numbers above say only that they play,
  don't clip, and sit under the music.
- **The pitch that sounds.** A sample's own tuning (finetune, relative note, C-5 speed) can
  move the pitch it plays away from the written note, so a song whose samples are tuned
  off from their note names puts the pitched effects off key. Measuring that would mean
  reading each sample's tuning from libopenmpt.
- **Firefox and WebKit live.** The mixer's browser test renders offline in all three
  engines; live play was checked in Chromium only.
