# Pattern Break build plan

> The game's name is written in one place, `packages/client/src/config/brand.ts`.
>
> This is the design. What gets built next is in [`ROADMAP.md`](ROADMAP.md), what is
> finished is in [`CHANGELOG.md`](CHANGELOG.md), and how to work on the code is in
> [`DEVELOPMENT.md`](DEVELOPMENT.md). Nothing here is built unless the changelog says so.

## 1. Pitch

A horizontal-scrolling tunnel shooter in the Gradius mould, with more neon. **Every level is
generated from a tracker music module (MOD/XM/S3M/IT).** The ceiling is drawn from the left
audio channel and the floor from the right, both as segmented LED spectrum bars like an old
stereo's visualizer. Notes in the song's pattern data spawn enemies. A given module file
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
| Offline / PWA | vite-plugin-pwa 2 (Workbox 7) | Precache the app shell and bundled modules. |
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
  levelgen or sim output changes, so old scores land on a separate board.
- **Pin the libopenmpt WASM build.** Commit the binary and record its version in
  `GEN_VERSION` metadata. WebAssembly float arithmetic gives the same results in every
  engine (NaN bit patterns aside), but different libopenmpt versions can mix differently.
  Don't build with relaxed SIMD, whose results may vary by engine.
- **Offline render at a fixed 48 000 Hz**, with fixed render parameters (stereo separation,
  interpolation filter, volume ramping). Set them explicitly; don't rely on defaults.
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

Input: module bytes. Output: `LevelData` (serializable, cached in IndexedDB under
`hash + GEN_VERSION`).

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

## 6. Level generation (`packages/core/levelgen`)

A pure function: `generateLevel(levelData, difficulty, seed) -> Level`.

- **Scroll:** a constant number of pixels per *row*, so tempo changes visibly speed the
  tunnel up or slow it down. Scroll position is derived from song time.
- **Terrain:**
  - Ceiling columns come from left-channel band levels, hanging down. Floor columns come
    from right-channel band levels, rising up.
  - Each screen column of terrain is one analysis frame. Bands map across the vertical
    extent as LED segments.
  - **Fairness clamp:** after quantization, guarantee a minimum passable gap (scaled by
    difficulty). If ceiling and floor would close the gap, scale both down proportionally
    for that column, then smooth the gap's position so it can't move faster than the ship's
    top vertical speed.
  - Peak-hold caps: each column keeps a peak dot that holds briefly and then falls. The dot
    is solid (collidable) on Hard only.
- **Enemies (from note events):**
  - Map instrument to enemy archetype. The default heuristic, overridable per song in a
    sidecar JSON later: low-pitched or percussive samples (short, low note) become heavy,
    slow ships; high short samples (hats) become small, fast swarmers; the instrument with
    the most melodic notes becomes "lead" enemies; sustained pads become hazards or mines.
  - Note pitch sets spawn Y, within the open gap at that time.
  - Effects set motion: vibrato (4xy) is a sine weave (from a lookup table), arpeggio (0xy)
    a three-position flicker-hop, portamento up and down (1xx, 2xx) a dive or climb, volume
    slide a fade-in shield.
  - **Spawn enemies so they reach the player's firing line on their note's timestamp.** The
    music hit and the kill moment line up.
  - **Density control:** per difficulty, cap events per second and per channel. Easy keeps
    one or two channels; Hard keeps all of them. The seeded PRNG is used only for
    tie-breaking which events to drop.
- **Boss (after M6; see the roadmap):** the last pattern, or the most-repeated one, becomes a boss
  whose weak points pulse on the lead channel.

## 7. Simulation (`packages/core/sim`)

- Fixed 120 Hz tick. `tick(state, inputBits) -> state`.
- Sim time is derived from the audio clock (see "Audio and timing"). If the render loop hitches, run several
  ticks to catch up. Never skip ticks.
- Player ship: 8-way movement, a fire button (hold for auto-fire), one special or bomb
  button.
- Collision: ship against lit LED segments, enemies, and enemy bullets. Integer AABB
  (axis-aligned bounding box) or small hitboxes.
- A Gradius-style power-up meter, drawn as a VU meter. Collected capsules advance the meter,
  and a button press buys the highlighted upgrade (speed, double shot, laser, option pod,
  shield).
- Scoring: kills; an **on-beat bonus** for a kill within plus or minus N ms of a note event
  on that enemy's channel; a no-hit streak multiplier; an end-of-song survival bonus. Death
  costs a life; game over before the song ends keeps the partial score.
- **Replay format:** a header `{ moduleHash, difficulty, GEN_VERSION, SIM_VERSION }` plus
  run-length-encoded input bits per tick. That is all the server needs.

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
  and license, with links to the author and the source. A Credits screen lists everything,
  including libopenmpt (BSD) and, if used, chiptune3.js (MIT).

## 10. Visual spec (`packages/client/render`)

- Internal resolution **384x216** (16:9), integer-scaled with nearest-neighbour filtering
  and letterboxed. An optional 320x256 "Amiga PAL" mode later.
- Palette: near-black background with neon cyan, magenta, lime, and amber accents. LED
  segments go green to amber to red with height, with lit and unlit (dim) segments and
  white peak-hold dots.
- Backgrounds: animated copper-bar gradients (horizontal colour bands) and a parallax
  starfield. The bars can pulse with the bass channel's VU.
- Effects: pooled particle emitters on note hits and kills, hit-stop (cosmetic only),
  screen shake, a flash on downbeats, and a CRT filter (scanlines, slight bloom, vignette)
  as a toggle.
- **Accessibility:** a "reduce flashing" option (caps flash intensity and frequency; on by
  default until the player changes it), a shake toggle, a colour-blind-safe LED palette
  option, and remappable controls.
- **Performance:** object pools for bullets, enemies, and particles. No allocations in the
  per-frame loop. Particles use a ParticleContainer. Target 2 ms or less per frame of sim
  and render work on desktop.

## 11. Client UI (`packages/client/ui`)

- Title screen: chrome logo, and an attract mode that plays a bundled song's level with an
  AI ship.
- Library: bundled songs plus "Import modules" (file picker or drag and drop; directory
  import through the File System Access API on Chromium as an extra). Imported files are
  stored in IndexedDB.
- Song select: metadata, difficulty, personal best, the global top 10 when online, and
  attribution.
- Settings: audio latency calibration, volume, controls (keyboard, gamepad through the
  Gamepad API, a touch overlay on mobile), visual options, accessibility.
- Results screen: score breakdown, personal best, submit to the leaderboard, save the
  replay.

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
