# PATTERN BREAK — Build Plan

> Working title. Final name not chosen yet. Keep the name in one config constant (`src/config/brand.ts`) so it can be swapped.

## 1. Pitch

A horizontal-scrolling tunnel shooter, Gradius-style but more neon. **Every level is generated from a tracker music module (MOD/XM/S3M/IT).** The ceiling is drawn from the left audio channel and the floor from the right, both as segmented LED spectrum bars like an old stereo's visualizer. Notes in the song's pattern data spawn enemies. A given module file always produces the exact same level, so each song has its own global leaderboard.

Aesthetic: Amiga and arcade. Low-res pixel art, copper-bar gradients, chunky LED meters, lots of particles, optional CRT filter.

## 2. Non-negotiable principles

1. **Tracker files only.** No MP3/streaming support. Inputs are `.mod .xm .s3m .it` (anything libopenmpt plays is a bonus).
2. **Deterministic level generation.** Same file bytes + same generator version → bit-identical level data, in every browser and in Node.
3. **Deterministic simulation.** Same level + same input log → identical score, in every browser and in Node. The server validates scores by replaying input logs.
4. **Offline-first.** The game is fully playable with no network. Only leaderboards need a connection.
5. **Smooth.** Hold 60fps on a mid-range phone and support high-refresh displays. No GC stutter during play.

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | Monorepo with pnpm workspaces |
| Build | Vite | |
| Rendering | PixiJS v8 (WebGL, WebGPU when available) | Nearest-neighbour scaling, integer zoom |
| Module playback + analysis | libopenmpt compiled to WebAssembly | Start from chiptune3.js (DrSnuggles/chiptune, AudioWorklet). See Spike S1 |
| Offline/PWA | vite-plugin-pwa (Workbox) | Precache app shell + bundled modules |
| Local storage | IndexedDB (via `idb`) | User library, level cache, PBs, replays |
| Tests | Vitest + Playwright (Chromium, Firefox, WebKit) | Cross-engine determinism tests |
| Server | Node + Fastify + SQLite (better-sqlite3) | Node so the server can import the exact same sim package for replay validation. Dockerized and self-hostable |

## 4. Repo layout

```
/packages
  /core        # PURE deterministic code: levelgen, sim, PRNG, fixed-point math, replay format. No DOM, no Pixi.
  /analysis    # libopenmpt WASM wrapper: load module, offline render pass, pattern data extraction -> LevelData
  /client      # Vite app: Pixi renderer, audio playback, input, UI, storage, PWA
  /server      # Fastify API + replay validator (imports @game/core)
/music         # bundled modules + manifest.json (see §10)
/tools         # scripts: twiddle/threshold table generator, manifest validator, determinism checker
```

`core` must never import anything non-deterministic. Enforce this with an ESLint rule that bans `Math.random`, `Date`, `performance`, `Math.sin/cos/tan/exp/log/pow/atan2` and any DOM globals in `packages/core`.

## 5. Determinism rules (read before writing core code)

- **Song identity:** SHA-256 of the raw file bytes (`crypto.subtle`, or `node:crypto` on the server).
- **Leaderboard key:** `(moduleHash, difficulty, GEN_VERSION)`. Bump `GEN_VERSION` whenever levelgen or sim output changes, so old scores land on a separate board.
- **Pin the libopenmpt WASM build.** Commit the binary and record its version in `GEN_VERSION` metadata. WASM float math is deterministic across engines, but different libopenmpt versions can mix differently.
- **Offline render at a fixed 48 000 Hz**, with fixed render params (stereo separation, interpolation filter, volume ramping). Set them explicitly and don't rely on defaults.
- **No transcendental JS Math in core.** Precompute FFT twiddle factors and dB→LED-segment thresholds at build time with `/tools`, and commit them as constant typed-array data. At runtime use only `+ - * /`, `Math.sqrt`, `Math.floor`, comparisons and integer ops.
- **Simulation uses integer fixed-point** (e.g. positions in 1/256 px, Q24.8) with a fixed tick rate (120 Hz). Collision checks are integer-only.
- **Seeded PRNG** (sfc32 or mulberry32), seeded from the module hash plus difficulty. The PRNG is only called in a fixed order.
- **Cosmetics are exempt.** Particles, screen shake, CRT effects and background animation live in `client` and may use anything. They must never affect sim state.

