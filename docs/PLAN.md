# Pattern Break build plan

> The game's name is written in one place, `packages/client/src/config/brand.ts`.
>
> This is the design. What gets built next is in [`ROADMAP.md`](ROADMAP.md), what is
> finished is in [`CHANGELOG.md`](CHANGELOG.md), and how to work on the code is in
> [`DEVELOPMENT.md`](DEVELOPMENT.md). Nothing here is built unless the changelog says so.

## 1. Pitch

A horizontal-scrolling tunnel shooter in the Gradius mould, with more neon. **Every level is
generated from a tracker module (MOD/XM/S3M/IT): a song file made in a music tracker, a
program that arranges short samples into patterns of notes and beats.** Modules are often
called mods; in player-facing text they are songs (see `DOC-STYLE.md`). The terrain is a cavern of
segmented LED meter bars, like an old stereo's visualizer: it squeezes on every hit and
winds up and down with the melody. Notes in the song's pattern data spawn enemies. A given module file
always produces the same level, so each song has its own global leaderboard.

Aesthetic: Amiga and arcade. Low-res pixel art, copper-bar gradients, chunky LED meters,
lots of particles, an optional CRT filter.

## 2. Principles

1. **Tracker files only.** No MP3 or streaming. Inputs are `.mod .xm .s3m .it`; anything
   else libopenmpt plays is a bonus.
2. **Deterministic level generation.** Same file bytes and same generator version give
   bit-identical level data, in every browser and in Node.
3. **Deterministic simulation.** Same level and same input log give the same score, in
   every browser and in Node. The server validates scores by replaying input logs.
4. **Offline-first.** The game is fully playable with no network. Only leaderboards need a
   connection.
5. **Smooth.** Hold 60 fps on a mid-range phone and support high-refresh displays. No
   garbage-collection stutter during play.

## 3. Tech stack

Versions checked 2026-11-08. Pin exact versions in the lockfile; recheck before each
milestone.

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node 26 LTS | Entered LTS on 2026-10-28. Runs the workspace's TypeScript directly (type stripping), so `core`, `analysis` and `server` have no build step and the server imports `core` source as-is. |
| Package manager | pnpm 12 | Workspaces. Version pinned in `packageManager`. |
| Language | TypeScript 7, strict | The native compiler. Type-check only (`noEmit`). `erasableSyntaxOnly` is on so Node can run every file: no `enum`, `namespace`, or constructor parameter properties. |
| Lint | Oxlint, plus a local JS plugin | typescript-eslint's peer range stops below TypeScript 6.1, so it can't run beside TypeScript 7. Oxlint parses TypeScript itself. Its built-in `no-restricted-*` rules and `tools/lint/determinism-plugin.js` enforce the determinism rules. |
| Build | Vite 8 | Client only. |
| Rendering | PixiJS 8 (WebGL, WebGPU when available) | Nearest-neighbour scaling, integer zoom. |
| Module playback and analysis | libopenmpt 0.8.10, our own WebAssembly build | Built with emsdk 6.0.13 by `tools/build-libopenmpt.sh` and committed in `packages/analysis/vendor/libopenmpt/` (decided in S1). We carry one patch, which seeds libopenmpt's playback random number generator with a fixed value; upstream seeds it from the clock, so modules that use random effects render differently on every load. The same `.wasm` runs in Node, a browser worker, and an AudioWorklet. |
| Offline / PWA | vite-plugin-pwa 2 (Workbox 7) | Precache the app shell and bundled modules (built 2026-11-10). |
| Local storage | IndexedDB via `idb` 8 | User library, level cache, personal bests, replays. |
| Tests | Vitest 5 | Unit tests in Node. Cross-engine determinism tests use Vitest browser mode with the Playwright provider (Chromium, Firefox, WebKit), so one test file runs in Node and in all three engines. |
| End-to-end | Playwright 1.65 | PWA install and offline play, UI flows. |
| Server | Fastify 5 and SQLite through the built-in `node:sqlite` | `node:sqlite` is stability 1.2 (release candidate) in the Node 26 docs and needs no native build. If it causes trouble, `better-sqlite3` is a drop-in fallback. |
| Hosting | Docker, images on GitHub Container Registry (ghcr.io) | One image serves the API and the built client. It runs on Brad's Unraid server; anyone can self-host the same image. |
| License | MIT | The game is free and open source. Bundled music keeps its own licenses (see "Bundled music"). |

