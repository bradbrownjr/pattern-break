# References

The studies, guides, specifications and other published sources the project's design and
code rest on, by topic. Each entry says what it informed and where that is written down.
The songs' own pages and licenses are in [SONG-DIGEST.md](SONG-DIGEST.md) and the README's
credits, not here.

When research informs a decision, its sources go here as well as beside the decision.
A source that was read but didn't hold up gets a line saying so, so nobody chases it again.

---

## Difficulty and player experience

- Jesper Juul, ["Fear of Failing? The Many Meanings of Difficulty in Video Games"](https://jesperjuul.net/text/fearoffailing/),
  in Wolf and Perron (eds.), *The Video Game Theory Reader 2*, Routledge 2009, pp. 237-252. In his prototype study, players who failed
  some and then finished rated the game highest; finishing without failing came with a
  lower rating. It set the aim for normal: a level a person finishes after losing a life or
  two (2026-11-13; [PLAN.md](PLAN.md), "Difficulty guardrails").
- Woods, Wyma, Yund, Herron and Reed, ["Factors influencing the latency of simple reaction time"](https://pmc.ncbi.nlm.nih.gov/articles/PMC4374455/),
  *Frontiers in Human Neuroscience* 9:131 (2015). 1,469 adults: mean visual simple
  reaction time 231 ms, 213 ms corrected for hardware delay. Enemy shots on the arcade
  levels take a median 1.5 to 2.2 s to reach the ship, so a reaction delay was ruled out
  as the cause of hits (2026-11-13).
- Boghog, ["Boghog's bullet hell shmup 101"](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101),
  Shmups Wiki. Aimed shots, fairness ("single stray bullets are hard to read and can often
  feel unfair"), and invincibility after a death to prevent chain deaths. Brief
  invincibility after a shield hit was considered from it and left out (2026-11-13).
- ["(Breaking) The Shmup Dogma"](https://www.gamedeveloper.com/design/-breaking-the-shmup-dogma),
  Game Developer. On readable bullets ("visible projectiles with strong colors and shapes,
  good contrast with the backgrounds"), the player only needing to watch the area around
  the hitbox, and fixed easy, normal and hard modes over adaptive difficulty, which made
  that game's difficulty "float wildly".
- BSMG wiki, ["Downmapping"](https://bsmg.wiki/mapping/downmapping.html). Beat Saber
  mappers cut note density by about 20% a step down. The guardrails step the difficulties
  against each other on the same idea ([PLAN.md](PLAN.md), "Difficulty guardrails").
- Not found: a published number for bullets on screen, or for how long invincibility after
  a hit should last, in shooters (searched 2026-11-11 and 2026-11-13).

## Sound effects

The full research, with what each source showed and what was measured, is in
[SOUND-EFFECTS.md](SOUND-EFFECTS.md). The sources:

- [chr15m/jsfxr](https://github.com/chr15m/jsfxr) and
  [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX): existing effect generators.
- The nesdev wiki's [APU Noise page](https://www.nesdev.org/wiki/APU_Noise): the NES noise
  channel, which `packages/chipfx` emulates.
- [Classic Game Programming on the NES](https://www.manning.com/preview/classic-game-programming-on-the-nes/chapter-14),
  chapter 14.
- ["The power of pitch shifting"](https://gamedeveloper.com/audio/the-power-of-pitch-shifting),
  Game Developer, and [Violet Recording on sound design for games](https://violetrecording.com/sound-design-for-video-games/):
  a small random pitch and volume change on each play, and variants that don't repeat
  back to back.
- The [CRI blog](https://blog.criware.com/?p=924): randomized pitch and volume and "Random
  no Repeat" cues in CRI's AtomCraft middleware.
- [Popular Science on the history of police sirens](https://www.popsci.com/technology/history-of-police-sirens/)
  and [Illinois Ready on sirens](https://ready.illinois.gov/plan/sirens.html): the air raid
  siren on the impossible intro.
- MDN, [Web Audio API advanced techniques](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)
  and [ConvolverNode](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode);
  Opera, [drum synthesis with Web Audio](https://dev.opera.com/articles/drum-sounds-webaudio);
  the [Web Audio API specification](https://webaudio.github.io/web-audio-api/).

## Music playback

- [libopenmpt documentation](https://lib.openmpt.org/doc/): rendering, the tempo factor
  each difficulty uses, and the render parameters the analysis pins
  ([PLAN.md](PLAN.md), "Determinism rules").

## Input, display and the browser

- W3C, [UI Events KeyboardEvent code values](https://www.w3.org/TR/uievents-code/): key
  names on the Keys screen ([DEVELOPMENT.md](DEVELOPMENT.md)).
- W3C, [Gamepad](https://w3c.github.io/gamepad/), "Remapping": the standard pad layout.
- [3960.org gamepad test](https://3960.org/sandbox/gamepad-test.html): how browsers report
  hats and axes on real pads.
- Microsoft Learn, ["Getting Started With XInput"](https://learn.microsoft.com/en-us/windows/win32/xinput/getting-started-with-xinput),
  "Dead Zone": a pad stick's dead zone (`XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE`).
- W3C, [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/): the touch pad.
- WHATWG, [Fullscreen API](https://fullscreen.spec.whatwg.org/), and the HTML standard's
  [activation-triggering input events](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event):
  when the game may go full screen and start sound.
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/): the general and red flash thresholds
  (2.3.1) that the Reduced flashing setting keeps the crash flash, the nuke's flash, the
  hangar's strobe and the copper bars' downbeat pulse under (`render/flash.ts`), and
  target size (2.5.5) for the touch keys.

## Art references

- US patents [4087844](https://patents.google.com/patent/US4087844A/en), a cassette deck
  door hinged at the top, and [4607301](https://patents.google.com/patent/US4607301A/en),
  a car stereo's outer door hinged at the bottom: the hangar intro's tape deck
  ([DEVELOPMENT.md](DEVELOPMENT.md), "Playing it").
- Wikipedia, ["Cassette tape"](https://en.wikipedia.org/wiki/Cassette_tape): the
  cassette's proportions.

## Server

- SQLite, [ALTER TABLE](https://www.sqlite.org/lang_altertable.html), "Making Other Kinds
  Of Table Schema Changes": rebuilding the players table (`packages/server/src/db.ts`).
- Wikipedia, ["Scunthorpe problem"](https://en.wikipedia.org/wiki/Scunthorpe_problem): why
  the name filter counts roots that sit inside innocent words only as whole words.

## Writing

- The four sources behind the plain wording rules (Wikipedia's field guide to signs of AI
  writing and three studies of the words language models overuse) are listed with their
  links in [DOC-STYLE.md](DOC-STYLE.md), "Plain wording", where the rules are.