## 6. Analysis pipeline (`packages/analysis`, runs in a Web Worker)

Input: module bytes. Output: `LevelData` (serializable, cached in IndexedDB under `hash + GEN_VERSION`).

1. Load module into libopenmpt. Read metadata: title, artist (if present), channel count, orders, patterns, instruments/samples.
2. **Offline render pass:** render the whole song at 48 kHz in fixed-size chunks (e.g. 256 frames). After each chunk, record:
   - current order, pattern, row, speed, tempo (→ exact row timestamps in samples)
   - per-channel VU left/right (reflects panning; classic 4-ch MODs are hard-panned L R R L)
   - rendered stereo PCM for that chunk → feed into the FFT step below
3. **Spectrum frames:** for each analysis frame (e.g. every 1/60 s of song time), FFT the left and right channels separately (Hann window via precomputed table). Collapse them into N bands (start with 16 log-spaced bands) and quantize each band to an LED segment level 0..S (start S = 12) using the precomputed threshold table. Store as `Uint8Array`s.
4. **Note events:** walk the order list and pattern data and emit an event for every note-on: `{ timeSamples, channel, instrument, note, volume, effect, effectParam }`. Use the row timestamps from step 2 so tempo/speed changes and pattern breaks (Dxx), position jumps (Bxx) and loops are handled by libopenmpt itself, not re-implemented.
5. **Structure:** record order boundaries and which pattern each order plays. Repeated patterns mean repeated level sections.
6. Song length: stop at song end. Detect infinite loops via libopenmpt's own song-end handling, with a hard cap (e.g. 15 min).

## 7. Level generation (`packages/core/levelgen`)

Pure function: `generateLevel(levelData, difficulty, seed) → Level`.

- **Scroll:** constant pixels per *row*, so tempo changes visibly speed the tunnel up or slow it down. Scroll position is derived from song time.
- **Terrain:**
  - Ceiling columns from left-channel band levels, hanging down. Floor columns from right-channel band levels, rising up.
  - Each screen column of the terrain is one analysis frame. Bands are mapped across the vertical extent as LED segments.
  - **Fairness clamp:** after quantization, guarantee a minimum passable gap (scaled by difficulty). If ceiling + floor would close the gap, scale both down proportionally for that column, then smooth the gap's position so it can't teleport faster than the ship's max vertical speed.
  - Peak-hold caps: each column keeps a "peak dot" that holds briefly and then falls. The dot is solid (collidable) on Hard only.
- **Enemies (from note events):**
  - Map instrument → enemy archetype. Default heuristic, overridable per song in a sidecar JSON later: low-pitched/percussive samples (short, low note) → heavy, slow ships; high short samples (hats) → small, fast swarmers; the instrument with the most melodic notes → "lead" enemies; sustained pads → hazards/mines.
  - Note pitch → spawn Y (within the open gap at that time).
  - Effects → motion: vibrato (4xy) → sine weave (from a lookup table), arpeggio (0xy) → 3-position flicker-hop, portamento up/down (1xx/2xx) → dive/climb, volume slide → fade-in shield.
  - **Spawn so enemies arrive at the player's firing line exactly on their note's timestamp.** The music hit and the kill moment line up.
  - **Density control:** per difficulty, cap events per second and per channel. Easy keeps one or two channels, Hard keeps all. Use the seeded PRNG only for tie-breaking which events to drop.
- **Boss (later milestone):** the last pattern (or the most-repeated pattern) becomes a boss whose weak points pulse on the lead channel.

## 8. Simulation (`packages/core/sim`)