## 4. Determinism rules

Read before writing core code.

- **`packages/core` is pure.** No clocks, no randomness, no host or DOM globals, no
  transcendental `Math`, and only relative imports. Lint enforces this; the rule list and
  how it's tested are in `DEVELOPMENT.md`, "The determinism lint".
- **Song identity:** SHA-256 of the raw file bytes (`crypto.subtle` in the browser,
  `node:crypto` on the server). `.gitattributes` marks module and WASM files binary so git
  never rewrites their bytes.
- **Leaderboard key:** `(moduleHash, difficulty, GEN_VERSION)`. Bump `GEN_VERSION` whenever
  levelgen or sim output changes, so old scores land on a separate board. Impossible is a
  difficulty like the others, with its own boards; only a run with a cheat is kept off
  (Brad, 2026-11-10).
- **Pin the libopenmpt WASM build.** Commit the binary and record its version in
  `GEN_VERSION` metadata. WebAssembly float arithmetic gives the same results in every
  engine (NaN bit patterns aside), but different libopenmpt versions can mix differently.
  Don't build with relaxed SIMD, whose results may vary by engine.
- **Offline render at a fixed 48 000 Hz**, with fixed render parameters (stereo separation,
  interpolation filter, volume ramping). Set them explicitly; don't rely on defaults. The
  one setting that varies is the tempo factor, which is fixed per difficulty and recorded
  in the LevelData; playback uses the same one.
- **No transcendental JS Math in core.** Precompute FFT twiddle factors and dB-to-LED-segment
  thresholds at build time with `/tools` and commit them as constant typed-array data. At
  runtime use only `+ - * /`, `Math.sqrt`, `Math.floor`, comparisons, and integer ops.
- **The simulation uses integer fixed-point** (for example, positions in 1/256 px, Q24.8) at
  a fixed tick rate of 120 Hz. Collision checks are integer-only.
- **Seeded PRNG** (sfc32 or mulberry32), seeded from the module hash plus difficulty, and
  called in a fixed order.
- **Cosmetics are exempt.** Particles, screen shake, CRT effects, and background animation
  live in `client` and may use anything. They never affect sim state.

## 5. Analysis pipeline (`packages/analysis`, runs in a Web Worker)

Input: module bytes and the difficulty's tempo. Output: `LevelData` (serializable, cached in
IndexedDB under `hash + tempo + GEN_VERSION`).

1. Load the module into libopenmpt. Read metadata: title, artist (if present), channel
   count, orders, patterns, instruments and samples.
2. **Offline render pass:** render the whole song at 48 kHz in fixed-size chunks (for
   example, 256 frames). After each chunk, record:
   - current order, pattern, row, speed, and tempo, which give row timestamps in samples
   - per-channel VU (volume unit) left and right, which reflects panning; classic 4-channel
     MODs are hard-panned L R R L
   - the rendered stereo PCM for that chunk, which feeds the FFT step below
3. **Spectrum frames:** for each analysis frame (for example, every 1/60 s of song time),
   FFT the left and right channels separately (Hann window from a precomputed table).
   Collapse them into N bands (start with 16 log-spaced bands) and quantize each band to an
   LED segment level 0..S (start with S = 12) using the precomputed threshold table. Store as
   `Uint8Array`s.
4. **Note events:** walk the order list and pattern data and emit an event for every
   note-on: `{ timeSamples, channel, instrument, note, volume, effect, effectParam }`. Use
   the row timestamps from step 2, so libopenmpt itself handles tempo and speed changes,
   pattern breaks (Dxx), position jumps (Bxx), and loops. Don't re-implement them.
