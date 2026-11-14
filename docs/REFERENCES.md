# References

The studies, guides, specifications and other published sources the project's design and
code rest on, by topic. Each entry says what it informed and where that is written down.
The songs' own pages are in [SONG-DIGEST.md](SONG-DIGEST.md) and the README's credits, not
here.

When research informs a decision, its sources go here as well as beside the decision.
A source that was read but didn't hold up, and a search that found nothing, get a line
saying so, so nobody chases them again. Those are under "Dead ends" at the end.

The list was built on 2026-11-13 from the docs and the code, and on 2026-11-14 from the
transcripts of the development sessions on Brad's machine, which record every page fetched.
Sessions run in the cloud development container left no transcript here, so a source used
only there, and cited nowhere in the repo, may be missing.

---

## Difficulty and player experience

- Jesper Juul, ["Fear of Failing? The Many Meanings of Difficulty in Video Games"](https://jesperjuul.net/text/fearoffailing/),
  in Wolf and Perron (eds.), *The Video Game Theory Reader 2*, Routledge 2009, pp.
  237-252. In his prototype study, players who failed some and then finished rated the
  game highest; finishing without failing came with a lower rating. It set the aim for
  normal: a level a person finishes after losing a life or two (2026-11-13;
  [PLAN.md](PLAN.md), "Difficulty guardrails").
- Woods, Wyma, Yund, Herron and Reed, ["Factors influencing the latency of simple reaction time"](https://pmc.ncbi.nlm.nih.gov/articles/PMC4374455/),
  *Frontiers in Human Neuroscience* 9:131 (2015). 1,469 adults: mean visual simple
  reaction time 231 ms, 213 ms corrected for hardware delay. Enemy shots on the arcade
  levels take a median 1.5 to 2.2 s to reach the ship, so a reaction delay was ruled out
  as the cause of hits (2026-11-13).
- Robb and Zhang, [performance-based dynamic difficulty adjustment and player experience in a 2D digital game, a controlled experiment](https://actaludologica.com/performance-based-dynamic-difficulty-adjustment-and-player-experience-in-a-2d-digital-game-a-controlled-experiment/),
  *Acta Ludologica* (2022). 221 players: adapting the difficulty to how a player was doing
  raised their performance and made no measurable difference to enjoyment or flow. Read
  when the guardrails were set (2026-11-11).
- Boghog, ["Boghog's bullet hell shmup 101"](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101),
  Shmups Wiki. Aimed shots, fairness ("single stray bullets are hard to read and can often
  feel unfair"), and invincibility after a death to prevent chain deaths. Brief
  invincibility after a shield hit was considered from it and left out (2026-11-13).
- ["(Breaking) The Shmup Dogma"](https://www.gamedeveloper.com/design/-breaking-the-shmup-dogma),
  Game Developer. On readable bullets ("visible projectiles with strong colors and shapes,
  good contrast with the backgrounds"), the player only needing to watch the area around
  the hitbox, and fixed easy, normal and hard modes over adaptive difficulty, which made
  that game's difficulty "float wildly".
- Write-ups that describe shooter difficulty in kind, with no numbers: Giant Bomb,
  ["Dynamic Difficulty"](https://giantbomb.com/wiki/Concepts/Dynamic_Difficulty); Game
  Developer, [on Battle Garegga](https://gamedeveloper.com/design/battle-garegga-more-pink-flamingos-please);
  Retro XP, [on Battle Garegga](https://retroxp.substack.com/p/past-meets-present-battle-garegga);
  TV Tropes, ["Nintendo Hard: shoot 'em ups"](https://tvtropes.org/pmwiki/pmwiki.php/NintendoHard/ShootEmUps).
  Rank systems, Gradius strengthening enemies with each power-up, and maze-like terrain;
  the reason the guardrails are relative (2026-11-11; [PLAN.md](PLAN.md), "Difficulty
  guardrails").
- BSMG wiki, ["Downmapping"](https://bsmg.wiki/mapping/downmapping.html). Beat Saber
  mappers cut note density by about 20% a step down. The guardrails step the difficulties
  against each other on the same idea (2026-11-11). A
  [Synth Riders guide](https://www.itechguides.com/what-are-notes-charts-and-difficulty-levels-in-synth-riders/)
  says that game's tiers don't map to a fixed number of notes a second.

## Music and licensing

- Drozerix's [itch.io page](https://drozerix.itch.io): "Feel free to use my music in your
  games", linking to his Mod Archive modules. Love for Retro, maker of Solstice, which uses
  only his music: "he kindly offers it under a public domain license"
  ([comment](https://itch.io/post/3819153), [comments page](https://loveforretro.itch.io/solstice/comments)).
  His [Bandcamp](https://drozerix.bandcamp.com/track/dim-cave) releases, as Nick Monson,
  are "all rights reserved"; they are separate releases, and the game uses the Mod Archive
  files, each marked Public Domain (2026-11-08; [SONG-DIGEST.md](SONG-DIGEST.md)).
- Creative Commons, [Public Domain](https://creativecommons.org/licenses/publicdomain/):
  the license link in `music/manifest.json` for every bundled and test song.

## Music playback

- [libopenmpt documentation](https://lib.openmpt.org/doc/), and its
  [interactive extension](https://lib.openmpt.org/doc/classopenmpt_1_1ext_1_1interactive.html):
  rendering, the tempo factor each difficulty plays at, and the render parameters the
  analysis pins ([PLAN.md](PLAN.md), "Determinism rules").
- OpenMPT's source at the pinned tag: [`soundlib/modcommand.h`](https://github.com/OpenMPT/openmpt/blob/libopenmpt-0.8.10/soundlib/modcommand.h),
  the effect numbers that set how enemy ships move (vibrato 5, 7 and 26, slides 2 and 3,
  arpeggio 1), and [`soundlib/Snd_defs.h`](https://github.com/OpenMPT/openmpt/blob/libopenmpt-0.8.10/soundlib/Snd_defs.h),
  `DEFAULT_ROWS_PER_MEASURE` (16), the copper bars' downbeat
  ([DEVELOPMENT.md](DEVELOPMENT.md)). Also read for the measure:
  [`pattern.h`](https://sources.debian.org/src/libopenmpt/0.8.4-1/soundlib/pattern.h) in
  Debian's copy, and an [OpenMPT commit message](https://sourceforge.net/p/modplug/mailman/message/58848142).
- The WASM build's inputs, [OpenMPT](https://github.com/OpenMPT/openmpt) and
  [emsdk](https://github.com/emscripten-core/emsdk), are pinned with their commits in
  `packages/analysis/vendor/libopenmpt/BUILD.md`.

## Sound effects

The full research, with what each source showed and what was measured, is in
[SOUND-EFFECTS.md](SOUND-EFFECTS.md). The sources:

- [chr15m/jsfxr](https://github.com/chr15m/jsfxr) and
  [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX): existing effect generators,
  their source read for each kind of sound.
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

## Picture and HUD

- Nuñez, Anderton and Renslow, ["Optimizing colormaps with consideration for color vision deficiency to enable accurate interpretation of scientific data"](https://pmc.ncbi.nlm.nih.gov/articles/PMC6070163/),
  *PLOS ONE* (2018): cividis, the Colour-blind LED setting's dark blue to yellow, its
  values from Matplotlib's [`_cm_listed.py`](https://github.com/matplotlib/matplotlib/blob/v3.9.2/lib/matplotlib/_cm_listed.py)
  at v3.9.2 (2026-11-10; `render/palette.ts`).
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/): the general and red flash thresholds
  (2.3.1) that the Reduced flashing setting keeps the crash flash, the nuke's flash, the
  hangar's strobe and the copper bars' downbeat pulse under (`render/flash.ts`), and
  target size (2.5.5; [Understanding page](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html):
  44 by 44 CSS px) for the touch keys.
- HUD guides read for the icon-only HUD (2026-11-11): [Abratabia](https://www.abratabia.com/game-ui-design/hud-design.php),
  [UX Collective](https://bootcamp.uxdesign.cc/7-obvious-beginner-mistakes-with-your-games-hud-from-a-ui-ux-art-director-d852e255184a),
  [Virtuall](https://virtuall.pro/blog/game-interface-design),
  [RocketBrush](https://rocketbrush.com/blog/designing-practical-and-pretty-hud-in-video-games),
  [Pixune](https://pixune.com/blog/game-ui-design/) and a
  [GameDev.tv thread](https://community.gamedev.tv/t/my-alternate-lives-ui/233717). None
  sets a rule for showing lives as "x3"; they agree that small text fails on phones, text
  can vanish against a changing background, core status should read at a glance, and colour
  needs a shape beside it.

## Input

- W3C, [UI Events KeyboardEvent code values](https://www.w3.org/TR/uievents-code/): key
  names on the Keys screen ([DEVELOPMENT.md](DEVELOPMENT.md)).
- W3C, [Gamepad](https://w3c.github.io/gamepad/), "Remapping": the standard pad layout.
  Pads without it: the [3960.org gamepad test](https://3960.org/sandbox/gamepad-test.html)
  on hats reported as one axis, [Mozilla bug 952773](https://bugzilla.mozilla.org/show_bug.cgi?id=952773)
  and [WebKit bug 214419](https://bugs.webkit.org/show_bug.cgi?id=214419). The spec
  doesn't cover hats, so this is the least certain input code (2026-11-10).
- Microsoft Learn, ["Getting Started With XInput"](https://learn.microsoft.com/en-us/windows/win32/xinput/getting-started-with-xinput),
  "Dead Zone": a pad stick's dead zone (`XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE`, 7849 of
  32767). Touch stick guides read at the same time, none with a number to use:
  [Bugnet](https://bugnet.io/blog/how-to-fix-mobile-virtual-joystick-feeling-bad),
  [Abratabia](https://www.abratabia.com/game-controls/virtual-joystick.php),
  [Cursa](https://cursa.app/en/page/touch-controls-for-mobile-games-input-patterns-and-feedback)
  and Godot's [VirtualJoystick](https://docs.godotengine.org/en/stable/classes/class_virtualjoystick.html)
  (2026-11-12).
- W3C, [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/): the touch pad.
- MDN, [Keyboard: lock()](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock),
  and the WICG [Keyboard Lock](https://wicg.github.io/keyboard-lock/) draft: Esc stays the
  pause key in full screen in Chrome and Edge, and holding it leaves (2026-11-12).
- Wikipedia, ["Konami Code"](https://en.wikipedia.org/wiki/Konami_Code): the infinite lives
  code matches the original sequence (2026-11-10).

## The browser

- WHATWG, [Fullscreen API](https://fullscreen.spec.whatwg.org/), and the HTML standard's
  [activation-triggering input events](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event):
  when the game may go full screen and start sound.
- MDN's [browser-compat-data](https://github.com/mdn/browser-compat-data), read for:
  Ed25519 signing (Chrome 137, Firefox 129, Safari 17), the device key the boards use;
  `AudioContext.outputLatency` and `getOutputTimestamp`, for the audio clock; and
  `requestFullscreen`, "Only available on iPad, not on iPhone".
- MDN, [SubtleCrypto: sign()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign):
  Ed25519 keys and signatures (`game/net.ts`).
- MDN, [webkitdirectory](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory):
  importing a folder of songs.
- MDN, [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):
  `navigator.storage.persist()` after an import, which Firefox asks the player about and
  Chrome and Safari decide on their own (`game/library.ts`).
- Audio in the CI browsers (2026-11-10): [Mozilla bug 1656847](https://bugzilla.mozilla.org/show_bug.cgi?id=1656847)
  on headless Firefox audio, fixed in CI with a PulseAudio null sink; WebKit bugs
  [273511](https://bugs.webkit.org/show_bug.cgi?id=273511) (an AudioContext stuck on
  Interrupted) and [281566](https://bugs.webkit.org/show_bug.cgi?id=281566), WebKit's
  [interrupted state test](https://webkit.googlesource.com/WebKit/+/master/LayoutTests/webaudio/audiocontext-state-interrupted.html),
  and Chromium's [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/iNj-OIZ1T3Q)
  for that state. WebKit's live audio never started in CI, so its song clock tests skip
  there with a logged reason.

## Hardware

- Samsung Galaxy S25, Brad's phone and the performance target: 6.2 in, 1080 x 2340, 1 to
  120 Hz, so a frame every 8.3 ms ([TechRadar](https://www.techradar.com/phones/samsung-galaxy-phones/samsung-galaxy-s25-specs),
  [Tom's Guide](https://www.tomsguide.com/phones/samsung-phones/samsung-galaxy-s25),
  [GSMArena](https://m.gsmarena.com/samsung_galaxy_s25-review-2794p3.php); one review lists
  1080 x 2300; [PLAYTEST.md](PLAYTEST.md)).

## Breaking terrain

- How falling pieces are found in destructible terrain: 80.lv on
  [Noita's falling sand](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/),
  and [connected components](https://stb.handmade.network/blog/p/1136) on stb's blog. The
  walls here are columns, so a column only needs a check along its own length (2026-11-11).
- Kyle Pittman's GDC talk "Building a Better Jump" ([GDQuest's write-up of its
  formulas](https://www.gdquest.com/library/kinematic_jump_formulas)): g = 2h / t² was
  proposed for falling blocks; they fall with the bomb's gravity instead.

## Art references

- US patents [4087844](https://patents.google.com/patent/US4087844A/en), a cassette deck
  door hinged at the top, and [4607301](https://patents.google.com/patent/US4607301A/en),
  a car stereo's outer door hinged at the bottom: the hangar intro's tape deck
  ([DEVELOPMENT.md](DEVELOPMENT.md), "Playing it"). Also read: Japanese utility model
  [JPH0240608Y2](https://patents.google.com/patent/JPH0240608Y2/en), a deck door pivoted
  at its lower edge and sprung shut, which matched neither the drawing nor the others
  closely enough to cite.
- Wikipedia, ["Cassette tape"](https://en.wikipedia.org/wiki/Cassette_tape): the shell's
  4 x 2.5 in size. The face's layout (screws, hubs, label, the trapezoid along the bottom)
  came from a [photo of a GoldStar DJ60](https://commons.wikimedia.org/wiki/File:Goldstar_compact_cassette_DJ60_20090717.jpg)
  on Wikimedia Commons (CC BY-SA 3.0, by Sim1992), used only to look at; nothing of it is in
  the game.

## Server

- Node.js, [`node:sqlite`](https://nodejs.org/api/sqlite.html): the boards' database;
  foreign keys are on by default (`packages/server/src/db.ts`).
- SQLite, [ALTER TABLE](https://www.sqlite.org/lang_altertable.html), "Making Other Kinds
  Of Table Schema Changes": rebuilding the players table.
- Wikipedia, ["Scunthorpe problem"](https://en.wikipedia.org/wiki/Scunthorpe_problem): why
  the name filter counts roots that sit inside innocent words only as whole words.

## Writing

- The four sources behind the plain wording rules (Wikipedia's field guide to signs of AI
  writing and three studies of the words language models overuse) are listed with their
  links in [DOC-STYLE.md](DOC-STYLE.md), "Plain wording", where the rules are.

## Dead ends

- **Bullets on screen, and invincibility after a hit:** no published number for shooters
  (searched 2026-11-11 and 2026-11-13).
- **Boghog's "Difficulty Design - What Makes A Bullet Pattern Hard?"**, a cohost post
  (`cohost.org/boghog/post/5119567-difficulty-design`): cohost redirects it to the Wayback
  Machine, which couldn't be fetched (2026-11-13). Boghog's shmup 101 above was used instead.
- **Arcade time per credit:** the only figure found, 1 to 3 minutes for beginners on
  classic cabinets, is from [Game Design Skills](https://gamedesignskills.com/game-design/arcade/),
  which cites no source; not used (2026-11-11).
- **Showing lives as "x3":** no published rule (see "Picture and HUD").
- **Touch stick dead zone:** no published size; the pad's XInput figure is the one used.
- **Cassette face layout:** no text source describes it; the IEC 60094-7 standard
  ([listing](https://webstore.iec.ch/publication/728)) has label and window clauses, but
  its text is paywalled.
- **Pitch variation range:** a [Bugnet article](https://bugnet.io/blog/how-to-fix-unity-sfx-sounds-identical-every-play-no-variation)
  fetched only as an index page with no figure.
- **Music:** the [Big Mod Music Pack](https://computermouth.itch.io/big-mod-music-pack) on
  itch.io states no license, so none of it was used (2026-11-08).
- **Screen orientation lock:** its browser support was checked (2026-11-12); the game
  draws a portrait layout instead of locking the screen.