- Fixed 120 Hz tick. `tick(state, inputBits) → state`.
- Sim time is derived from the audio clock (§9). If the render loop hitches, run multiple ticks to catch up. Never skip ticks.
- Player ship: 8-way movement, fire button (hold = auto-fire), one special/bomb button.
- Collision: ship vs lit LED segments, enemies, enemy bullets. Integer AABB or small hitboxes.
- Gradius-style power-up meter, drawn as a VU meter. Collected capsules advance the meter, and a button press buys the highlighted upgrade (speed, double shot, laser, option pod, shield).
- Scoring: kills, **on-beat bonus** (kill within ±N ms of a note event on that enemy's channel), no-hit streak multiplier, end-of-song survival bonus. Death = lose lives; game over before song end keeps the partial score.
- **Replay format:** header `{ moduleHash, difficulty, GEN_VERSION, simVersion }` + run-length-encoded input bits per tick. This is all the server needs.

## 9. Audio and timing (`packages/client/audio`)

- Playback through the libopenmpt AudioWorklet, from the same module bytes.
- **Master clock = audio clock.** Song time = `(audioContext.currentTime − startTime) − outputLatency + userOffset`. The sim follows this clock. Never use frame time.
- **Latency calibration screen:** tap along to a click track and store the offset per device. Expose a manual slider too (Bluetooth headphones can add 150–250 ms).
- Pause/resume must suspend the context and the sim together.

## 10. Bundled music (`/music`)

- `manifest.json` entries: `{ file, title, author, authorUrl, sourceUrl, license, licenseUrl, sha256 }`.
- **License allowlist: Public Domain, CC0, CC BY.** Exclude NC and ND. Flag **CC BY-SA for manual review** rather than auto-accepting it: CC 3.0/4.0 licenses treat syncing music to moving images as creating an adaptation, and ShareAlike would then apply to that adaptation.
- `tools/validate-manifest.ts` runs in CI: every file is listed, the hash matches, the license is in the allowlist, and attribution fields are non-empty.
- Source candidates: The Mod Archive (only modules whose page states a PD/CC license) and the "Big Mod Music Pack" on itch.io (permissive subset of Mod Archive). Verify each file's license on its original Mod Archive page. Some uploads are mislabeled (e.g. covers of commercial songs tagged PD), so exclude covers and remixes of commercial music.
- **On-screen attribution:** a song-select card and level intro show title, author and license, with links to the author and source. A Credits screen lists everything, including libopenmpt (BSD) and chiptune.js (MIT).

## 11. Visual spec (`packages/client/render`)

- Internal resolution **384×216** (16:9), integer-scaled with nearest-neighbour filtering and letterboxed. Optional 320×256 "Amiga PAL" mode later.
- Palette: near-black background, neon cyan/magenta/lime/amber accents. LED segments go green → amber → red with height, lit vs unlit (dim) segments, and peak-hold dots in white.
- Backgrounds: animated copper-bar gradients (horizontal colour bands) and a parallax starfield. Bars can pulse with the bass channel VU.
- Juice: pooled particle emitters on note hits and kills, hit-stop (cosmetic only), screen shake, flash on downbeats, CRT filter (scanlines + slight bloom + vignette) as a toggle.
- **Accessibility:** "reduce flashing" option (caps flash intensity and frequency, default ON until the player changes it), shake toggle, colour-blind-safe LED palette option, and remappable controls.
- **Performance:** object pools for bullets, enemies and particles. No allocations in the per-frame loop. Use a ParticleContainer for particles. Target ≤ 2 ms/frame of sim+render work on desktop.

## 12. Client UI (`packages/client/ui`)

- Title screen (chrome logo, attract mode playing a bundled song's level with an AI ship).
- Library: bundled songs + "Import modules" (file picker / drag-drop; File System Access API directory import on Chromium as an enhancement). Imported files are stored in IndexedDB.
- Song select: metadata, difficulty, personal best, top-10 global (when online), attribution.
- Settings: audio latency calibration, volume, controls (keyboard, gamepad via Gamepad API, touch overlay for mobile), visual options, accessibility.
- Results screen: score breakdown, PB, submit to leaderboard, save replay.

## 13. Server (`packages/server`)

- `POST /runs`: `{ replay, claimedScore, playerId }`. The server needs the module file to re-run the level. Flow:
  1. If the hash is a bundled song or already known, load it from server storage.
  2. If unknown, respond `needModule` and the client uploads the module bytes (size cap ~4 MB; verify the hash on receipt).
  3. Run `@game/core` levelgen + sim on the replay in a worker thread. Accept only if the computed score equals the claimed score.
- `GET /leaderboards/:hash?difficulty=` returns the top N plus the caller's rank.
- `GET /songs/:hash` returns metadata, author/source links and the player count.
- **Players:** v1 uses an anonymous device keypair plus a chosen nickname, and the player can add one optional profile link (their music page: Mod Archive, Bandcamp, SoundCloud, etc.) shown on leaderboard entries. Add accounts/magic-link login later.
- Rate limiting per IP and per player. Replays are stored so top runs can be watched.
- Module storage: only store uploaded modules for hash lookup and validation. Don't serve user-uploaded modules publicly unless their license allows it.

## 14. Milestones

Do these in order and commit at the end of each one. Don't start the next until the current milestone's acceptance checks pass.

**S1 — Spike: libopenmpt access (do first)**
- Confirm whether chiptune3.js exposes the libopenmpt calls needed: pattern/row/channel command data, current order/row, per-channel VU, offline render to a buffer. If it doesn't, build libopenmpt with Emscripten and export the needed C API functions directly.
- Acceptance: a Node script and a browser page both load the same `.mod`, produce `LevelData`, and print an identical SHA-256 of the serialized `LevelData`.

**M1 — Vertical slice**
- One bundled song, LED terrain (ceiling/floor) scrolling in sync with playback, player ship, terrain collision, death/restart.
- Acceptance: 60fps on desktop Chrome; terrain visibly in time with the music by ear.

**M2 — Enemies and scoring**
- Note events → enemies, shooting, on-beat bonus, score, lives, power-up meter.
- Acceptance: a replay recorded in Chromium reproduces the identical score in Firefox, WebKit and Node (Playwright test).

**M3 — Juice and look**
- Particles, copper bars, starfield, CRT filter, hit flashes, title screen, results screen, accessibility toggles.

**M4 — Library, offline, music pack**
- Module import, IndexedDB caching, PWA install + full offline play, bundled pack with manifest validation, attribution and credits screens.
- Acceptance: install as a PWA, turn on airplane mode, import a new module, and play it.

**M5 — Leaderboards**
- Fastify server, replay validation, per-song boards, player profile link, Docker compose file.
- Acceptance: a tampered score is rejected; a legit run appears on the board.

**M6 — Mobile and polish**
- Touch controls, gamepad, latency calibration, performance pass on a mid-range Android phone, difficulty tuning across ~20 varied modules.

## 15. Testing

- **Golden tests:** for fixture modules in `/packages/analysis/fixtures`, assert the SHA-256 of `LevelData` and `Level` against committed snapshots. Any change requires a `GEN_VERSION` bump.
- **Cross-engine determinism:** a Playwright job runs fixtures + recorded replays in Chromium, Firefox and WebKit and compares against Node.
- **Sim unit tests:** collision, scoring, power-ups, replay encode/decode.
- **Performance check:** a headless benchmark of 10 000 sim ticks with max entities.

## 16. Open decisions (ask the owner, don't guess)

1. Final game title (placeholder: PATTERN BREAK).
2. Free vs paid. This affects which licenses are acceptable (NC is already excluded).
3. Platform priority: desktop web first, or mobile first?
4. Where the leaderboard server is hosted (self-hosted homelab vs a VPS).
5. Whether leaderboards accept user-imported modules from day one, or bundled songs only at first.