5. **Structure:** record order boundaries and which pattern each order plays. Repeated
   patterns mean repeated level sections.
6. **Song length:** stop at song end. Detect infinite loops with libopenmpt's own song-end
   handling, plus a hard cap (for example, 15 minutes).

## 6. Level generation (`packages/core/src/levelgen`)

A pure function: `generateLevel(levelData, difficulty) -> Level`. Enemies are placed from
the notes in order, so nothing here needs randomness.

The aim: the player should feel they are playing the beat, and there is always a path for
the ship, even when it is hard to fly. The path is a hard guarantee, checked by tests on
every bar of every generated level.

- **One bar per played row.** The terrain is a row of LED bars, one for each row
  libopenmpt played, in play order. Bars are 10 px apart (8 px lit, 2 px open), so bar i
  sits at world x i * 10.
- **Scroll follows the rows.** Between the starts of consecutive rows the scroll position
  moves linearly from one bar to the next; the last row ends at the song's end. A faster
  tempo scrolls faster, and every bar sits on the music's grid. A bar reaches the playhead
  (screen x 64) when its row starts.
- **Ceiling and floor (2026-11-09):** the walls come from the song's pattern data and its
  channel meters, not its spectrum. On 2026-11-09 a spectrum-driven wall barely changed on
  the beat (1.04 to 1.16 times as closed on beat rows), while the channel meters jump 3.6
  to 6.9 times as hard on beat rows.
  - **Hits squeeze the cave.** Every tracker channel has a volume meter, which jumps when
    a note starts. A row's hit is the sum of those jumps; the cave narrows by one segment
    (7 px) per 64 of hit, both walls together, from the difficulty's base gap down to its
    minimum, and opens again by up to 6 segments per bar.
  - **The cave winds with the melody.** The gap's centre follows the highest note a
    non-drum instrument starts, 3 px higher per semitone above C-5 (MIDI 72), held until
    the next note. A drum is an instrument whose three commonest pitches make up 95% of
    its notes; drums play a sound rather than a tune.
  - Each side keeps at least 2 segments, so the walls never vanish.
  - The playfield is 384 x 216 px. Segments are 7 px apart (6 px lit).
- **Always a path:**
  - The gap between ceiling and floor is never under the difficulty's minimum (66, 58 or
    50 px), against the ship's 6 px hitbox.
  - From one bar to the next the gap's centre moves no further than the ship can travel
    vertically in the earlier bar's row, and consecutive gaps always overlap by more than
    the ship's height. Levels are cut further where needed. A gap that grows to contain
    the previous one needs no cut, since the ship can stay where it is.
  - The ship's hitbox is as wide as a bar's pitch, so it touches two bars nearly all the
    time and passes from one pair to the next almost at once. Every three consecutive gaps
    therefore share at least 10 px.
  - The first bar reaches the ship on the first tick, so its gap is centred on the ship's
    start height.
- **Peak hold:** each side keeps a peak level that holds for 6 bars and then falls one
  segment per bar. Peak dots are off on every difficulty (2026-11-08): the peaks are
  computed but not drawn or solid. A difficulty can turn them on with `solidPeaks`, which
  makes them solid and visible and applies the path rules to them too.
- **Difficulty sets the song's speed and the cave's width (2026-11-09).** The song plays at
  0.9 times its tempo on easy, as written on normal, and 1.15 times on hard, without
  changing its pitch (libopenmpt's tempo factor), so the cave scrolls faster as well. The
  base gap is 118, 104 and 90 px and the minimum 66, 58 and 50 px (14 px wider since
  2026-11-10, when level 1 played too tight). The beat and the winding
  are the same on every difficulty; enemies (M2) add the rest of the challenge. Each
  difficulty is analyzed at its own tempo, so it has its own LevelData. Difficulty is a
  constant object (`easy`, `normal`, `hard`, and the secret `impossible`: hard's cave and
  enemies at the song's own tempo, 2026-11-10); the numbers and the exact rounding rules are
  in `docs/DEVELOPMENT.md`, "Level and sim". Impossible looks the part: its walls are a
  gradient of dark to bright red instead of the green to red, and its hangar intro has red
  strobes and an air raid siren (2026-11-10).
- **Enemies (2026-11-09):** three kinds, each from one part of the song. Every enemy fires
  on its own instrument's notes, so every shot lands on the music.
  - **Turrets** come from the drums. A turret sits on the tip of the bar its drum note plays
    on, so it reaches the ship as the drum sounds, on the floor and the ceiling in turn.
  - **Tanks** come from the bass: the non-drum instrument with the lowest middle note, when
    the song has at least two. A tank comes in from the right edge on a bass note and drives
    left along the floor, riding the bar under it.
  - **Ships** come from every other instrument. A note starts a formation and the
    instrument's next notes (at least 0.1 s apart, within 1 s of the first) add to it, up
    to 2, 3 or 4 ships by difficulty. A ship follows the cave's centre line, 2 px higher per
    semitone above its instrument's middle note (at most 24 px), and moves by its note's
    effect: vibrato weaves, a slide up climbs, a slide down dives, an arpeggio hops between
    three heights.
  - **Fire:** an enemy fires at the ship on its instrument's notes while it is on screen
    ahead of the ship, and no more often than the difficulty allows. Ships wait 0.25 s and
    fire 0, 1 or 2 times by difficulty. A bullet is aimed when fired and flies straight.
  - **Per difficulty** (`EnemyTuning`): the least time between turrets, between tanks and
    between formations, enemy bullet speed, and how many bullets can be in flight. No enemy
    appears or fires in a song's first 2 s.
  - **The path stays guaranteed.** Turrets and tanks count as wall in the path check: a
    turret is one more segment on its bar, and a tank's whole track raises the floor one
    segment above the highest of the bars around. A turret or tank that would break the
    path isn't placed. Ships and bullets are dodged or shot.
  - Per-song overrides of which instrument makes which enemy come later (roadmap).
- **Boss (after M6; see the roadmap):** the last pattern, or the most-repeated one, becomes a boss
  whose weak points pulse on the lead channel. In the arcade run, a mini boss ends level 4
  and the final boss ends level 8.

## 7. Simulation (`packages/core/src/sim`)

- Fixed 120 Hz tick, so 400 song samples per tick. `tick(level, state, inputBits)` updates
  a preallocated state in place and allocates nothing. Positions are Q24.8 fixed-point.
- Sim time is derived from the audio clock (see "Audio and timing"). If the render loop hitches, run several
  ticks to catch up. Never skip ticks.
- Player ship: 8-way movement, a fire button (hold for auto-fire: 15 shots a second, up to 6
  in flight; the gun sprays freely, and the bomb and missile have reloads), a bomb button,
  a nuke button, and boost and missile buttons that work once those are unlocked. Shots pass through the LED walls, so turrets on
  the bar tips can be hit, and stop on the first enemy they hit. Turrets and ships take one
  hit, tanks three.
- Collision: ship against lit LED segments, enemies, and enemy bullets. Integer AABB
  (axis-aligned bounding box) or small hitboxes. Enemy bullets stop on the walls. Bullets
  are aimed with `Math.sqrt`, which IEEE 754 rounds the same in every engine.
- **Shield (2026-11-10):** every life starts with a 6-point shield. A ship's bullet costs
  2, a tank's shell 3, a turret's shell 6, ramming an enemy 3, and touching a wall 3,
  which bounces the ship back towards the middle of the cave instead of killing it. While
  it has points it takes any hit; with none, a hit costs a life. It flickers with a thud
  on each hit. (Brad's play-test: no one had finished a level.)
- **Extra lives (2026-11-10):** one each time the score reaches a multiple of 20 000, up
  to 9.
- **Lives (2026-11-09):** three. A hit with the shield empty costs one; ramming an enemy destroys it too. The
  music can't rewind, so the ship comes back at the playhead: the enemy bullets in flight
  are cleared, it flies in from the left along the middle of the cave for 0.5 s with the
  controls locked, and enemies and bullets can't hit it for 2 s from the hit. The walls
  count again once it has control (2026-11-10; it used to appear at once and ignore the
  walls for 2 s, so it could drift into one).
- **Cheats (2026-11-10):** the Konami code on the title screen gives infinite lives;
  holding Esc or Start while choosing Play gives god mode (every power-up, kept after a
  life, and a shield that never weakens). The replay records them and the boards refuse
  such runs.
- **Bomb (2026-11-09):** each press of the bomb button drops a concussive bomb, one in the
  air at a time and 1 s to reload after it bursts, so bombs are timed, not held down.
  Never more than one tank is on screen at once (measured on all 27 levels). It falls in
  an arc and bursts on the terrain or an enemy, destroying every enemy
  within 24 px, tanks included. Its kills score like shots.
- **Nuke (2026-11-09):** a last resort. A press destroys every enemy on screen and clears
  the enemy bullets. One charges per 10 kills on the beat, up to 3 held, kept when a life
  is lost; a level starts with none. Its kills score their points times the multiplier,
  never doubled.
- **Power-ups (2026-11-09):** a meter drawn as a row of VU meter LEDs along the bottom,
  each cell lit while the ship has that power-up. Shooting down every ship of a formation,
  by any weapon, drops a capsule; a ship that gets away or is rammed spoils it. The
  capsule falls with the bomb's gravity to the cave's floor and scrolls away on it, so
  collecting one means flying low. Each capsule picked up unlocks the next power-up in
  this order that isn't at its most, wrapping round (2026-11-10: until then it moved a
  Gradius-style highlight that a buy button bought, which was impossible to do in
  flight):
  - **Double:** a second shot angled 45 degrees up. It stacks with the laser.
  - **Missile:** the bomb for air to air, on its own button: one per press, it bursts on
    the first enemy it touches and destroys every enemy within 20 px, then reloads for 1 s.
  - **Shield:** fills the shield again (see "Shield" above).
  - **Drone:** follows the ship's path 16 ticks behind (the second 32), can't
    be hit, and fires the ship's shots and missiles. Up to 2.
  - **Laser:** a beam 1.5 times as fast as a shot that goes through every enemy in line.
  - **Boost:** an afterburner on its own button, 1.67 times the ship's speed. The first
    unlock gives 1 s of fuel; each further one adds 1 s, up to 3. Fuel refills at a third
    of the rate it burns.

  Losing a life loses every power-up and starts the order again.
- **Scoring (2026-11-09):** a shot-down ship is 100, a turret 200, a tank 300; ramming scores
  nothing. The **on-beat bonus** doubles a kill within 25 ms of a note of that enemy's
  instrument. A **streak multiplier** adds 1 for every 10 kills without losing a life, up
  to 4. Reaching the end of the song adds 1000 a life left. Game over before the song ends
  keeps the partial score.
- **Replay format:** a header `{ moduleHash, difficulty, GEN_VERSION, SIM_VERSION, score }`
  plus run-length-encoded input bits per tick. That is all the server needs. A player can
  watch a run's replay and save it as a `.pbreplay` file (2026-11-09; the byte layout is in
  `DEVELOPMENT.md`, "Replays").

## 8. Audio and timing (`packages/client/audio`)

- Playback through the libopenmpt AudioWorklet, from the same module bytes.
- **The master clock is the audio clock.** Song time is
  `(audioContext.currentTime - startTime) - outputLatency + userOffset`. The sim follows
  this clock, never frame time.
- **Latency calibration screen:** tap along to a click track and store the offset per
  device. A manual slider too; Bluetooth headphones can add 150 to 250 ms.
- Pause and resume suspend the audio context and the sim together.

## 9. Bundled music (`/music`)

- `manifest.json` entries: `{ file, title, author, authorUrl, sourceUrl, license, licenseUrl, sha256 }`.
- **License allowlist: Public Domain, CC0, CC BY.** Exclude NC and ND. Flag **CC BY-SA for
  manual review** instead of accepting it automatically: the CC 3.0 and 4.0 licenses treat
  syncing music to moving images as creating an adaptation, and ShareAlike would then apply
  to that adaptation.
- `tools/validate-manifest.ts` runs in CI: every file is listed, every hash matches, every
  license is on the allowlist, and the attribution fields aren't empty.
- Sources: The Mod Archive (only modules whose page states a PD or CC license) and the "Big
  Mod Music Pack" on itch.io (a permissive subset of The Mod Archive). Verify each file's
  license on its original Mod Archive page. Some uploads are mislabeled (covers of
  commercial songs tagged PD, for example), so exclude covers and remixes of commercial
  music.
- **On-screen attribution:** the song-select card and the level intro show title, author,
  and license. A Credits screen lists everything, songs and code (libopenmpt is
  BSD-3-Clause), and opens each one's page (built 2026-11-10; Brad, 2026-11-10: the links
  live in Credits only).

## 10. Visual spec (`packages/client/render`)

- Internal resolution **384x216** (16:9), scaled by a whole number of device pixels with
  nearest-neighbour filtering and letterboxed (2026-11-10: whole CSS pixels left a phone
  at 1x). An optional 320x256 "Amiga PAL" mode later.
- Palette: near-black background with neon cyan, magenta, lime, and amber accents. LED
  segments go green at the screen edge to amber to red 12 segments in, and stay red beyond.
  Unlit segments are not drawn, so the passage is plain background (2026-11-09).
  White peak-hold dots are drawn only on a difficulty with solid peaks (none, for now).
- Backgrounds: animated copper-bar gradients (horizontal colour bands) and a parallax
  starfield. The bars pulse with the bass (the low spectrum bands; built 2026-11-10).
- Effects: pooled particle emitters on note hits and kills, screen shake, a flash on
  downbeats (the copper bars pulse), a white flash on an enemy that survives a hit, and a
  CRT filter (scanlines, slight bloom, vignette) as a toggle (built 2026-11-10). No
  hit-stop: the picture follows the song's clock, so a freeze would put it out of step with
  the music (Brad, 2026-11-10).
- Enemies are small pixel-art sprites: magenta and amber turrets (upside down on the
  ceiling), lime tanks, magenta ships facing left, and white-cored bullets in the colour of
  what fired them: a ship's magenta, a tank's lime, a turret's a larger amber pellet. The
  player's shots are cyan dashes. A destroyed enemy bursts into a few particles; the
  lives left are ship icons in the top left corner.
- Explosions: a destroyed ship breaks apart pixel by pixel; every pixel of its sprite
  becomes a particle in its own colour and flies outward, with an expanding colourful
  shockwave ring and a short shake (built 2026-11-10).
- Sound effects: synthesized in the client (no sample files, nothing to license) by our
  own sfxr-style generator, `@game/chipfx`, with our own parameters; pitched effects take
  their note from the song. Mixed under the music with their own volume and an off switch.
  The explosion is a deep boom with echo (a feedback delay) and reverb (a generated impulse
  response). Cosmetic, like every effect: never part of sim state. Research and design:
  `SOUND-EFFECTS.md` (decided with Brad, 2026-11-09).
- **Accessibility:** a "reduce flashing" option (caps flash intensity at a quarter of white
  and frequency at three a second, under WCAG 2.2's flash thresholds; on by default until
  the player changes it; built 2026-11-10), a shake toggle (built 2026-11-10), a
  colour-blind-safe LED palette option (cividis; built 2026-11-10), and remappable controls, for the keyboard and for gamepads and arcade sticks
  (Gamepad API; built 2026-11-10): up to three keys or inputs per action, menus following
  them.
- **Performance:** object pools for bullets, enemies, and particles. No allocations in the
  per-frame loop. Particles use a ParticleContainer. Target 2 ms or less per frame of sim
  and render work on desktop.

## 11. Client UI (`packages/client/ui`)

- Start screen: "Press any key", since browsers start audio only after a key press or
  click. The first press starts the title music.
- Title screen: chrome logo, the title song (The_Epic_Chip), a menu driven by up, down,
  left, right, confirm and back (the same actions on keyboard and gamepad), and an attract
  mode: on the song's change, the title song's level flown by the autopilot.
- Arcade run: levels in a fixed order, eight planned (Neon Techno first, the full
  Keygen 9000 last), each opening with a card that credits its song. Practice plays any one
  song. A mini boss ends level 4 and the final boss ends level 8 (see "Level generation").
- Game over plays the sparse opening of Keygen 9000 and fades out.
- Jukebox: plays the bundled songs, with an LED spectrum and each song's title, author and
  license.
- Library: bundled songs plus imported ones, managed in the Jukebox (Brad, 2026-11-10):
  Import (file picker or drag and drop; left and right choose File or Folder, the file
  picker's folder mode, in every current browser), and Del to remove. Imported files are stored in IndexedDB
  (built 2026-11-10).
- Song select: metadata, difficulty, personal best, the global top 10 when online, and
  attribution.
- Hangar intro before level 1 of each run from Play, skippable: in black and white, the
  captain boards the fighter and puts the song's cassette in the deck; pressing Play
  starts the song, the canopy closes, and the level floods into colour with the song
  (built 2026-11-10).
- Help, from the title and pause menus: a key to every sprite and HUD icon, and what each
  enemy and bonus scores (built 2026-11-10).
- Settings, from the title menu: Music and Effects volume (built); to come, audio latency
  calibration, control remapping, visual options, accessibility. Keyboard, gamepad
  (Gamepad API) and on-screen touch controls are built (touch 2026-11-10).
- Results screen: score breakdown, personal best in this browser, watch or save the
  replay (built 2026-11-10); submit to the leaderboard comes with M5.

## 12. Server (`packages/server`)

- `POST /runs`: `{ replay, claimedScore, playerId }`. The server needs the module file to
  re-run the level:
  1. If the hash is a bundled song or already known, load the module from server storage.
  2. If it's unknown, respond `needModule`, and the client uploads the module bytes (size
     cap about 4 MB; the server checks the hash on receipt).
  3. Run `@game/core` levelgen and sim on the replay in a worker thread. Accept the run only
     if the computed score equals the claimed score.
- `GET /leaderboards/:hash?difficulty=` returns the top N plus the caller's rank.
- `GET /songs/:hash` returns metadata, author and source links, and the player count.
- **Players:** v1 uses an anonymous device keypair plus a chosen nickname. A player can add
  one profile link (their music page: Mod Archive, Bandcamp, SoundCloud, and so on), shown
  on their leaderboard entries. Accounts and magic-link login come later.
- Rate limiting per IP and per player (`@fastify/rate-limit`). Replays are stored so top
  runs can be watched.
- Module storage: uploaded modules are stored only for hash lookup and validation. They
  aren't served publicly unless their license allows it.

## 13. Testing

- **Golden tests:** for the fixture modules in `packages/analysis/fixtures`, assert the
  SHA-256 of `LevelData` and `Level` against committed snapshots. Any change to them
  requires a `GEN_VERSION` bump.
- **Cross-engine determinism:** Vitest browser mode runs the fixtures and recorded replays
  in Chromium, Firefox, and WebKit and compares against the Node run.
- **Sim unit tests:** collision, scoring, power-ups, replay encode and decode.
- **Performance check:** a headless benchmark of 10 000 sim ticks with the maximum entity
  count.
- **Docs check:** `pnpm check:docs` enforces the writing rules in `docs/DOC-STYLE.md`.
