# Development guide

How to work on the code: setup, layout, conventions, checks, and how the changelog and
roadmap are kept. The design itself is in [`PLAN.md`](PLAN.md); the writing rules are in
[`DOC-STYLE.md`](DOC-STYLE.md); running the Docker image is in
[`SELF-HOSTING.md`](SELF-HOSTING.md). A module (or mod) is a song file made in a music tracker,
a program that sequences short samples in rows of notes; every level is built from one.

## Requirements

- **Node 26.** The version is in `.nvmrc`. Node runs the workspace's TypeScript directly
  (type stripping), so `core`, `analysis`, and `server` have no build step.
- **pnpm 12.** The exact version is in `packageManager` in the root `package.json`.
- **Python 3 with Pillow**, only to rebuild the hangar intro's art (`tools/hangar-art.py`;
  see "Hangar intro art").

```sh
pnpm install
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the client dev server (Vite). |
| `pnpm build` | Builds every package that has a build step (the client). |
| `pnpm serve` | Serves the built client (`packages/client/dist`) on port 8080 with the static server in `packages/server`. Run `pnpm build` first. `PORT` and `CLIENT_DIST` override the defaults. |
| `pnpm lint` | Oxlint over the repo, including the core determinism rules. |
| `pnpm typecheck` | `tsc` (TypeScript 7) in each package, then in `tools/`. |
| `pnpm test` | Vitest in each package, in Node. |
| `pnpm test:browser` | The golden LevelData, level and sim tests, the recorded replay, and the client's audio and renderer tests in real browsers (see "Tests"). |
| `pnpm --filter @game/analysis analyze <file>` | Analyzes one module (a song file made in a music tracker) and prints its LevelData hash and a summary. |
| `pnpm screenshots` | Regenerates every figure in `docs/img/` (see "Screenshots"). |
| `pnpm --filter @game/analysis bench:sim [file]` | Builds each difficulty's level, flies it with the autopilot, and prints sim ticks per second. |
| `pnpm --filter @game/analysis bench:sim:max [file] [difficulty]` | The sim at its busiest, and what a server-side replay check costs (see "Simulation", "Speed"). |
| `pnpm record:replay` | Records the replay fixture in headless Chromium (see "Replays"). `--no-build` reuses `packages/client/dist`. |
| `pnpm check:docs` | The writing-rules check (`tools/check-docs.ts`). |
| `pnpm check:music` | Checks `music/manifest.json` against the files in `music/`, and the test songs' manifest in `packages/analysis/fixtures/test-songs` the same way (`tools/validate-manifest.ts`; see "Bundled songs"). |
| `pnpm check:difficulty` | Flies every bundled and test song's level with the autopilot on every difficulty, prints what it measured, and fails unless the difficulty guardrails hold (`tools/difficulty-report.ts`; see "Difficulty guardrails"). A few minutes; CI runs it as its own job. |
| `pnpm check:offline` | M4's acceptance check in headless Chromium: install, lose the network, import a song and play it (see "Install and offline"). Run `pnpm build` first. |
| `node tools/make-icons.ts` | Redraws the app icons in `packages/client/public/icons/`. |
| `pnpm gen:tables` | Regenerates `packages/core/src/spectrum/tables.generated.ts`. |
| `pnpm check` | Lint, type-check, tests, the docs check, and the music check, in that order. |

One package: `pnpm --filter @game/core test`. One test file:
`pnpm --filter @game/core exec vitest run test/determinism-lint.test.ts`.

## Project structure

```
pattern-break/
├── .github/workflows/ci.yml       # checks, build, and the golden test in three browser engines
├── .github/workflows/docker.yml   # builds the image, pushes it to ghcr.io (see SELF-HOSTING.md)
├── Dockerfile                     # the image: the server, the bundled songs and the built client
├── deploy/                        # docker-compose.yml and the Unraid template
├── .oxlintrc.json                 # lint config; the core determinism rules are its override
├── docs/
│   ├── PLAN.md                    # design, rules, tech choices
│   ├── ROADMAP.md                 # what comes next
│   ├── CHANGELOG.md               # what is finished
│   ├── DEVELOPMENT.md             # this file
│   ├── SELF-HOSTING.md            # running the Docker image: Docker, Compose, Unraid, HTTPS
│   ├── SOUND-EFFECTS.md           # sound effects: the research, the design, measurements
│   └── DOC-STYLE.md               # writing and voice
├── art/hangar/                    # the hangar intro's generated art as it came back, and how it was made (README.md)
├── music/                         # the bundled songs, manifest.json (credits, licenses), arcade.json (the run's order)
├── packages/
│   ├── core/                      # @game/core: deterministic levelgen, sim, PRNG, replays
│   │   ├── src/version.ts         # GEN_VERSION, SIM_VERSION, TICK_HZ, ANALYSIS_SAMPLE_RATE
│   │   ├── src/analysis-constants.ts  # the analysis pass parameters
│   │   ├── src/level-data/        # LevelData types and binary format
│   │   ├── src/spectrum/          # FFT, band and LED analysis, generated tables
│   │   ├── src/playfield.ts       # playfield geometry and tick timing
│   │   ├── src/levelgen/          # generateLevel, enemy placement, the path check, Level bytes
│   │   ├── src/sim/               # tick, collision, shots and enemies, the autopilot
│   │   └── test/determinism-lint.test.ts
│   ├── analysis/                  # @game/analysis: libopenmpt wrapper, produces LevelData
│   │   ├── src/analyze.ts         # the analysis pass
│   │   ├── src/openmpt.ts         # the libopenmpt binding
│   │   ├── scripts/analyze.ts     # prints a module's LevelData hash
│   │   ├── vendor/libopenmpt/     # the pinned WASM build (see "libopenmpt build")
│   │   ├── scripts/bench-sim.ts   # sim ticks per second on a module
│   │   ├── fixtures/              # test modules and golden.json, their pinned hashes
│   │   └── vitest.config.ts       # the node and browser test projects
│   ├── chipfx/                    # @game/chipfx: sfxr-style sound effect generator, no game code (README.md)
│   ├── client/                    # @game/client: the Vite app
│   │   ├── src/config/brand.ts    # the game's name, in one place
│   │   ├── src/audio/             # the libopenmpt AudioWorklet player, the song clock, sound effects and their mixer
│   │   ├── src/render/            # PixiJS renderer: terrain, ship, starfield, pixel font, effects
│   │   ├── src/game/              # game flow, frame loop, keyboard and gamepad input, analysis worker, capture mode
│   │   ├── src/sw.ts              # the service worker for install and offline play
│   │   ├── src/game/credits.ts    # the Credits screen: songs, code and licenses, each a link
│   │   ├── src/game/net.ts        # the leaderboard client: device key, signed requests, the queue
│   │   ├── src/game/scores.ts     # the Scores screen
│   │   ├── src/game/name-entry.ts # the end screens' name entry
│   │   ├── src/game/touch-text.ts # the hidden input that opens a phone's keyboard there
│   │   ├── public/icons/          # app icons, drawn by tools/make-icons.ts
│   │   ├── audio-debug.html       # dev-server page that plays the fixture and shows the clock
│   │   └── vitest.config.ts       # the node and browser test projects
│   └── server/                    # @game/server: the leaderboard API, the run checker, the static server
│       ├── src/app.ts             # Fastify: the /api routes, rate limits, the static fallback
│       ├── src/checker.ts         # rebuilds a level, replays a run, says why it's rejected
│       ├── src/check-worker.ts    # the worker thread the checks run in
│       ├── src/check-queue.ts     # hands checks to the worker
│       ├── src/db.ts              # SQLite: players, songs, runs, boards
│       ├── src/signature.ts       # Ed25519 request signatures
│       ├── src/song-store.ts      # song files by hash: bundled and uploaded
│       ├── src/static.ts          # serves the built client: MIME types, cache headers, /healthz
│       ├── src/main.ts            # entry point (PORT, CLIENT_DIST, DATA_DIR, MUSIC_DIR, TRUST_PROXY)
│       └── test/                  # api.test.ts (M5's acceptance check), static.test.ts
├── tools/
│   ├── check-docs.ts              # writing-rules check
│   ├── validate-manifest.ts       # music check: files listed, hashes, licenses, credits
│   ├── screenshots/               # pnpm screenshots: the shot manifest, PNG reader, GIF writer
│   ├── build-libopenmpt.sh        # rebuilds the vendored libopenmpt WASM
│   ├── libopenmpt/*.patch         # our patches to libopenmpt (see "libopenmpt build")
│   ├── make-fixture-mod.ts        # writes the test modules in packages/analysis/fixtures
│   ├── make-icons.ts              # draws the app icons
│   ├── offline-check.ts           # pnpm check:offline: install, offline, import and play
│   ├── perf-check.ts              # frame work per bundled level under CPU throttling
│   ├── gen-spectrum-tables.ts     # writes core's spectrum tables
│   ├── hangar-art.py              # makes the hangar intro's game-sized art from art/hangar
│   └── lint/determinism-plugin.js # Oxlint JS plugin for core
├── tsconfig.base.json             # shared compiler options
└── pnpm-workspace.yaml
```

Each workspace package's `exports` points at `./src/index.ts`; other packages and Node
import the source directly. `@game/analysis` also exports `./libopenmpt.wasm` and
`./fixtures/*`, so the client can import those files with Vite's `?url`.

## TypeScript

- Relative imports carry the `.ts` extension: `import { x } from './x.ts'`.
- `erasableSyntaxOnly` is on, because Node can only strip types, not compile them: no
  `enum`, `namespace`, or constructor parameter properties. Use `as const` objects and union
  types.
- `strict`, `noUncheckedIndexedAccess`, and `noPropertyAccessFromIndexSignature` are on.
- Each package's `tsconfig.json` sets its own `lib` and `types`. Core and analysis get
  ES2022 only (no DOM, no Node), because both run in browsers as well as Node; the client
  gets DOM and `vite/client`, except its service worker, which gets WebWorker
  (`tsconfig.sw.json`); the server gets Node. Core and analysis type-check their
  tests separately (`tsconfig.test.json`, with Node types), so test code can use `node:fs`
  without letting `src` use it.
- TypeScript 7 has no compiler API yet (the package exports only its version), so no tool in
  the repo may depend on one. That rules out typescript-eslint and ts-morph for now.

## The determinism lint

`packages/core/src` has to produce the same output in every engine (PLAN.md, "Determinism
rules"). Lint enforces the parts a linter can see.

- **Built-in rules** in the `overrides` block of `.oxlintrc.json`, scoped to
  `packages/core/src/**`:
  - `no-restricted-properties`: `Math.random` and the transcendental `Math` functions
  - `no-restricted-globals`: clocks, host and DOM globals, timers, `fetch`, `WebAssembly`
- **Plugin rules** in `tools/lint/determinism-plugin.js`, for what Oxlint has no built-in
  rule for:
  - `determinism/imports-stay-in-core`: every import, re-export and dynamic import must be
    relative and must resolve to a file inside `packages/core/src`. That rules out npm
    packages, `node:` modules, other workspace packages, and relative paths that climb out
    of core.
  - `determinism/no-pow-operator`: `**` and `**=`
  - `determinism/no-computed-math`: `Math['sin']`
  - `determinism/no-math-alias`: `const M = Math` and `const { sin } = Math`
- **The test**, `packages/core/test/determinism-lint.test.ts`, writes one probe file per
  banned case into `packages/core/src/__lint_probe__/`, runs Oxlint on them, and checks that
  each is rejected, that the allowed subset (`Math.sqrt`, `Math.floor`, `Math.imul`, integer
  math, relative imports) passes, and that the rules don't reach outside core. The probe
  folders are git-ignored and removed after the run. The test passes file paths to Oxlint,
  not folders, because Oxlint skips git-ignored folders when it walks a directory.

**Adding a rule:** add it to the override (or the plugin), then add a case to `rejected` in
the test. Check that the new case fails with the rule turned off.

## LevelData

`LevelData` is the output of the analysis pass: `analyze(openmpt, bytes, tempoPermille)` in
`packages/analysis/src/analyze.ts`. The types are in `packages/core/src/level-data/types.ts`,
and `serializeLevelData` and `deserializeLevelData` are in
`packages/core/src/level-data/serialize.ts`. `hashLevelData` in
`packages/analysis/src/hash.ts` is the SHA-256 of the serialized bytes.

### The analysis pass

The parameters are constants in `packages/core/src/analysis-constants.ts`, and every
LevelData records them in `params`.

- **Render:** 48 000 Hz, in reads of 160 frames. Before the first read: master gain 0 mB,
  stereo separation 100%, interpolation filter length 8, volume ramping strength 1, and
  repeat count 0. Rendering stops when a read returns 0 or at 15 minutes
  (`hitDurationCap`). Volume ramping is 1 rather than libopenmpt's -1 ("recommended
  default"), because what -1 means can change between releases. Every playback ctl is set
  explicitly too (`renderCtls(tempoPermille)` in `analyze.ts`): `play.at_end` is `stop`,
  because the default `fadeout` renders a fade after the song ends; Amiga resampler
  emulation is off (it made a 4-channel MOD take 15 times as long to render; Brad,
  2026-11-10); subsong 0 only. `play.tempo_factor` is the difficulty's tempo
  (`Difficulty[d].tempoPermille / 1000`: 0.9, 1 or 1.15), which libopenmpt applies without
  changing the pitch; `play.pitch_factor` stays 1. Each difficulty therefore has its own
  LevelData, which records the tempo in `params.tempoPermille`, and the audio worklet plays
  the song with the same ctls.
- **Rows:** after each read, if the current (order, row) differs from the last one, a row
  entry is recorded with the read's start sample as `timeSamples`. The row started somewhere
  in that read, so a timestamp is up to one read (160 samples, 3.33 ms) early. Two limits:
  a row shorter than one read can be missed (in the classic tempo mode a tick is
  2.5 / tempo seconds, so that needs speed 1 and a tempo above 750), and a row that plays
  twice in a row (a one-row pattern loop, E6x) is recorded once.
- **Note events:** for each recorded row, every channel whose pattern note is 1..120 gives
  one event with the raw libopenmpt cell values. `resolvedInstrument` is the cell's
  instrument, or the channel's last nonzero instrument on a played row if the cell has 0.
  Pattern breaks (Dxx), position jumps (Bxx), and loops need no special handling: only rows
  libopenmpt plays are recorded.
- **Analysis frames:** one every 800 samples (60 per second), taken after
  (f + 1) x 800 samples. Each channel's most recent 2048 samples (zeros before the song
  starts) are windowed with a periodic Hann window and transformed by one complex radix-2
  FFT, left as the real part and right as the imaginary part. 16 bands, log-spaced from
  40 Hz to 16 kHz, each take the mean power of their FFT bins. The LED level (0..12) is the
  number of the band's thresholds the power meets or exceeds. VU (volume unit) values are
  `floor(min(v, 1) * 255)`.

### Spectrum tables

Core can't call `Math.sin`, `Math.cos`, or `Math.pow` at runtime, so
`tools/gen-spectrum-tables.ts` computes the FFT twiddles, the Hann window, the band bin
ranges, and the LED thresholds and writes them as number literals to
`packages/core/src/spectrum/tables.generated.ts`. `Number.prototype.toString` gives the
shortest literal that reads back as the same double, so the committed values are exact.

- **Band bins:** band b covers the bins whose centre frequency is in
  [40 x 400^(b/16), 40 x 400^((b+1)/16)) Hz. A band that would be empty gets one bin, and
  each band starts where the previous one ends. The lowest band is bin 2 alone.
- **LED calibration:** the generator synthesizes a full-scale sine (amplitude 1, phase 0 at
  the first sample) at the band's geometric centre frequency, windows it, and takes the
  band's mean bin power with a direct DFT. That reference is 0 dB for the band. The
  thresholds are the reference times 10^(dB/10) for dB = -60, -55, ..., -5, so that sine
  reads 12 and each 5 dB quieter reads one level lower.

After changing a constant in `analysis-constants.ts` or the generator, run
`pnpm gen:tables` and commit the result. `packages/core/test/spectrum-tables.test.ts`
re-runs the generator and fails if the committed file differs. A Node release that changes
`Math.sin` or `Math.pow` results would also fail it; check the diff before regenerating.

### Binary format

Little-endian, no padding, fields in this order. `str` is a u32 byte length followed by
UTF-8 bytes (`packages/core/src/utf8.ts`, since core can't use `TextEncoder`). An array is
its elements back to back; its length comes from the count before it.

| Field | Encoding |
|---|---|
| Magic | the 4 bytes `PBLD` |
| `formatVersion` (2), `genVersion` | u32 each |
| `libopenmptVersion` | str |
| `params`: sampleRate, chunkFrames, hopFrames, fftSize, bandCount, bandLowHz, bandHighHz, ledLevels | u32 each |
| `params.ledBottomDb` | i32 |
| `params`: ledStepDb, vuScale, maxDurationSamples, tempoPermille | u32 each |
| `totalSamples` | u32 |
| `hitDurationCap` | u8, 0 or 1 |
| `meta`: title, artist, type, tracker | str each |
| `meta`: numChannels, numOrders, numPatterns, numInstruments, numSamples | u32 each |
| `meta.instrumentNames`, `meta.sampleNames` | u32 count, then str each |
| `orderPatterns` | u32 count, then u16 each |
| `rows` | u32 count R, then R x u32 timeSamples, then R x u16 each of order, pattern, row, speed, tempo |
| `notes` | u32 count N, then N x u32 timeSamples, then N x u8 each of channel, instrument, resolvedInstrument, note, volume, volumeEffect, effect, effectParam |
| `frames` | u32 frameCount F, then F x bandCount u8 spectrumLeft, the same for spectrumRight, then F x numChannels u8 vuLeft, the same for vuRight |

Spectrum and VU arrays are frame-major: band b of frame f is at `f * bandCount + b`.
`deserializeLevelData` throws on a wrong magic or version, on truncated data, and on
trailing bytes. A change to the layout bumps `LEVEL_DATA_FORMAT_VERSION`; a change to the
values bumps `GEN_VERSION`.

## Level and sim

`generateLevel(levelData, difficulty)` in `packages/core/src/levelgen/generate.ts` builds a
`Level` (`levelgen/types.ts`). `tick(level, state, input)` in `packages/core/src/sim/sim.ts`
advances a `SimState` by one 120 Hz tick. The design is in `PLAN.md`, "Level generation"
and "Simulation"; this section has the exact rules.

### Coordinates

- **Screen:** 384 x 216 px, origin top left, y down. Geometry constants are in
  `packages/core/src/playfield.ts`.
- **Fixed point:** sim positions and the scroll table are Q24.8: px * 256 (`Q8`).
- **World x:** bar i's left edge is at world x `i * 10` px. It is solid for 8 px
  (`[10i, 10i + 8)`); the other 2 px are open.
- **Segments:** ceiling segment k (from 0) is solid for y in `[7k, 7k + 6)`. Floor segment
  k is the mirror image: `[216 - 7k - 6, 216 - 7k)`. A side with level n has segments
  0 to n - 1 lit. Peak dots, a held peak one segment above the level, were removed in
  `GEN_VERSION` 9 (2026-11-11).
- **Scroll table:** `level.scroll[t]`, for t from 0 to `level.tickCount`, is the world x in
  Q8 of the screen's left edge at sim tick t (song sample `400 t`). It is
  `playheadAtSample(400 t) - 64 * 256`. The playhead's world x is
  `i * 2560 + floor(2560 * (s - start[i]) / (end[i] - start[i]))` for the row i playing at
  sample s (0 before the first row, `barCount * 2560` from the song's end on). So a bar's
  left edge is at screen x 64 (`PLAYHEAD_X`) when its row starts. To draw at tick t, a
  world x w goes to screen x `w - scroll[t] / 256`. Between ticks the renderer may
  interpolate the table; the sim only reads whole ticks.
- **Ship:** `state.shipX` and `state.shipY` are the sprite centre in screen coordinates,
  Q8. The hitbox is the half-open box `[x - 5, x + 5) x [y - 3, y + 3)` px. Its world x is
  `scroll[state.tick] + shipX`.

### Level generation

The settings are `Difficulty` and `Terrain` in `levelgen/types.ts`. Difficulty sets the
tempo the LevelData was analyzed at (`generateLevel` throws on a mismatch), the base gap
(118, 104, 90 px on easy, normal, hard) and the minimum gap (66, 58, 50 px). The secret
`impossible` (id 3) has hard's gaps and enemies at the song's own tempo. Before the
bars, `findDrums()` marks each instrument whose three commonest pitches make up at least
95% of its notes (`drumPitchPercent`). Then, for each bar in order, with the previous
bar's final values:

1. **Squeeze:** the row's hit is the sum over channels of how far the channel's meter (the
   louder of `vuLeft` and `vuRight`) rises from the frame before the row to its loudest
   frame in the row. VU frame f is read after `(f + 1) * 800` samples, so the row spanning
   `[start, end)` holds frames `floor(start / 800)` up to `floor(end / 800)`, at least one.
   The squeeze is `floor(hit / 64)` segments (`hitPerSegment`), or the previous bar's
   squeeze minus 6 (`releaseSegments`) if that is larger. The target gap is the base gap
   less 7 px per squeeze segment, never under the minimum.
2. **Melody:** the highest note started in the row by an instrument that is not a drum, or
   the melody so far (72 to begin with). Twice the target centre is
   `216 - 6 (melody - 72)`: 3 px higher per semitone above C-5 (`pxPerSemitone`,
   `pivotNote`).
3. **Centre:** twice the centre is held to the previous bar's plus or minus twice
   `gapShiftLimitPx(previous row length)`: the ship's straight travel in that time,
   `floor(384 * samples / (400 * 256))` px, but never more than the minimum gap minus
   10 px (`MIN_GAP_OVERLAP_PX`, the hitbox height plus 4). Bar 0 reaches the ship on the
   first tick, so it is measured from the ship's start height (108; twice that is 216)
   with a limit of 0. Then the gap is kept at least 2 segments (`minSideSegments`) from
   each edge.
4. **Segments:** the ceiling is `round((centre2 - gap) / 14)` and the floor
   `round((432 - centre2 - gap) / 14)`, halves rounding up, each at least 2. While the two
   exceed `floor((216 - minimum gap) / 7)` (`maxCombinedSegments`), the larger loses one,
   the ceiling on a tie.
5. **Gap movement, exactly:** rounding can move the centre past the limit, so if twice the
   centre `7 (c - f) + 216` moved down too far the ceiling loses segments until it fits or
   reaches 2; if up, the floor does. A side down to 2 leaves a gap that contains the
   previous one, since every bar has at least 2.
6. **Three in a row:** the hitbox (10 px) is as wide as a bar's pitch, so it touches two
   bars nearly all the time and passes from bars `(i - 2, i - 1)` to `(i - 1, i)` in a
   fifth of a row. Gaps `i - 2`, `i - 1` and `i` must share 10 px; while they don't, bar
   i's side that blocks it loses a segment, down to 2. A bar with 2 on both sides contains
   the two previous gaps, which already share 10 px.
Until `GEN_VERSION` 9 three more steps kept a peak per side, held for 6 bars, for the peak
dots; no difficulty drew them after 2026-11-08, and they were removed on 2026-11-11. The
level format dropped them in version 5.

`findPathViolation(level)` in `levelgen/path-check.ts` checks the guarantee on the walls
from `solidWalls(level)`: each side's level plus turrets and tank tracks (next section). Every bar's gap is at least the difficulty's
minimum, bar 0's gap is centred on the ship's start height, every later centre move is
within the limit unless the new gap contains the old one, and every three consecutive gaps
share 10 px. `barPathViolation()` checks one bar against the two before it; enemy placement
uses it too. The shared rules (`MIN_GAP_OVERLAP_PX`, `gapShiftLimitPx`, the tank helpers)
are in `levelgen/rules.ts`. Tests run the check on random loud songs at every difficulty,
on each fixture, and on every bundled song.

### Enemies

`placeEnemies()` in `levelgen/enemies.ts` runs at the end of `generateLevel` and fills
`level.enemies`, an `EnemyList` of parallel typed arrays in spawn order: kind (turret 0,
tank 1, ship 2), instrument, spawn tick, world x of the centre at spawn (Q8), y, side,
motion, and the ticks each enemy fires at (`fireStart`, `fireTick`). The sim moves enemies
by formula, so nothing in the list depends on how the player flies.

- **Roles:** drums are `findDrums()`'s. The bass is the non-drum instrument with the lowest
  middle note (the lowest pitch at or below which half its notes fall), when there are at
  least two non-drum instruments. Every other instrument makes ships.
- **Walk:** notes in time order, skipping the first 240 ticks (`ENEMY_GRACE_TICKS`) and any
  past the last tick. Each kind keeps its own spacing from `EnemyTuning`.
- **Turret:** on the bar the drum note plays on, centred on the bar's lit part, filling the
  segment slot past the wall's tip (y is the slot's middle). The side alternates, floor
  first; if the preferred side breaks the path, the other is tried. It spawns on the first
  tick its centre is at screen x 392 or less.
- **Tank:** spawns on the bass note's tick at screen x 392 and drives left 64 Q8 per tick
  on top of the scroll. `tankExitTick()` finds when it leaves (centre left of x -16), and
  `tankBars()` the bars its 12 px hitbox can cover. On each, the floor counts as
  `floorUnderTank()`: the highest floor of that bar and its two neighbours, plus one. No
  turret or other tank may share those floor bars.
- **Path:** a turret or tank is kept only if `barPathViolation()` passes for every bar it
  touches and the two after, with it counted as wall; otherwise it is dropped.
- **Ships:** a note starts a formation if `formationSpacingTicks` have passed since the last
  one; the same instrument's next notes at least 12 ticks apart, within 120 ticks of the
  first, add ships up to `formationSize`. A ship's y is its offset from the cave's centre
  line: `(middle - note) * 2` px, clamped to 24. Its motion comes from libopenmpt's effect
  number on the note (`soundlib/modcommand.h`): 5, 7 and 26 (vibrato) weave, 2 (slide up)
  climbs, 3 (slide down) dives, 1 (arpeggio) with a nonzero parameter hops.
- **Fire ticks:** the instrument's note ticks from the enemy's spawn (ships: 30 ticks after),
  taken while its screen x at that tick is within 104 to 376 and at least
  `fireIntervalTicks` after the last one taken. Ships take at most `shipShots`.

| `EnemyTuning` | Easy | Normal | Hard |
|---|---|---|---|
| Turret spacing (ticks) | 360 | 240 | 168 |
| Tank spacing | 720 | 480 | 336 |
| Formation spacing | 360 | 240 | 168 |
| Ships per formation | 2 | 3 | 4 |
| Least ticks between one enemy's shots | 120 | 72 | 48 |
| Bullet speed (Q8 per tick) | 224 | 288 | 352 |
| Bullets in flight | 4 | 8 | 12 |
| Shots per ship | 0 | 1 | 2 |
| Ship speed (Q8 per tick) | 224 | 288 | 352 |

On the nine songs (2026-11-09), normal gives 27 to 97 turrets, 1 to 21 tanks, and 77 to
313 ships a level, and 2.0 to 3.1 scheduled enemy shots a second; hard gives 5.1 to 7.7.
Every level passes the path check with its enemies.

For the on-beat bonus the level also keeps every note's tick by instrument
(`instrumentNotes()`): instrument i's ticks, in order, are `noteTick[noteStart[i]]` up to
`noteTick[noteStart[i + 1]]`. `serializeLevel` writes them after the enemies (Level format
3). Hand-made levels in tests use `noNotes()`.

Each ship has a formation id (`enemies.formation`, -1 for turrets and tanks), numbered in
the order formations start, and `enemies.formationSize` counts each one's ships, for the
power-up capsules. Level format 4 appends them: count x i32 formation, then a u32
formation count and that many u8 sizes.

### Simulation

- **Ticks:** `level.tickCount` is `ceil(totalSamples / 400)`. `state.tick` counts the ticks
  run, so the state shows song sample `400 * state.tick`. `tick()` does nothing once
  `state.dead` or `state.finished` is set. Otherwise, in order: move and clamp the ship,
  increment `state.tick`, and place the drones; spawn enemies whose tick has come and move
  every live one; nuke, fire and move shots and test them against enemies; the bomb;
  missiles; fire enemies' scheduled shots and move bullets; move capsules and pick up any
  the ship touches; give any extra lives the score has earned; then test the ship against
  the terrain unless it is flying in or bouncing, and against live enemies and bullets
  unless it is in its safe time.
- **Input bits** (`InputBit`, a u16 per tick, so input logs are `Uint16Array`s): up 1, down
  2, left 4, right 8, fire 16, bomb 32, nuke 128, boost 256, missile 512; 64 was buy until
  `SIM_VERSION` 11. Opposite directions cancel. `state.prevInput` keeps the last tick's
  bits, so a bomb, missile or nuke goes off once per press.
- **Ship:** 384 Q8 (1.5 px) per tick straight. Diagonals move 272 Q8 on each axis
  (384 / sqrt 2, rounded), about 1.503 px per tick in total. The centre stays within
  x 16 to 160 and y 3 to 213, so the hitbox never leaves the screen. It starts at (64, 108).
- **Collision:** `boxHitsTerrain()` tests a box against the solid part of every bar it
  overlaps horizontally: its lit segments. It takes the walls to test against, the
  level's by default; the sim passes the run's (`state.ceiling`, `state.floor`), which
  blasts lower. Boxes against
  each other are half-open overlaps of centre and half size. Integer comparisons only.
- **Shots:** holding fire shoots a volley every 8 ticks from the ship's nose, and from
  each drone, 1024 Q8 (4 px) per tick to the right. Each source has at most 6 straight
  shots in flight (`MAX_SHOTS`; 3 for one build on 2026-11-09, until Brad settled that the
  gun sprays freely and only the bomb and missile reload), and 6 angled ones with double,
  in a pool of `SHOT_SLOTS` (36). A shot passes through the walls and stops on the first
  live enemy it overlaps (6x2 px against the enemy's hitbox).
- **Enemies:** turrets (8x6 px) stay at their world x; tanks (12x7) move left 64 Q8 per tick
  in world terms and sit on the floor of the bar under their centre; ships (10x8) cross the
  screen at the difficulty's ship speed, steering at up to 256 Q8 per tick towards the
  cave's centre line plus their offset and motion. Weave is 12 px over 96 ticks, each half a
  parabola `4q(h - q) / h^2`; climb and dive drift 128 Q8 per tick up to 48 px; hop steps
  0, -10, +10 px every 16 ticks. Turrets and ships take 1 hit, tanks 3 (`ENEMY_HP`). An
  enemy whose centre passes screen x -16 is gone. `state.enemyStatus` holds waiting, alive,
  destroyed or gone, and `state.enemyEndTick` when it ended.
- **Enemy bullets:** 16 slots, at most `maxBullets` in flight. A bullet starts at the
  enemy's centre with velocity `trunc(d * speed / |d|)` towards the ship's centre, `|d|`
  from `Math.sqrt`; it moves in screen terms and stops on the walls or off screen.
- **Score:** a shot-down ship is 100 points, a turret 200, a tank 300 (`KILL_POINTS`), doubled
  on the beat: within 3 ticks (25 ms, `ON_BEAT_TICKS`) of a note of the enemy's own
  instrument, found by `onBeat()`'s binary search of the level's note table. At 6 ticks an
  autopilot that ignores the beat got about 85% of its kills on it, since busy instruments
  play every row; at 3 it gets 10 to 65% (2026-11-09). Then times the streak multiplier,
  `scoreMultiplier(streak)`: 1, plus 1 for every 10 kills since the last life lost, at most 4.
  Ramming scores nothing. Reaching the end adds 1000 a life
  left (`state.survivalBonus`). `state.enemyPoints` and `state.enemyOnBeat` keep what each
  kill scored, for the popups.
- **Bomb:** a new press of the bomb bit (`input & ~prevInput`) drops one 2 px below the
  ship's hitbox, if none is in the air and `state.bombReadyTick` has come: 120 ticks
  (`BOMB_RELOAD_TICKS`) after the last burst. Each tick it moves right 256 Q8 and its fall speed grows by 8 Q8, to at
  most 768 Q8. It bursts when it touches the terrain, a live enemy, or the right or bottom
  edge: every live enemy whose hitbox overlaps the 48x48 px square around the burst is
  destroyed and scored as a shot kill (on-beat double included). Dropped from the start
  position with no walls it reaches the bottom edge 80 moves later, at x 144.
  `state.blastTick`, `blastX` and `blastY` record the last burst for the client.
- **Capsules and the meter:** each ship knows its formation. Killing one by any weapon adds
  to `state.formationShot`; a ship that leaves the screen or is rammed sets
  `state.formationSpoiled`. When the last ship of an unspoiled formation is killed, a
  capsule (8x8 px) appears where it was, if one of the 4 slots is free. A capsule keeps its
  world x (`state.capsuleWX`), so it scrolls with the cave, and falls with the bomb's
  gravity (8 Q8 per tick faster each tick, to 768) until it rests on the highest floor of
  the bars under it, which it then rides; it goes at the left edge. So collecting one
  means flying low (Brad, 2026-11-09; until then capsules drifted along the cave's centre
  line, and the autopilot collected 17 to 60 a level on normal). One the ship's hitbox
  overlaps unlocks `nextUnlock(state)`: the first power-up after `state.meter` (the last
  one unlocked, -1 for none) in the order double 0, missile 1, shield 2, drone 3, laser 4,
  boost 5 (`PowerUp`), wrapping round, that `canUnlock()` says isn't at its most; with all
  at their most it does nothing (Brad, 2026-11-10: until `SIM_VERSION` 11 a capsule moved
  a highlight along the meter and a buy button bought it, which was impossible to do in
  flight). Losing a life loses every power-up and sets the meter to -1
  (`loseUpgrades()`); the nukes stay.
- **Boost:** each unlock raises `state.boostLevel` (to 3) and fills `state.boostFuel` to 120
  ticks a level. Holding boost with fuel moves the ship 640 Q8 per tick (453 on each axis
  diagonally) and burns a tick of fuel; otherwise fuel refills a tick's worth on every
  third tick. `state.boosting` tells the client to lengthen the flame.
- **Double and laser,** which stack (until `SIM_VERSION` 11 each replaced the other, which
  unlocks in a cycle would swap back and forth): double adds a shot from the top of the
  ship's nose angled 45 degrees up, 724 Q8 per tick on each axis. Laser replaces the
  straight shot with a 16x2 px beam at 1536 Q8 (6 px) per tick that passes through
  enemies, taking a hit off each it overlaps every tick, so a tank in its path takes 3.
- **Missile:** a new press of the missile bit, once unlocked, launches one from the ship's
  nose and one from each drone, if the ship's (slot 0) is not in flight and
  `state.missileReadyTick` has come. A missile (8x4 px) flies right 768 Q8 per tick and
  bursts on the first live enemy it overlaps, or on a wall (since `SIM_VERSION` 13),
  destroying every live enemy whose hitbox overlaps the 40x40 px square around it, scored
  as shot kills. The
  ship's missile bursting or leaving the right edge starts the 120-tick reload
  (`MISSILE_RELOAD_TICKS`). `state.missileBlastTick`, `missileBlastX` and `missileBlastY`
  record each slot's last burst for the client.
- **Drones:** `state.trailX` and `trailY` keep the ship's last 64 positions; drone k sits
  where the ship was 16 x (k + 1) ticks ago (`droneX`, `droneY`). Drones can't be hit
  and pass through walls. A life lost refills the trail with the new position, so drones
  unlocked later start on the ship.
- **Shield** (Brad, 2026-11-10; until `SIM_VERSION` 12 it was a power-up of 3 hits, and the
  walls always cost a life): `state.shield` is 6 points (`SHIELD_MAX`) at the start of the
  run and of every life, and the shield power-up fills it again, so capsules skip it while
  it is full. A hit costs `SHIELD_BULLET_COST` by the kind that fired the bullet
  (`state.bulletKind`, set from `level.enemies.kind` in `fireAtShip`): a ship's 2, a tank's
  3, a turret's 6; ramming an enemy 3 (`SHIELD_RAM_COST`, which Brad didn't set); a wall 3
  (`SHIELD_WALL_COST`). While any points are left the shield takes the hit, even one that
  costs more than is left: the life and the streak are kept, and a rammed enemy is still
  destroyed, scoring nothing. `state.shieldHitTick` records the hit for the flicker and
  the thud. With no points left, any hit costs a life.
- **Wall bounce:** a wall the shield takes sets `state.bounceUntil` 20 ticks on
  (`BOUNCE_TICKS`) and `state.bounceDir` towards the middle of the gap under the ship
  (-1 up, 1 down). Until then the ship moves 2 px a tick that way (`BOUNCE_SPEED_Q8`),
  stopping at the middle, whatever the vertical input; the horizontal input still works,
  and the walls don't count. A life lost ends a bounce.
- **Breaking terrain** (`SIM_VERSION` 14, Brad, 2026-11-11): the run's walls are
  `state.ceiling` and `state.floor`, a copy of the level's set up with the enemies on the
  first tick and after a reset. `breakTerrain()` runs after a bomb's or missile's blast has
  hit the enemies. For each bar whose lit part the blast's square overlaps, on each side,
  it finds the first and last segment the square overlaps; if the last is at or beyond
  `TERRAIN_KEEP_SEGMENTS` (2), the side drops to the first, or to 2. On the ceiling, the
  segments past the last one hit fall as a block (`dropBlock`); on the floor they crumble.
  Alive turrets on that bar and side score as kills (`wallLost`). `state.terrainBreaks`
  counts the blasts that broke anything.
  - **Blocks:** 24 slots (`BLOCK_SLOTS`; a blast spans at most 5 bars, and up to four
    blasts can come close together). Each keeps its bar, its first segment and count (for
    the colours), the y of its top and its fall speed, Q8. They move first in step 3,
    under `BOMB_GRAVITY_Q8` up to `BOMB_MAX_VY_Q8` (450 px/s/s, up to 360 px/s: a full
    216 px drop takes 1 s), as the bar's lit 8 px and the block's height. A block destroys
    every live enemy it overlaps (`scoreKill`), shatters when its bottom reaches the top of
    its bar's floor (216 - 7f + 1 px) or once off the left edge, and, outside the ship's
    safe time, shatters on the ship for `SHIELD_WALL_COST` with no bounce. With no slot
    free, the part beyond the cut crumbles. `state.blockEndTick` records when each slot's
    last block shattered, for the rubble and the sound.
  - **Enemies:** a spawning turret whose bar and side are below the level's is gone at
    once; a tank over a bar whose floor is below the level's scores as a kill. Tanks ride,
    capsules rest on, ships follow the middle of, and the bounce and the fly-in use the
    run's walls.
  - Breaking only lowers walls, so `findPathViolation()` still holds for every run.
    `serializeSimState()` adds `terrainBreaks` and both walls to the golden hashes.
- **Nuke:** a new press (`input & ~prevInput`) with `state.nukes` above 0 destroys every
  live enemy whose centre is on screen (x 0 to 384) and clears the bullets, before shots
  move that tick. Its kills score base points times the multiplier, never on the beat.
  Each kill on the beat adds to `state.nukeCharge`; at 10 it becomes a nuke, while fewer
  than 3 are held (`NUKE_CHARGE_KILLS`, `MAX_NUKES`). Nukes stay when a life is lost.
- **Extra lives:** each time the score reaches `state.nextExtraLife` (a multiple of 20 000,
  `EXTRA_LIFE_POINTS`) the ship gains a life, up to 9 (`MAX_LIVES`; one past the cap is
  lost), and `state.extraLifeTick` records it. The check runs after the tick's scoring, before
  the ship's hit test, so a kill that earns a life saves a ship hit on the same tick.
- **Lives:** 3 (`START_LIVES`). A hit with the shield empty costs one, every power-up, and the streak:
  `state.hitTick` records it. Ramming an enemy destroys it (and counts in `state.kills`).
  With lives left every bullet is cleared and the ship flies in: for 60 ticks
  (`RESPAWN_FLY_TICKS`, until `state.flyInUntil`) it moves in a straight line from x -16 to
  x 64 on the middle of the cave's gap under it, ignoring the input and the walls. Enemies
  and bullets can't hit it until `state.safeUntil`, 240 ticks after the hit. Until
  `SIM_VERSION` 11 it appeared at x 64 at once and ignored the walls for all 240 ticks, so
  it could drift into one and die the moment its safe time ended (Brad, 2026-11-10). The
  last life sets `state.dead` and `state.deathTick`.
- **Cheats** (`Cheat`, `state.cheats`, set by `createSimState(cheats)` and kept by
  `resetSimState`): `infiniteLives` (1) means a hit costs no life; `god` (2) gives every
  power-up at their most from the start and after each life lost, and the shield never
  loses a point, so the walls bounce the ship every time. A replay records them (see
  "Replays").
- **Running a log:** `runInputLog(level, inputs, state?)` runs from the state's current
  tick until the log ends, the last life is lost, or the song ends. `resetSimState` reuses
  a state: it clears `state.enemiesReady`, and the next `tick()` sets the per-enemy arrays
  up from the level (`setUpEnemies()`), each enemy's next shot at its first fire tick. It
  allocates only when the level's enemy or formation count differs from the last. Until
  `SIM_VERSION` 10 a reset zeroed the fire indexes instead, so a retry on the same level
  fired the wrong shots: the first replay played back in the game showed it (1900 points
  against 34 800), and `sim.test.ts` now checks that a reset state plays like a fresh one.
- **Autopilot:** `autopilotInputs(level)` in `sim/autopilot.ts` flies a level as a person
  would (Brad, 2026-11-11). It finds the middle of the cave by looking 24 ticks ahead
  through the walls from `solidWalls()`, so it steers clear of turrets and tank tracks.
  - **Aim:** it lines up on an enemy up to 200 px ahead that a shot fired now would reach
    without meeting a wall (checked every 8 px along the shot's path, at the tick the shot
    gets there): ships first, since they fly at it, then turrets, whose shell costs the
    whole shield, then tanks; the nearest of a kind first. A turret or tank on a wall is
    lined up from the nearest clear height that still hits it. It keeps fire held down.
  - **Weapons:** it presses bomb when it can drop one and a tank or floor turret is 60 to
    140 px ahead, and launches a missile at any enemy up to 240 px ahead and within 12 px
    of its height. It doesn't aim at walls to break them: on the title song's level and
    two others, normal and hard, walls broke 81 to 194 times a level, mostly floors under
    bombs, and 0 to 4 blocks fell (2026-11-11).
  - **Broken walls and blocks:** its copy of the walls (from `solidWalls()`) takes the
    run's broken walls whenever `state.terrainBreaks` changes. Falling blocks are worked
    out ahead with the sim's gravity until they reach the floor (`predictBlocks`) and
    checked in each plan like bullets, costing a wall's points; a block can't be nuked
    away.
  - **Capsules:** it steers for the nearest capsule up to 160 px ahead, held inside the
    clear range, while no enemy bullet is within 64 px (near the floor, where capsules rest,
    it has little room to dodge: chasing every capsule cost the title song's demo all three
    lives in 23 s).
  - **Dodging:** each tick it weighs plans: a direction (up, down or neither, and left,
    right or neither) held for 1, 4, 8, 16 or 32 ticks, then holding still. Each is checked
    32 ticks ahead against bullets (which fly straight), ships (taken to keep their height)
    and walls. It tries the plans nearest its aim first, and across, towards its home x
    (64 px, where it starts) before holding x, and stops at the first plan that meets
    nothing. With every plan hit, it takes the latest hit, then the cheapest in shield
    points. It nukes when even that plan is hit within 2 ticks by something other than a
    wall. So it brakes and backs up as well as climbing and diving, then drifts home.
  - **Before 2026-11-11** it never moved across and never aimed: it held the cave's middle
    and took the latest hit, wall or not. Once shots stopped on walls (`SIM_VERSION` 13) it
    got 56.4% of the way through October_Chip's Hard level and failed the guardrails. Across the
    16 bundled and 5 test songs on easy, normal and hard it now loses 10 lives and finishes
    every level (`pnpm check:difficulty`). Earlier the same day it looked 16 ticks ahead at
    bullets and ships alone, and dodged into a floor that rose beyond them.
  - **Speed:** it flies the title song's level on normal in about 0.5 s on the Unraid
    server, 0.4 to 0.8 s for the bundled levels on normal and hard (the old bot took 0.4 to
    0.6 s); the demo computes it on the main thread. Plans that hold x share one table of
    the walls ahead, and the bullets and ships are listed once a tick.
  - On the terrain alone (`withoutEnemies(level)`) it always reaches the end; tests use
    that to show the path exists.
- **Speed:** `pnpm --filter @game/analysis bench:sim` on the fixture ran 12.5 to 13.7
  million ticks per second in Node 26 in the cloud development container (checked
  2026-11-08, before enemies). With enemies and power-ups it runs 0.5 to 0.6 million, 4000
  to 4800 times real time (Node 26.13 on a Xeon E5-2640 from 2012, 2026-11-09).
  `bench:sim:max` plays The_Epic_Chip on hard, the densest level (604 enemies), with a ship
  that can't be hit, double, two drones and the missile, fire held and bomb and missile
  pressed every other tick. At most 11 enemies, 36 of 36 shots, 12 of 16 bullets, 3 of 3
  missiles and 2 of 4 capsules were on screen at once; its busiest 10 000 ticks took 55 ms,
  5.5 us a tick. A server-side check of a replay of the whole 198 s song costs 4.1 s of
  analysis, 46 ms of level generation and 105 ms of sim on the same machine: analysis is
  what to cache by module hash (2026-11-09).

### Replays

`sim/replay.ts` holds a run as a `Replay`: the song file's SHA-256, the difficulty, the
cheats the run had, `GEN_VERSION`, `SIM_VERSION`, the score it ended with, and the input
bits of every tick. A replay with any cheat is for watching only: the M5 boards refuse it.
`encodeReplay` writes it little-endian: magic `PBRP`, u32 format version (2), u32
genVersion, u32 simVersion, 32 bytes of hash, u8 difficulty id, u8 cheats (the `Cheat`
flags; added in format 2, 2026-11-10), i32 score, u32 tick count,
u32 run count, then each run of equal bits as u16 bits and its length as an unsigned
LEB128 varint. `decodeReplay` throws on a wrong magic or format, an unknown difficulty or
cheat flag,
truncation, run lengths that don't add up to the tick count, and trailing bytes. The level
isn't stored: it is rebuilt from the song, which is why the hash is there. The level-1 run
in the fixture is 12 903 ticks in 3 087 bytes.

In the game (`game.ts`), each run that ends in game over or level complete keeps its
replay, for a bundled song (its hash comes from `music/manifest.json`). On those screens R
(or Y on a pad) watches it and S saves it as
`pattern-break-<song>-<difficulty>-<score>.pbreplay`. A replay plays in the `replay` mode:
the song from the start at the replay's tempo, the sim fed the replay's inputs against the
song clock as in play, and "Replay" over it. Any key stops it. At the end it shows the
score and "Score matches", the recorded score when they differ, or "Stopped", then returns
to the screen it came from. Back on game over, the run is replayed to its end and its last
two frames drawn, as play drew them, so a replay stopped early doesn't leave its frame
behind; the explosion, flash and shake don't play again, and the results show at once
(Brad, 2026-11-11). A `.pbreplay` file dropped on the title screen plays the same
way if its hash names a bundled song; one from other versions of the level or sim says
which.

## Versions to bump

`packages/core/src/version.ts`:

- **`GEN_VERSION`**: bump when level generation output changes for any input.
- **`SIM_VERSION`**: bump when simulation output changes for any input.

Leaderboards are keyed on both, so a bump of either starts fresh boards: the server lists
only runs from its own versions and turns down runs from others (see "Leaderboard server").
Update the golden snapshots and re-record the replay fixture (`pnpm record:replay`) in the
same commit as the bump.

## Tests

Vitest runs per package. Packages with no tests yet run with `--passWithNoTests`; drop the
flag when a package gets its first test.

**Golden hashes.** `packages/analysis/fixtures/golden.json` pins the SHA-256 of the
serialized LevelData for each fixture at each difficulty's tempo, with the `GEN_VERSION`
and libopenmpt version it was made with. `test/golden.test.ts` analyzes each fixture and compares. Change a hash only in
the same commit as a `GEN_VERSION` bump.
`packages/analysis/fixtures/golden-levelgen.json` pins, for each fixture and difficulty,
the SHA-256 of `serializeLevel(level)` and of `serializeSimState` after two scripted runs:
the autopilot with the enemies, which pins their placement, movement, aim and collisions,
and a fixed zigzag log (which loses its lives, the last at the recorded
`zigzagDeathTick`). The test also checks that the autopilot reaches the end of the terrain
alone. The same test checks them in Node and in the browsers. A Level hash
changes only with a `GEN_VERSION` bump, a sim hash only with a `SIM_VERSION` bump. A
change to the autopilot changes the autopilot hash with no version bump, since replays and
the boards don't depend on it; update that hash in the same commit.

**Recorded replay.** `packages/analysis/fixtures/replay-neon_techno-normal.pbreplay` is a
run of level 1 (Neon Techno on normal) recorded by the game in Chromium.
`test/replay.test.ts` checks that it names this `GEN_VERSION` and `SIM_VERSION` and the song
file's SHA-256, builds the level from `music/neon_techno.mod`, runs the inputs, and gets the
recorded score (100 900) on the recorded last tick, in Node and in every browser.

**Bundled songs.** `packages/analysis/test/music.test.ts` analyzes every song in
`music/manifest.json`, builds its level on each difficulty, and checks that it has enemies,
that the path check passes with them, and that the autopilot reaches the end of the
terrain alone. It runs in Node only and takes about a minute and a half
for the bundled songs on four difficulties, so a levelgen change that makes a real song unplayable fails `pnpm test`.

**Difficulty guardrails.** `pnpm check:difficulty` (`tools/difficulty-report.ts`) builds
each bundled and test song's level on easy, normal and hard (and Crush on impossible),
flies it with the autopilot and the enemies, and prints per level: enemies a minute, and
ships, turrets and tanks; enemy bullets on screen, the 95th percentile and the most; the
narrowest gap and the 5th percentile gap, with turrets and tank tracks as wall; how far
the autopilot got and the lives it lost. It fails unless the guardrails in `docs/PLAN.md`,
"Difficulty guardrails", hold. `--json <file>` saves the rows, and song files named on the
command line are measured in place of the bundled and test songs. It takes a few
minutes, too long for `pnpm test`, so CI runs it as its own job. The test songs are in
`packages/analysis/fixtures/test-songs` (licenses in that folder's README).

**Sound effects.** `packages/chipfx/test/chipfx.test.ts` checks the generator (lengths,
levels, determinism, pitch, slides, jumps, the cutoff, punch, filtering, mixing, and the
NES noise register's periods). In the client, `test/effects.test.ts` renders every effect
and checks it doesn't clip, `test/cues.test.ts` runs the autopilot and checks the cues
(one bomb cue per burst, the same events at any number of ticks per frame, none after a
retry), and `test/song-notes.test.ts` and `test/settings.test.ts` cover the rest.
`test/hangar.test.ts` checks the hangar intro's sound list, its hold over Play, and the
colour flood's steps.

**Browsers.** The analysis package's `vitest.config.ts` has two projects. `node` runs every
test in Node and is what `pnpm test` runs. `browser` runs the golden and replay tests in real browsers
through Vitest browser mode and Playwright, and is what `pnpm test:browser` runs. Every
engine has to produce the committed hash, which is how we know Node and the browsers build
identical levels.

The client's `vitest.config.ts` has the same two projects. Its `browser` project runs
`test/browser/audio.test.ts`, the worklet and clock tests in "Audio and clock";
`test/browser/mixer.test.ts`, which renders effects through the mixer offline and checks
the pan, the echo and reverb tail, silence at volume 0, and the voice limit; and
`test/browser/render.test.ts`, which draws a hand-made level with WebGL and checks canvas
pixels against the terrain rules and the palette; and `test/browser/library.test.ts`, the
song library and level cache against each engine's IndexedDB (see "Library"). Each engine
is launched with audio allowed to start without a click: Chromium with
`--autoplay-policy=no-user-gesture-required`, Firefox with the `media.autoplay.default` and
`media.autoplay.block-webaudio` preferences, WebKit with Playwright's defaults.

A live `AudioContext` needs somewhere to play. Without a sound server, Firefox's never
leaves "suspended" (`resume()` never resolves), so its clock tests time out. CI starts
PulseAudio playing into a null sink on its own socket, `/tmp/pb-pulse.sock`, and
`PB_FIREFOX_PULSE_SERVER` passes it to Firefox alone (as `PULSE_SERVER`, through
Playwright's launch `env`), since Chromium and WebKit play in CI without one. Locally, run
PulseAudio the same way (no root needed: `pulseaudio -n -L "module-native-protocol-unix
socket=..." -L module-null-sink`; keep the socket path under 108 bytes) and set
`PB_FIREFOX_PULSE_SERVER=unix:<socket>`. On the development server WebKit's live context
never starts at all, so its clock tests only pass in CI. Until 2026-11-10 the browsers job
failed on every push from 2026-11-08 on. Two engine quirks the audio tests allow for, both
found then:

- Offline rendering doesn't wait for messages in flight. With the main thread busy before
  it, WebKit rendered all 50 s of the worklet test's context before the worklet saw
  'start', so the test suspends the context after each quantum until the song starts
  (`holdUntil`). Firefox 159 has no `OfflineAudioContext.suspend`, and doesn't need it.
- Firefox's `currentTime` on the main thread can trail the worklet's last position message
  by about one audio callback (512 frames in CI, 256 locally), where Chromium and WebKit
  are at or past it.
- In CI, WebKit puts its first live context in a page in the "interrupted" state at once
  (an `AudioContextState` WebKit implements; the context leaves it only when the
  interruption ends), and `start()` waited more than 120 s. The worklet itself loaded in
  0.2 s. In three earlier runs a later player started after the first had timed out, but
  in the run of 2026-11-10 that opened three players 5 s apart, the first stayed
  interrupted and the other two suspended; no cause has been found. The clock tests'
  `beforeAll` opens players (5 s each, up to three) until one runs, keeps the stuck ones
  open until `afterAll`, and logs each; if none runs, the clock tests skip and log why. So
  in CI, WebKit's clock tests usually skip, and only Chromium and Firefox check the live
  clock. Locally, where WebKit's GStreamer has no output, they always skip.

- `PB_BROWSERS` picks the engines: `chromium` by default; CI sets
  `chromium,firefox,webkit`.
- `PB_CHROMIUM` points at a Chromium binary when Playwright can't download its own. In
  the cloud development container, Playwright's download hosts are blocked, so run
  `PB_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome pnpm test:browser`.
  Firefox and WebKit run only in CI there.

## libopenmpt build

The analysis package plays modules with our own WebAssembly build of libopenmpt, committed in
`packages/analysis/vendor/libopenmpt/`: `libopenmpt.wasm`, the Emscripten loader
`libopenmpt.js`, a hand-written `libopenmpt.d.ts`, libopenmpt's `LICENSE`, and `BUILD.md`,
which records the versions, every compiler and linker flag, the exported functions, and the
SHA-256 of the wasm. `packages/analysis/src/openmpt.ts` wraps it (`loadOpenMpt()`), and
`src/effects.ts` names libopenmpt's effect numbers.

**Pinned** (checked 2026-11-08): libopenmpt 0.8.10 (tag `libopenmpt-0.8.10`) and emsdk
6.0.13. The exact commits are at the top of `tools/build-libopenmpt.sh`.

**Rebuild:**

```sh
tools/build-libopenmpt.sh /path/outside/the/repo
```

The script clones both repositories at their pinned commits, installs emsdk, applies the
patches in `tools/libopenmpt/`, compiles, and rewrites the vendored files and `BUILD.md`. It
needs git, python3, `patch`, and network access to github.com and storage.googleapis.com.
The work dir takes about 1.5 GB. A rebuild from the same inputs gives the same wasm bytes;
check the SHA-256 in `BUILD.md` after a rebuild. A rebuild that changes the wasm changes how
songs mix, so it goes with a `GEN_VERSION` bump.

**What the build leaves out or changes:**

- No zlib, mpg123, ogg, or vorbis, and none of the bundled decoders that replace them
  (miniz, minimp3, stb_vorbis). Tracker formats don't need them.
- No `-ffast-math`, no SIMD (so no relaxed SIMD), no threads, `FILESYSTEM=0`, memory growth
  on.
- `tools/libopenmpt/deterministic-prng.patch` seeds each module's playback PRNG (pseudorandom
  number generator) with a fixed value. Upstream seeds it from the clock, so IT modules with
  random volume swing or a random vibrato waveform render differently on every load.

**Loading:** the wasm is a separate file. Node and Vite (dev and build) find it next to the
loader. An AudioWorklet can't fetch, so the main thread fetches the same file and passes the
bytes to `loadOpenMpt({ wasmBinary })` inside the worklet. Vite warns that `node:module` was
externalized; the loader imports it only under Node.

**Render the same way everywhere.** With volume ramping on, the output depends on the frame
counts passed to `readFloatStereo` (by under 1e-6), so the analysis pass uses one fixed chunk
size in every environment.

## Screenshots

Every figure in the README and docs is generated, never hand-made or hand-edited. One command
regenerates all of them from a manifest, so they stay current with the latest release.

```sh
pnpm screenshots                      # build the client, capture every shot
pnpm screenshots --only gameplay,title-screen
pnpm screenshots --list               # print the manifest
pnpm screenshots --no-build           # reuse packages/client/dist
```

The script builds the client, serves `packages/client/dist` on a free local port, opens each
shot in headless Chromium at a device scale factor of 1, waits for `window.__pbCaptureReady`
(15 s, then it fails and names the shot), and writes `docs/img/<id>.png`, or
`docs/img/<id>.gif` for a clip (see "Clips"). It also writes `docs/img/figures.json`, which
maps each id to its path, alt text, caption, and where it is used. Set `PB_CHROMIUM` to a
Chromium binary when Playwright's own download is not available (the same variable the
browser tests use).

**Output is byte-stable.** Two runs on the same machine give identical PNG and GIF bytes.
Chromium is started with fixed font hinting, no LCD text, an sRGB profile, and WebGL on
SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`), Chromium's CPU renderer,
so a GPU never changes the pixels. The game draws text with its own pixel font, so installed
fonts don't either. The script writes a file only when its bytes differ, so an unchanged
screen never shows up as a modified file. A different Chromium build can still change pixels,
which is why CI regenerates the figures rather than people.

### The manifest

`tools/screenshots/shots.ts` is a typed list. Each shot has:

| Field | Meaning |
|---|---|
| `id` | File name stem, lowercase letters, digits, and hyphens. The image is `docs/img/<id>.png`, or `docs/img/<id>.gif` for a clip. |
| `query` | The capture-mode parameters below. The script adds `capture=1`, and `t` for a clip. |
| `clip` | Optional `{ from, to, fps }`: makes the shot an animated GIF (see "Clips"). |
| `viewport` | Optional. Default 1152x648 for a still and 768x432 for a clip: exact multiples (3x, 2x) of the 384x216 internal resolution, so pixels stay square. |
| `element` | Optional CSS selector to crop to. Default is the whole viewport. |
| `alt` | Alt text. Describe what is on screen (the scene, the shapes, the colors, any text), not what the figure is for. |
| `caption` | One plain sentence for the README or docs. |
| `usedIn` | `readme`, `docs`, or both. Empty means a test sample that no page shows. |

### Capture mode

The client reads query parameters; `packages/client/src/capture.ts` parses them
(`readCaptureParams()`) and provides `markCaptureReady()`. For example:
`/?capture=1&scene=play&song=pb-fixture-01&t=12.5&difficulty=normal&seed=1`.

| Parameter | Meaning |
|---|---|
| `capture` | `1` turns capture mode on. Without it the page behaves normally. |
| `scene` | Which screen to show: `title`, `jukebox`, `controls-arrows`, `controls-wasd`, `controls-gamepad`, `help`, `help-end`, `settings`, `keys`, `hangar`, `play`, `run-start`, `paused`, or `results`. |
| `song` | Song id: a bundled song's file name without its extension (`chip_overture`), or `pb-fixture-01` for the test song. |
| `t` | Song clock in seconds. |
| `difficulty` | Difficulty name. |
| `seed` | Integer seed for cosmetic randomness. Default 1. |
| `boom` | Play scenes: the ship blown up where it is, this many ms ago (the `explosion` shot). Unset, no explosion. |

In capture mode the renderer must:

- **Not start audio.** No audio context, no song playback.
- **Pin the song clock to `t`.** The clock does not advance; the frame is what the sim and
  levelgen produce at `t` for that song and difficulty.
- **Seed cosmetic randomness from `seed`** (particles, shake) with a seeded generator in
  `client`, never `Math.random`. Cosmetics still never feed back into sim state.
- **Disable anything time-varying that `t` does not drive:** idle animations, blinking
  cursors, CRT flicker, intro fades, and anything that reads the wall clock.
- **Set `window.__pbCaptureReady = true`** (call `markCaptureReady()`) once, after the frame
  on screen is final: assets loaded, fonts ready, and the last draw done.

`packages/client/src/game/capture-scene.ts` implements it:

- **`scene=title`** draws the title screen with the cursor on Play, the song and
  difficulty chosen, and the cursor steady instead of blinking. The stars sit where `t` puts them.
- **`scene=jukebox`** draws the jukebox with the first song playing at `t`, its length from
  an analysis of the song, and the spectrum dark. **`scene=controls-arrows`**,
  **`scene=controls-wasd`** and **`scene=controls-gamepad`** draw the three controls pages, **`scene=help`** and
  **`scene=help-end`** the help screen scrolled to its top and its end, and
  **`scene=settings`** the settings at their defaults, and **`scene=keys`** the Keys screen
  at the defaults with the cursor on Fire's first slot. All of these show the stars as the title does.
- **`scene=hangar`** draws the hangar intro `t` seconds from its start, with `song` on the
  cassette as level 1 at `difficulty`. `window.__pbCaptureSeek(t)` redraws it at another
  time, so a clip of the intro works too.
- **`scene=run-start`** is `scene=play` as a run from the hangar starts: the canopy closing
  for the first second of song time and the colour flooding in.
- **`scene=paused`** is `scene=play` with the pause menu over it, the cursor on Resume.
- **`scene=play`** analyzes the song in the analysis worker, builds the level for
  `difficulty`, records `autopilotInputs(level)`, and runs the sim from tick 0 to
  `floor(round(t * 48000) / 400)` with that log, through the same `catchUp` the game loop
  uses. It then draws the frame at song sample `round(t * 48000)`, the scroll interpolated
  between ticks as in play. If the autopilot lost its last life before `t`, the frame shows
  the crash, timed from the crash tick in song time. With `boom`, the ship (drawn without
  its shield) breaks apart where it is, `boom` ms in, shake included.
- The renderer is created with `preserveDrawingBuffer`, so the screenshot reads the frame
  that was drawn, and the page waits two animation frames after the draw before it calls
  `markCaptureReady()`. Capture mode needs WebGL and throws if PixiJS picks another
  renderer.
- **`window.__pbCaptureSeek(t)`** redraws the play scene at another song time and returns
  a promise that resolves once the frame is on screen. It runs the sim forward from where it
  is, or from tick 0 when `t` is earlier. A seeked frame has the same bytes as a fresh load
  at that `t`: checked with seeks from 29 to 30.4 s and from 30.4 back to 12.5 s
  (2026-11-08).

### Clips

A shot with `clip: { from, to, fps }` (song seconds) becomes an animated GIF. The script
loads the page at `t = from`, then for frame i calls `window.__pbCaptureSeek(from + i / fps)`
and screenshots the viewport, until `to`. The default clip viewport is 768x432 (2x), so each
game pixel is a 2x2 block.

- `tools/screenshots/png.ts` decodes each screenshot to RGBA. It reads only the PNGs Chromium
  writes (8-bit RGB or RGBA, not interlaced).
- `tools/screenshots/gif.ts` encodes the frames with gifenc 1.0.3 (MIT, pure JavaScript,
  checked 2026-11-08), so there is no ffmpeg. Every frame shares one palette. When the frames
  use 256 colours or fewer, the palette is exactly those colours, sorted, and no pixel
  changes; past 256, gifenc's quantizer builds one from all the frames. Particles fading
  over the terrain blend in new colours: `gameplay-clip` used 202 before the power-ups and
  is quantized since its missile bursts (2026-11-09).
- GIF frame delays are whole hundredths of a second, so `fps` must divide 100; the script
  rejects other values.
- The script fails a clip over 5 MB. Keep clips a few seconds long: `gameplay-clip` is 4 s at
  25 fps, 100 frames, about 1.7 MB.

Clip bytes are stable like the stills: two runs gave the same SHA-256 for
`docs/img/gameplay-clip.gif` (2026-11-08).

### The release workflow

`.github/workflows/screenshots.yml` runs on `release: published` and on manual dispatch
(`workflow_dispatch`). It installs, runs `playwright install --with-deps chromium`, runs
`pnpm screenshots`, and, if anything under `docs/img/` changed, pushes a `screenshots/run-<id>`
branch and opens a pull request with `gh pr create` using `GITHUB_TOKEN` (permissions
`contents: write` and `pull-requests: write`). The repository setting **Allow GitHub Actions
to create and approve pull requests** (Settings, Actions, General) must be on for that step.
A person reviews the changed images and merges the pull request; nothing is pushed to `main`
directly.

## Audio and clock

`packages/client/src/audio/` plays a module through the same libopenmpt build the analysis
uses, in an AudioWorklet, and keeps the song clock the sim and renderer follow (PLAN.md,
"Audio and timing").

- `worklet.ts` is the AudioWorkletProcessor. Vite bundles it on its own: `player.ts`
  imports it as `./worklet.ts?worker&url`, and `vite.config.ts` sets `worker.format` to
  `'es'` because `addModule` loads an ES module.
- `player.ts` has `createAudioPlayer()`, which returns `load(bytes)`, `start()`,
  `pause()`, `resume()`, `stop()`, `onEnded`, `onPosition`, `userOffsetMs`, and
  `songTimeSamples()`.
- `clock.ts` is the clock arithmetic (`SongClock`), tested in Node.
- `audio-debug.html` (open `/audio-debug.html` on the dev server) plays the fixture on a
  click and shows song time, order, row, and how far the clock is from the worklet's
  reports.

**The wasm.** An AudioWorklet can't fetch, so `createAudioPlayer()` fetches
`libopenmpt.wasm` on the main thread (imported as `@game/analysis/libopenmpt.wasm?url`)
and passes the bytes to the processor in `processorOptions`. The processor calls
`loadOpenMpt({ wasmBinary })`.

**What the worklet plays.** Each `load` and each restart opens a fresh libopenmpt module
from the bytes and applies `RENDER_CTLS`, `RENDER_PARAMS`, and repeat count 0 from
`@game/analysis`, the same settings as the analysis pass. It renders one 128-frame quantum
per `process()` call and, every 50 ms of song time, posts its position: the context frame,
the song frames rendered, the order and row, and every row change since the last message.
It posts `ended` when libopenmpt reaches the song's end.

**The clock.**

```
songTime = (currentTime - startTime) - outputLatency + userOffset
```

- `startTime` is the context time of the song's first frame: the `currentFrame` of the
  render quantum in which the worklet rendered it, divided by 48 000. The worklet reports it
  in its `started` message. It is later than the `start()` call, because the worklet starts
  at the first quantum after the message reaches it.
- `currentTime` is the context's time. The graph rendered the song frame at context time
  `t` exactly `(t - startTime) * 48000` frames into the song, as long as no quantum is lost;
  the browser test checks that.
- `outputLatency` is the time from the graph to the speakers. It is read when the clock
  anchors, replaced while it reads 0 (some browsers report 0 until the device runs), and
  then kept until the next `start()`, so the clock doesn't jump during a song. Where a
  browser doesn't provide `outputLatency`, the clock uses `baseLatency`, and 0 if that is
  missing too; the user offset has to cover the rest.
- `userOffset` is `userOffsetMs`, added as is. Audio that arrives later than the browser
  reports (Bluetooth headphones) needs a negative offset.
- The arithmetic is in whole 48 kHz frames. `songTimeSamples()` can be negative right after
  a start: the first frame hasn't reached the speakers yet. Between `start()` and the
  `started` message it reads `-outputLatency + userOffset`. While stopped it reads 0.

**Pause and resume** suspend and resume the context. A suspended context's `currentTime`
stops and the worklet renders nothing, so the clock holds its value and continues from it
on resume.

**Song end.** The worklet posts `ended` with the song's length in frames, the player calls
`onEnded`, and its state becomes `ended`. The clock keeps running past the end; compare it
with `endedAtSongFrames` (or LevelData's `totalSamples`). `start()` always plays from the
beginning: it reopens the module, so a restart renders exactly what analysis rendered.

**48 kHz only.** The context is created at 48 000 Hz with the `'interactive'` latency hint.
If it runs at another rate, `createAudioPlayer()` throws `SampleRateError` instead of
playing at a rate the analysis didn't time.

**Measured in headless Chromium** (2026-11-08):

- Row changes the worklet reports are at most 128 frames from LevelData's row times over all
  449 rows of `pb-fixture-01.mod`, within the allowed 160 + 128 frames (one analysis chunk
  plus one quantum).
- A position message arrives 128 to 256 frames (2.7 to 5.3 ms) of context time after the
  quantum it describes, and the context frame minus the song frame equals the anchor in
  every message, so the clock and the worklet don't drift apart.
- `outputLatency` reads 32 ms, `baseLatency` 10 ms.
- `currentTime` advances in steps of 384 or 512 frames (8 to 10.7 ms), one audio callback at
  a time, not smoothly. Read the clock once per animation frame and smooth the display if a
  step shows; the sim can consume the steps as they come.

Firefox and WebKit run the same tests in CI; their latency reporting and `currentTime` step
size are not measured here. On a PulseAudio null sink, Firefox 159 reported an 8.6 ms
latency (2026-11-10).

**Sync** (`audio/sync.ts`, the screen in `game/sync-screen.ts`). The Settings row Sync holds
`userOffsetMs` (`settings.syncMs`, -300 to +100 in steps of 5); Enter on it opens the Sync
screen.

- `SyncSession` schedules 24 clicks, 500 ms apart and 1 s after the start, as
  `AudioBufferSourceNode`s straight to `context.destination`, so a Music or Effects volume
  of 0 doesn't silence them. The title music stops while it runs and starts again on the
  way out.
- A press is read as the song clock reads one: `currentTime - outputLatencyOf(context)`. Its
  gap to the nearest click's context time is what the reported latency misses plus how
  the player presses on a beat. `getOutputTimestamp()` would place a press more finely, but
  its idea of latency can differ from `outputLatency`, and the offset has to correct the
  clock the game uses, so the session uses the clock's own reading. `currentTime` moves in
  8 to 10 ms steps; the median over 16 presses evens them out.
- `syncResult()` drops the first 4 presses, then those over 100 ms from the median, and
  returns the negated median of the rest, rounded to 5 ms and kept in range. Fewer than 8
  presses left gives null ("Too uneven"); so does running out of clicks.
- Presses come from keys (any but Esc), a mouse or touch on its pointerdown (a capture
  listener on `window`, ahead of the touch controls, which swallow theirs), and gamepad
  buttons as `#pollPads` sees them. A touch button is skipped there, as its pointerdown
  already counted. On the result, a press within `PROMPT_DELAY_MS` doesn't keep it, so
  the last press can't.
- Tests: `test/sync.test.ts` (the arithmetic and the screen's text) and
  `test/browser/sync.test.ts`, which renders the clicks in an `OfflineAudioContext`, checks
  each starts within a frame of its scheduled time, and gets -50 ms back from presses 50 ms
  late.

### Sound effects

The research and design are in [`SOUND-EFFECTS.md`](SOUND-EFFECTS.md). In code:

- **`@game/chipfx`** (`packages/chipfx`) renders a sound from parameters to samples, in the
  style of sfxr. It has no game code, so other projects can use it (its README).
- **`audio/effects.ts`** is the game's effects as chipfx parameters (`EFFECTS`): layers,
  noise variants, random rate change, echo and reverb sends, and priority. Pitched effects
  are functions of the song's pitch class.
- **`audio/mixer.ts`** (`EffectsMixer`) renders each effect to an `AudioBuffer` once
  (`prewarm()` does the unpitched ones one per timer callback when the audio starts) and
  plays it: stereo pan, the echo and reverb sends, a compressor, the effects volume, and at
  most `MAX_VOICES` (14) at once by priority. `input` is where the menu sounds connect.
- **`audio/song-notes.ts`** (`SongNotes`) keeps each instrument's notes and the melody by
  tick, from the LevelData the level was made from, for the pitched effects. `Game` keeps
  one per `Level` (`#makeLevel`).
- **`game/cues.ts`** (`SoundCues`) compares the sim state with what it saw last frame and
  lists what happened: the ship's volley, tank hits, kills (3 a frame at most), kills on the
  beat, bombs, missiles, the nuke, a nuke charged, a life lost, shield hits (by
  `state.shieldHitTick`, so the god cheat's hits sound too), pickups, unlocks, extra lives,
  and boost. It only reads, and it starts over without cues when the level changes or the
  tick goes back (a retry, the demo looping). `Game.#playCues` runs it after each frame's
  `catchUp` in play, replays, and the demo.
- **The hangar intro's sounds** are a fixed list of times (`HANGAR_CUES` in
  `game/hangar.ts`), not sim cues: see "Playing it".

## Renderer and game loop

`packages/client/src/render/` draws the game with PixiJS 8.22.0 (MIT, checked 2026-11-08),
and `packages/client/src/game/` runs the screens and the frame loop. The design is in
`PLAN.md`, "Visual spec" and "Client UI"; the coordinates are in "Level and sim" above.

### Playing it

Run `pnpm dev` and open the URL it prints.

- **Start screen:** the logo and "Press any key". Browsers let a page play sound only after
  a key press or click, so the first press starts the title music and opens the menu.
- **Title menu:** Play, Levels, Difficulty, Scores, Jukebox, Controls, Settings, Help, Credits, over the title song. Up and down
  (arrows or W and S) move the cursor, left and right change Levels' song or the
  difficulty, and Enter or Space selects. A click selects too, and Enter on Difficulty steps
  it forward, so one button reaches every choice.
- **Demo:** left alone, the menu fades into the title song's level flown by the autopilot,
  joined where the music is, so the music carries on. Any key or click returns to the menu
  and does nothing else. The demo fades back to the menu after 30 s.
- **Play** starts the arcade run at level 1; finishing a level offers the next, and the
  last ends the run. **Levels** plays one song, its score on that song's board (named
  Practice until the boards counted it; Brad, 2026-11-10). Each level opens with a 2 s
  card: the level number ("Final level" for the last), the song's title and credit, and
  the difficulty; a song from Levels says "Ready" in place of the level number. Level 1
  from Play opens with the hangar intro instead.
- **Hangar intro** (`hangar.ts`, Brad, 2026-11-10): before level 1 of each run started with
  Play, in black and white (see "Hangar intro art" below). The captain walks across the
  hangar, climbs the ladder into the fighter, and the camera closes in (0 to 5.2 s). In the
  cockpit a gloved finger presses Eject and the deck's door springs open, tilting forward on
  a hinge along its bottom edge; the hand lays a cassette labelled with level 1's song in
  the door's holder and a finger pushes the door shut, after which the tape shows through
  the door's window. The level number, the song's title, credit and difficulty show, and
  the finger presses Play (8.25 s), which starts the run with the song at 0. Real decks
  differ: US patent 4087844 hinges its door at the top. The bottom hinge, the spring that
  opens it, and the button that releases it follow the outer door of US patent 4607301 (a
  car stereo); that door doesn't hold the cassette, so the holder is the intro's own, and
  the opening angle, 25 degrees (`DOOR_ANGLE`), is a guess. The tilt is drawn by squashing
  the door (`door.png`, cut from the cockpit by `tools/hangar-art.py`, its window clear)
  and the tape in it towards the hinge; at 60 degrees the tape looked like it shrank
  (Brad, 2026-11-10). While the level is still loading, the hand waits over
  Play (`introTime`). The run starts with the canopy frame coming down over the window,
  the level showing through the glass, then the cockpit dropping out of view (`drawWipe`,
  1 s of song time); meanwhile the level floods from black and white into colour, one step
  per row of the song over 32 rows (`ColourFlood`, a `ColorMatrixFilter` on the stage,
  removed at full colour). Any key, click or pad button skips it after 0.3 s: the run
  starts at once, or shows Loading until the level is ready, and floods into colour
  without the canopy. Levels, retries and later levels don't show it. Its sounds
  (footsteps, ladder, seat, cassette, Play key, tape hiss, then the canopy) are a timed
  list, `HANGAR_CUES`, that `Game.#drawHangar` plays as the intro's clock passes each one.
  Everything on screen is a function of the time, so capture mode can show any moment.
- **In play,** by default two keyboard layouts work at once (the Keys screen, below,
  changes them): arrows with Z, X, C, V and Shift, or
  WASD with J, K, L, ; (semicolon) and ' (quote). Arrows or WASD move; Space, Z or J fire
  (hold to keep firing); X or K drop a bomb (one per press, 1 s to reload after it bursts);
  C or L launch a missile once unlocked; V or ; nuke; either Shift or ' boosts once unlocked; and
  Esc, always, pauses (a gamepad and touch are below). Capsules unlock power-ups as they are picked up. Losing the last
  life is game over: any key retries the level, Esc goes to the title, and R and S watch
  and save the run's replay (see "Replays"). Game over and level complete ignore keys for 0.7 s, so a key still held from
  play doesn't skip them. The game pauses when the window loses focus or the tab is hidden.
- **Secrets** (Brad and Brad's son, 2026-11-10), none of them shown in the game's help:
  - **Konami code:** up, up, down, down, left, right, left, right, B, A on the title
    screen (the arrow keys and the B and A keys, or a pad's D-pad and B and A buttons;
    `secrets.ts`) turns infinite lives on, or off again, with a trill (`secret` in
    `MENU_SOUNDS`). "Infinite lives" shows in magenta under the title's credit, and Play
    and Levels start with `Cheat.infiniteLives`.
  - **God mode:** holding Esc, or Start on a pad, while choosing Play with another key or
    button (Start alone choosing Play doesn't count) starts the run with `Cheat.god`.
    "God mode" shows under the credit while Esc or Start is held.
  - **Impossible:** stepping the difficulty forward through easy, normal and hard three
    times shows Impossible after the third hard (`TitleMenu`, `IMPOSSIBLE_PASSES`); a step
    back starts the count again. From then on, until the page reloads, it is one of the
    choices. Play on Impossible is one level, Crush (`IMPOSSIBLE_SONG_IDS`), headed
    "Impossible"; Levels on it plays any song with hard's cave at its own tempo. Its
    walls are red (`LED_RED`, from `0x3a0006` at the screen edge to `0xff2a2a` at the tip,
    which `TerrainView.setLevel` picks for the difficulty), and its hangar intro is on
    alert (`HangarIntro.setAlarm`): a red flash added over the picture twice a second
    (`strobeAlpha`: 70 ms each, fading from the Flashing setting's peak, at 0 and 160 ms of
    every second, under WCAG 2.2's three flashes a second, 2.3.1), and the siren's wail at 0.15 s and 4.15 s
    (`ALARM_CUES`, merged into the cue list by `hangarCues`). Impossible runs go on the
    boards like any other; only cheats keep a run off (Brad, 2026-11-10).

  A run with a cheat shows "Cheat" in magenta left of the score, and its replay records the
  flags, so the boards refuse it. Watching a replay runs with the flags it recorded.
- **Pause menu:** "Paused" over the frozen game, with Resume, Controls, Help and Quit,
  worked like the title menu. Esc (or Backspace) resumes, as does Start on a pad, from any
  item; Q (unless it is bound to an action), or Select on a pad, quits to the title. The cursor starts on Resume each time.
- **Controls** (`controls.ts`), from the title menu or the pause menu: three pages, Arrows,
  WASD and Gamepad (Brad, 2026-11-10: one keyboard page with both layouts showed too
  many keys). Each draws the keyboard or a standard pad from the bindings, with only that
  page's keys or buttons filled
  in their action's colour (fly white, fire cyan, bomb amber, missile magenta, nuke red,
  boost violet, pause grey), over a legend of the actions and their keys. The first
  keyboard page shows each action's first and third keys, the second its second and third,
  and Esc on both; a page's tab is named from its Fly keys ("Arrows", "WASD", "IJKL")
  when they read as a name, else "Keys 1" or "Keys 2". It opens on the
  gamepad page if the last press was on a pad. Left and right switch pages, Enter goes to
  the next page and leaves from the last (so a click alone sees them all), and Esc goes
  back to where it was opened. The title and jukebox show no control hints of their own
  (Brad, 2026-11-09).
- **Help** (`help.ts`), from the title menu or the pause menu: a key to what's on screen,
  each row the game's own sprite (`getTextures()` in `render/combat.ts`, `shipTexture()`),
  a label, and a value: enemies and their points, the score bonuses, the weapons, the
  power-ups, and the HUD. The numbers come from `@game/core`'s constants. It is taller than
  the screen, so it scrolls a row at a time (`Scroller` in `menu.ts`): up and down a row,
  left and right a page, the mouse wheel a row; Enter pages down and leaves from the end;
  Esc goes back to where it was opened.
- **Settings** (`settings.ts`, `SettingsMenu`, `SettingsScreen`), from the title menu: Music
  and Effects volume as five LED cells each, off to 5; Flashing (Reduced or Full), Shake and
  CRT (Off or On), and LEDs (Neon or Colour-blind) as words; Keys, which opens the Keys
  screen; then Back. Left and right
  change a value and stop at the ends; Enter steps a volume up and wraps to off, and flips
  the others. Each volume step halves the gain. The defaults are Music 5, Effects 4,
  Flashing Reduced, Shake On, CRT On (Brad, 2026-11-10) and LEDs Neon.
  Changes take effect at once (a kill sound plays at the new effects level) and are kept in
  `localStorage` under `pattern-break.settings`; where storage is blocked, the defaults
  apply and changes last until the page closes. What Flashing and Shake do is under
  "Flashing and shake" in "Rendering", CRT under "CRT", and LEDs under "Terrain".
- **Keys** (`bindings.ts`, `KeysMenu` in `menu.ts`, `keys-screen.ts`; Brad, 2026-11-10),
  from Settings: remappable controls. A Device row (Keyboard or Pad), a row per action with
  three slots, then Reset and Back. The keyboard has Up, Down, Left, Right, Fire, Bomb,
  Missile, Nuke, Boost and Pause; the pad adds Cancel (Select: back in menus, quit from
  pause) and Replay (Y). Three slots, not two, so the defaults fit: Z, J and Space all
  fire, and both Shifts and ' boost. Enter on a slot waits 5 s for a key or button ("?"
  blinks; Esc, a click, or on the keyboard page a pad press, gives up); Delete empties the
  slot; Reset puts the device's defaults back. A key or input already used elsewhere
  swaps: its old slot takes what the new one held, so nothing is lost.
  - **Keys** are `KeyboardEvent.code` values (https://www.w3.org/TR/uievents-code/): the
    key's place, not its letter, so the screen names them as a US keyboard prints them.
    Esc is locked in Pause's first slot. Enter, Backspace, Delete, Tab, the Windows or
    Command keys, the menu key and F1 to F12 can't be set ("Key reserved"), so Enter always
    confirms and Esc and Backspace always back out. A change that would leave Up, Down,
    Left or Right with no key is refused ("Up needs a key"), since menus need all four.
  - **Menus follow the keys,** as on a pad: the directions move, Fire confirms, Bomb and
    Pause back out (`KeyMap.menuAction` in `input.ts`), besides Enter, Esc and Backspace.
  - **Pads** have a layout per profile (`padProfile` in `gamepad.ts`): one shared by every
    pad with the standard mapping, defaulting to the layout under "Gamepad", and one per
    other pad, by its `id`, empty until set, since its numbers are the device's own. The
    Pad page shows the pad used last (`PadWatcher`) and its name ("Standard pad", or the
    id); a new input from any pad is set in that pad's layout. An input is `b3` (button 3),
    `a1-` or `a1+` (axis 1 leaning past half way), or `h9@-1.000` (axis 9 as a hat switch,
    at that position). The spec doesn't cover hats; some browsers report an eight-way hat
    as one axis, -1 at up and 2/7 more for each 45 degrees, above 1 when centred
    (https://3960.org/sandbox/gamepad-test.html), so an axis resting above 1 when an input
    is set is taken as a hat, and a hat position also counts on the diagonals next to it.
    Unverified on a real non-standard pad or arcade stick.
  - Kept in `localStorage` under `pattern-break.bindings`; invalid, reserved or repeated
    entries are dropped on load, and a keyboard layout with a direction left empty falls
    back to the defaults.
- **Sound effects** play in runs, replays, and the demo (see "Sound effects" under "Audio
  and clock").
- **Score:** top right in play. Each kill shows its points where the enemy was, amber when
  on the beat. After the lives come the bomb, which empties when one drops and fills
  again over its reload, the missile the same way once unlocked, the multiplier in amber
  once it is above 1, and an amber ring for each nuke held.
- **Results** (`results.ts`; `test/results.test.ts`): level complete and game over show the
  score broken down, in rows 20 characters wide so the numbers line up in the monospaced
  font: kills and their points (with the streak multiplier, without the beat's doubling),
  the beat bonus (half of each on-beat kill's points), the lives bonus (level complete
  only), and the score; then the personal best for the song and difficulty, or "New best"
  in amber; in the arcade run, the total of the levels finished; then R Replay and S Save.
  `scoreBreakdown` reads `enemyPoints` and `enemyOnBeat`; the sim adds to the score only
  for kills and the survival bonus, which `analysis/test/golden.test.ts` checks on every
  fixture run. Bests are kept in `localStorage` under `pattern-break.bests`, a map from
  `songId:difficulty` to score. A run sets a best when it beats the old one, has no cheat
  and scored above 0; game over counts. Watching a replay sets none, and the game-over
  results are kept when you come back from watching its replay.
- **HUD** (`render/combat.ts`, the icons in `render/icons.ts`; layout in `docs/PLAN.md`,
  "HUD"): the arsenal's ten slots sit at fixed x (`slotX`), 7 px icons 2 px apart, with
  alpha 0.2 for what the ship doesn't have. Lives and shield pips sit on the bottom row,
  `BOTTOM_Y`, the multiplier left of the score inside the score's panel (added after the
  panel, so the panel doesn't dim it). A capsule's texture is `Textures.capsules[nextUnlock(state)]`,
  made by `capsuleMap(icon)`: the 7x7 icon on a dark face in a 9x9 amber frame. Until
  2026-11-11 a power-up meter of six labelled LED cells ran along the bottom.
- **Gamepad:** a pad that reports the Gamepad API's "standard" mapping
  (https://w3c.github.io/gamepad/, "Remapping"), which fixes its button and axis numbers,
  works at once; any other pad does nothing until its inputs are set on the Keys screen.
  The standard layout, which the Keys screen changes: in play the left stick (past half
  way) or the D-pad flies; A and RT (buttons 0, 7) fire; B (1) drops bombs; X (2) nukes; LB
  and LT (4, 6) boost; RB (5) launches a missile; Start pauses. In menus the stick or D-pad moves (held, it repeats after 400 ms, then
  every 100 ms), Fire (A or RT) or Start selects, and Bomb (B) or Select goes back. On game over and level
  complete B or Select is Esc, Y (3) watches the replay, and any other button is any key. A pad can't leave the start
  screen on a fresh page: browsers start sound only after a user activation, and the HTML
  spec's activation-triggering input events
  (https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)
  are keydown (not Esc), mousedown, pointerdown from a mouse, pointerup from anything else,
  and touchend, not gamepad presses. So unless `navigator.userActivation.hasBeenActive`, a
  pad press there shows "Key or click for sound". For the same reason a click acts on
  `pointerdown` and a touch on `pointerup` (until 2026-11-10 both acted on `pointerdown`,
  so a tap on a phone couldn't start the sound).
- **Touch** (`touch.ts` for the DOM, `touch-input.ts` for the logic; Brad, 2026-11-10):
  DOM elements over the canvas, shown on a screen with a coarse pointer or once a touch is
  seen, hidden on the start screen (its tap starts the sound) and while
  `gamepadConnected()` is true (a pad shows up there once a button on it is pressed). A
  touch on the left 40% of the screen puts a floating stick there: 40 px of reach, a 10 px
  dead zone, 8 equal sectors, and dragged past its reach its centre follows the thumb. A
  touch there that ends within 300 ms without leaving the dead zone is a tap, which acts
  like a click. Six buttons on the right show the HUD's symbols (`render/icons.ts`, drawn
  as SVG): pause, nuke, boost, missile, bomb and fire, fire lowest. Each holds a gamepad's
  bits (`TOUCH_BITS`): fire is also A and bomb also B in menus, and pause is Start, so
  holding pause while pressing fire on Play starts in god mode. `touchLayout` puts them in
  the bar right of the picture, in two columns if they fit at 44 CSS px or more (WCAG 2.2,
  2.5.5 Target Size), one column if not, and at the right edge over the picture if the
  bar is narrower still. Pointer Events track each finger by `pointerId`, so the stick and
  buttons work together; `Game.#pollPads` ORs the touch bits with the pads'.
- **Jukebox:** the bundled songs, then the imported ones, then Import and Back. Where the
  browser's file picker can pick a folder (`webkitdirectory`, Baseline since August 2025
  per MDN), left and right on Import choose "< File >" or "< Folder >" (Brad, 2026-11-10:
  one row, not two). Each song's row has its title, its length (m:ss) in a column, and its
  author at the right edge (Brad, 2026-11-11). A title keeps 18 characters and an author 9,
  the longest bundled ones; an imported song's longer ones are cut, and on an imported
  song under the cursor the remove hint takes the length's place. Under the list is a 24-bar spectrum of what is playing, and under
  that the song's title, credit and time. Enter plays the song under the cursor or stops
  it if it is playing, a song that ends hands over to the next, and Esc or Back returns to
  the title, where the title music starts again. The list shows 11 rows at 10 px
  (`JUKEBOX_VISIBLE_ROWS`); a longer one scrolls to keep the cursor in view
  (`jukeboxTop`), with a scroll bar like the help screen's.
- **Importing songs** (Brad, 2026-11-10: in the Jukebox, not a menu of its own): Import
  on File opens the file picker for `.mod .xm .s3m .it` files, several at once; on Folder
  it takes every song file in a folder and its subfolders; song files dropped on the title or the
  jukebox are imported too (a dropped replay file still plays). Browsers open a file picker
  only during a key press, click or tap, so a pad's confirm on Import shows "Import: keys
  or touch". Each file is hashed (SHA-256 through WebCrypto, which needs HTTPS or
  localhost: elsewhere the note reads "Import needs HTTPS"), skipped if it's already in the
  list, then analyzed at normal's tempo in the worker: a file libopenmpt can't open counts
  as "not a song". The song, titled from its own title or else its file name, goes in the
  library with its level, and joins Levels and the jukebox (not the arcade run); the
  cursor moves to the first new song. The note line counts what happened ("2 added, 1
  already here, 1 not songs"; also "too big" past 32 MB and "not saved" where storage
  fails). An imported song's id is `imported-` and the first 12 hex digits of its hash, so
  its personal best stays with it, and replays find it by hash.
- **Removing an imported song:** on its row the right-hand column reads "Del Remove"
  ("Select Remove" after a pad press); the first Del or Select turns it to "Del Confirm"
  in magenta for 3 s, and a second removes the song and its cached levels. Touch has no
  remove yet.

Two query parameters help in development:

| Parameter | Effect |
|---|---|
| `autopilot=1` | `autopilotInputs(level)` flies the ship; the keyboard doesn't move it. |
| `perf=1` | Turns the frame stats on whatever the Perf setting says (see "Performance"): a readout in the top right corner, under the score, of frames a second, then the mean and 95th percentile of the frames' work over the last half second ("60 fps  1.2 ms  p95 2.8"), and the run's report on game over and the clear screens. `window.__pbPerf()` in the console returns the mean, p50, p95, p99 and maximum in ms since the run started; `window.__pbPerfReset()` starts it again. |
| `song=<id>` | Puts that song on the Levels row (ids as in capture mode). `song=pb-fixture-01` adds the test song to Levels and the jukebox. |

#### Hangar intro art

The hangar with the fighter, the cockpit, the captain, and the glove are generated images
(Brad, 2026-11-10): `art/hangar/README.md` has the model, the prompts, the references
(the first version's frames, and the player ship's sprite so the fighter has its shape),
and the files' hashes. The cassette, the symbols on the deck's keys, the canopy frame, and
the text are drawn in code. The cassette has a compact cassette's proportions, 4 by 2.5
inches (Wikipedia, "Cassette tape"), at 88x55 px, the most the deck's door holds, and its
face follows a photo of one (the comment on `drawCassette()` names it). Its label holds 13
characters, so `labelText()` cuts a longer title at a word; the full title shows with the
level heading.

`python3 tools/hangar-art.py` makes the game's copies in
`packages/client/src/game/hangar-art/`: it box-filters each source to the 384x216 grid
(the captain to 28 px tall, the glove to 0.4 of its source), snaps every pixel to the
intro's seven greys and its alpha to on or off, cuts the captain's sheet into frames
(`pilot.png`: four of the walk, then two of the climb, 12x33 each, feet at the bottom
centre; `pilot-seated.png`), paints out the faint cassette the source drew in the deck's
empty window, cuts the cockpit's panel away from the view out of the canopy along the
glare shield (`cockpit-panel.png`), and prints the glove's anchor points.
`hangar.ts` has the positions measured on these files (the ladder, the cockpit opening,
the deck's window and keys) and the anchors; rebuilding the art from new sources means
measuring them again. `loadHangarArt()` loads the PNGs once; `Game` starts it at start-up
and shows the usual level card instead of the intro if it hasn't loaded.

### Bundled songs

The songs live in `music/`, each with an entry in `music/manifest.json` (fields in
`PLAN.md`, "Bundled music"). `game/songs.ts` builds the menu's list from the manifest, in
its order, and finds each file's URL with Vite's `import.meta.glob`, so adding a song is
adding the file and its entry. The generated test song (`pb-fixture-01.mod`) stays in
`packages/analysis/fixtures` for the tests and screenshots and is not in the menu.

The part each song plays is set in `songs.ts`, not the manifest:

- `TITLE_SONG_ID`: the title and demo music, and Levels' first song (The_Epic_Chip).
- `LEVEL_SONG_IDS`: the eight arcade levels in order, by scroll speed, from Neon Techno to
  Keygen 9000.
- `IMPOSSIBLE_SONG_IDS`: the secret Impossible difficulty's run, one level: Crush, the
  fastest song measured.
- `CREDITS_SONG_ID`: the ending's credit roll, after the last level (Sleepy Snow).
- `GAME_OVER_MUSIC`: game over plays Keygen 9000's first 8 s, its two sparse opening
  patterns (about 3 to 5 notes per second; the third pattern jumps to 17), fading out over
  the last 1.5 s.

`tools/validate-manifest.ts` (`pnpm check:music`, run by `pnpm check` and CI) fails when a
song file in `music/` has no entry or an entry has no file, a SHA-256 doesn't match, a
credit field is empty or a link isn't https, or a license is off the allowlist (Public
Domain, CC0, CC BY). A CC BY-SA entry fails until it has a `"reviewed"` field saying who
reviewed it and when. A bundled song's `"seconds"` must equal libopenmpt's length,
rounded to the millisecond; the test songs need none.

The sixteen songs so far, all by Drozerix (Brad, 2026-11-10: JAM's songs sound out of place
beside Drozerix's), each marked Public Domain on its Mod Archive page, with the file's MD5
matching the one the page lists. The files are named after the archive's,
without the artist prefix and the `!` (`4_rndd.xm`), since the name becomes the song's id
in URLs. Their numbers, the songs that were considered and not used, and the checks a new
song goes through are in [`SONG-DIGEST.md`](SONG-DIGEST.md); keep it current when a song
is added.

| Song | File | Author | Part |
|---|---|---|---|
| The_Epic_Chip | `the_epic_chip.xm` | Drozerix | Title, demo |
| Neon Techno | `neon_techno.mod` | Drozerix | Level 1 |
| RNDD_Keygen#1.0 | `rndd_keygen_1.xm` | Drozerix | Level 2 |
| CHiP_OVERTURE | `chip_overture.xm` | Drozerix | Level 3 |
| The_Dim_Dungeon | `the_dim_dungeon.xm` | Drozerix | Level 4 |
| 4_RNDD! | `4_rndd.xm` | Drozerix | Level 5 |
| Girl From Mars | `girl_from_mars.xm` | Drozerix | Level 6 |
| Wrath_of_the_Djinn | `wrath_of_the_djinn.xm` | Drozerix | Level 7 |
| Keygen 9000 | `keygen_9000.xm` | Drozerix | Level 8, game over |
| Crush | `crush.xm` | Drozerix | Impossible |
| Augmented_Emotions | `augmented_emotions.xm` | Drozerix | Pack |
| The_Dim_Dungeon_2 | `the_dim_dungeon_2.xm` | Drozerix | Pack |
| Cabin Fever! | `cabin_fever.xm` | Drozerix | Pack |
| Chica-pop! | `chica_pop.xm` | Drozerix | Pack |
| Peachy Chip | `peachy_chip.xm` | Drozerix | Pack |
| Sleepy Snow | `sleepy_snow.xm` | Drozerix | Ending's credits |

The pack songs (M4) and Sleepy Snow have no level in the run: they are in Levels and the
Jukebox, like an imported song.

### Library

`game/library.ts` keeps the player's songs and analyzed levels in this browser's IndexedDB,
through `idb` 8.0.4, in the database `pattern-break` (version 1):

- **`levels`**: serialized LevelData (`serializeLevelData`), keyed
  `<song SHA-256>:<tempo permille>:<GEN_VERSION>`, with an index on the hash. The game asks
  the cache before analyzing (`Game.#analyze`): a hit skips the worker, and a miss analyzes
  and stores the result. Opening the library deletes entries from any other `GEN_VERSION`,
  so a bump costs one analysis per song and tempo, and a libopenmpt change, which changes
  the golden hashes, comes with a bump. On 2026-11-10 in headless Chromium, the title
  screen's two levels took 13 s to appear on the first load and 3 s after a reload, with no
  analysis worker started.
- **`songs`**: imported song files, keyed by SHA-256, with the file name, title, artist,
  bytes, import time and length in seconds. The length is the analysis's `totalSamples`
  at tempo 1000, unless analysis stopped at its cap; a song without one (imported before
  2026-11-11, or capped) gets libopenmpt's length the first time it plays, and it is saved (see "Importing songs" under "Menus and the jukebox"). Deleting a
  song deletes its cached levels. At start the game adds the stored songs after the
  bundled ones, with an object URL for each so they load like bundled songs.

Songs without a hash (the generated test song) are never cached. Where IndexedDB is missing
or fails to open, `openLibrary()` resolves to null and the game analyzes every time; a
failed read or write, or an entry that won't deserialize, falls back to analyzing. When a
newer build in another tab asks to upgrade the database, this tab closes its connection
rather than block it. `test/browser/library.test.ts` checks the cache, the pruning, and
song storage in Chromium, Firefox and WebKit.

Browsers may delete a site's data when the device runs short of space, unless the site has
asked to keep it (MDN, "Storage quotas and eviction criteria"). After an import stores a
song, `keepStorage()` calls `navigator.storage.persist()` if the data isn't kept already
(Brad, 2026-11-10: ask at the first import, not at start). Firefox shows the player a
prompt; Chromium and Safari decide from how the site has been used, without one. Safari
also deletes a site's script-made data after seven days of browser use with no click or
tap on it, while cross-site tracking prevention is on.

### Install and offline

The game installs as an app and plays with no connection (PLAN.md, "Offline-first"), through
vite-plugin-pwa 2.0.0 and Workbox 7.4.1:

- **Manifest.** `vite.config.ts` writes `manifest.webmanifest`: the name from
  `config/brand.ts`, fullscreen, landscape, black, and the icons. `tools/make-icons.ts`
  draws the icons from the game's pixel font: "PB" in cyan with a magenta shadow, as the
  title draws its heading, inside the middle 80% circle a maskable icon keeps, so the 512
  px icon serves as both kinds.
- **Service worker.** `src/sw.ts`, built with the `injectManifest` strategy as a classic
  script (`sw.js`). Workbox's precache takes every built file (the page, scripts, the
  libopenmpt WASM, images, the bundled songs and the license texts, 56 files and about 3.5
  MB on 2026-11-10, with the pack songs)
  when the worker installs, so one online visit is enough. The WASM is about 1.6 MB, under
  the 4 MiB limit the config sets (Workbox's default is 2 MiB). Files under `assets/` are
  served from the cache; the page itself is fetched from the network first and falls back
  to the cached copy when offline, on an error, or after 4 s, so a player online always
  loads the newest build. A new build's worker takes over at once (`skipWaiting`,
  `clientsClaim`) and deletes the old precache; a page already open keeps running the build
  it loaded.
- **Registration.** `main.ts` registers `/sw.js` in production builds only, and only in a
  secure context: browsers allow service workers only on HTTPS or `localhost`, so over a
  plain LAN address the game runs online only (docs/SELF-HOSTING.md). The dev server has no
  service worker.
- Imported songs and cached levels are in IndexedDB ("Library"), which a service worker
  doesn't touch.

`pnpm check:offline` (`tools/offline-check.ts`, also in CI's browsers job) is M4's
acceptance check, in headless Chromium against `packages/client/dist`: Chromium's
`Page.getInstallabilityErrors` finds nothing, the service worker takes control, the
server stops and the browser goes offline, the page reloads from the cache, a song is
imported in the Jukebox, and Levels starts a run on it. It follows the game's screens
through `<html data-mode>`, which `Game.#setMode` keeps, rather than fixed waits.
Chromium's file chooser for a folder (`webkitdirectory`) doesn't reach Playwright, so
the check imports a file. Playwright turns on file chooser interception asynchronously when
the first `filechooser` listener is added, so the check adds it when the page opens: added
just before the key press, CI's first run opened the picker before interception was on and
the event never came (reproduced locally with Chromium's CPU throttled 8 times).

### Menus and the jukebox

- **Menu state** is in `game/menu.ts`, apart from drawing, and tested in Node. `TitleMenu`
  and `JukeboxMenu` take a `MenuAction` (up, down, left, right, confirm, back), not a key.
  `KeyMap.menuAction()` in `input.ts` maps the keyboard and `padMenuAction()` in
  `gamepad.ts` the pad. A held arrow, D-pad direction or stick repeats in a menu; a held
  Enter, Esc or button does not.
- **Screens:** `TitleScreen` (with the start screen), `JukeboxScreen`, `DemoBanner` and
  `FadeOverlay` in `screens.ts` draw from a view of that state and redo their text only when
  it changes.
- **One player, one song at a time.** Title music, jukebox songs, runs and the game-over
  music all go through the game's one `AudioPlayer`. `Game` remembers which song is loaded
  and loads another only when it changes, and records what is playing (`title`, `jukebox`,
  `run`, `gameover`), which decides what happens when a song ends: the title song starts
  again, the jukebox moves to the next song. Every change of music bumps a request number,
  so a slow load that a later key press replaced doesn't start.
- **Volume:** the player has a `GainNode` after its output tap. `fade(value, seconds,
  delay)` ramps it and `setVolume()` sets it; the title music fades in over 1 s and the
  game-over music fades out. The song clock doesn't change.
- **Demo cue:** the demo starts on The_Epic_Chip's change at 18.0 s (its fourth pattern, where
  the notes go from 12 to 28 per second), timed so the fade is black on the change, if the
  menu has had no key press for 5 s. Otherwise it starts after 20 s without one.
  `#prepareDemo()` analyzes the title song and records the autopilot's run on normal as soon
  as the music starts, then analyzes level 1, so Play doesn't wait. In the demo the sim
  catches up to the music's position each frame and starts over when the song does.
- **Menu sounds:** `audio/sfx.ts` plays short square-wave notes through an `OscillatorNode`
  and a gain envelope, in the same AudioContext as the music: `coin` for the first key,
  `move`, `change`, `select`, `back`, and `start` for a run or a level. Each is a list of
  MIDI notes and lengths in `MENU_SOUNDS`. They play at 0.2 into the effects mixer, which
  the default Effects setting halves to the 0.1 of the music they had before Settings.
  `Game` creates the AudioContext itself, inside the first key press, with the music and
  effects volumes, and passes it to `createAudioPlayer()` with the music volume as its
  `output`, so the coin sound plays while the player is still loading.
- **Spectrum:** an `AnalyserNode` (FFT size 1024, -90 to -25 dB, smoothing 0.7) tapped off
  `player.output`, the worklet node. It only reads, so what is heard and the song clock don't
  change. `render/spectrum.ts` groups the bins into 24 bars spaced on a log scale from 60 Hz
  to 14 kHz, and each bar lights up to 12 LED segments from its loudest bin, in the terrain's
  colours.

### Credits

The credits (`game/credits.ts`) list the bundled songs with their authors, the code the
game is built on with its licenses, and the game itself, and roll slowly up the screen
like a film's, at `ROLL_PX_PER_S` (10 px a second; Brad, 2026-11-10). There are two rolls:

- **From the title menu** (its last row, Credits): under a fixed "Credits" heading, over
  the title music, looping back to the start once the last row has gone. Esc returns to
  the title, the music playing on.
- **After the last level of a run** ("All clear", then "Any key Credits"): the ending.
  It opens with "Thank you for playing" and the run's difficulty and total, then
  "Credits" and the sections, and stops on "The End" in the middle of the screen; any key
  then returns to the title. Esc jumps to The End. It plays `CREDITS_SONG_ID` from
  `songs.ts`, Sleepy Snow (Brad's pick from six, 2026-11-10), looping, faded in over 2 s. The run's level, effects and sounds are cleared
  first (`Game.#clearPlay`, shared with the way back to the title).

`CreditsRoll` holds the roll's state, apart from the drawing, so the tests can step it.
Up, down or Enter stops the roll with a cursor on the row that opens something nearest
the middle of the view; then up and down move between those rows, skipping headings and
text, the roll scrolling just enough to keep the cursor in view, and Enter opens the
row's page in a new tab. The line under the roll shows the selected row's license and
site, or what a library does. After `RESUME_MS` (4 s) with no input the cursor goes and
the roll carries on from where it is. Like the file picker, a new tab opens only during a
key press, click or tap, so a pad's confirm shows "Open: keys or touch". The rows sit in
one container, moved each frame and clipped by a mask, so a frame does no text work.

- **Songs** open their page on The Mod Archive (`sourceUrl` in the manifest). Imported
  songs and the test song have no page and aren't listed.
- **Code** opens license texts the build serves under `licenses/`, so they open offline
  too: `third-party.txt` from Vite's `build.license` (the npm packages in the main bundle:
  PixiJS and the packages it uses, and idb), and `libopenmpt.txt` and `workbox.txt`, which
  `vite.config.ts` copies in because `build.license` doesn't see them (libopenmpt is
  vendored rather than an npm package, and Workbox is in the service worker's own build).
  libopenmpt's license is BSD-3-Clause, which asks that binary copies carry its notice.
- **Game** opens the source code on GitHub.

The song lines elsewhere (the title's Levels line, the Jukebox, the level intro) name
the author only, "by Drozerix": no link and no license (Brad, 2026-11-10: Credits is the
one place for both; a canvas line can't be clicked, a URL doesn't fit, and the license on
every line was redundant).

### Leaderboards in the game

`game/net.ts` talks to the leaderboard server (see "Leaderboard server"). The player is an
Ed25519 key pair made with Web Crypto the first time the game opens the library, the
private key non-extractable, both kept in the library's `identity` store (IndexedDB
version 2). Browsers without Ed25519 in Web Crypto (Chrome before 137, Firefox before 129,
Safari before 17, per MDN) or without `crypto.subtle` (plain HTTP) play as before, with no
boards.

- **The name entry.** Game over and the clear screens ask for a name for any run that can
  be posted: one with no cheat, in a browser that can sign. `NameEntry` (name-entry.ts)
  shows "Name BRAD____", every place shown, the empty ones as underscores, the place under
  the cursor blinking. It starts with the last name posted under in this browser
  (localStorage `pattern-break.name`), the cursor on its first letter.
  - **Keyboard:** typing replaces the filled-in name, then types over the letter under the
    cursor and moves on; Backspace erases the filled-in name at once, then a letter at a
    time; left and right move the cursor; up and down cycle the letter under it through
    `NAME_CHARS` (A to Z, digits, a space, `. - ! ?`). Enter posts; Esc skips posting.
    R and S type letters while the entry is up, so the replay keys wait until it's done.
  - **Gamepad:** up and down cycle, left and right move, Y erases, A or Start posts, B or
    Select skips. The prompt shows the pad's buttons when the last press was a pad's.
  - **Touch** (`TouchTextEntry`): a page can only open a phone's keyboard by focusing a
    text field inside a touch's own event handler, so a touch on the end screen focuses a
    hidden input holding the name. The entry takes the input's whole text on every `input`
    event (`NameEntry.replace`), since a phone keyboard's key events often carry no key;
    the keyboard's Enter posts. The touch's compatibility `mousedown` would move focus off
    the input straight away, so a capture listener cancels it while the input is open.
    `#onKeyDown` lets keys from the input through untouched, except Enter and Esc.
  - Enter checks the name with the shared rules (`packages/core/src/name.ts`) first:
    "Name needed", "Bad name", "Name refused" (the vulgarity filter).
- **Posting.** A run from Levels goes on its song's board under the name entered. An arcade
  level goes on its song's board when it's cleared. When the arcade run ends, at a game
  over (with the levels cleared so far and the last try: a retry and a later end post
  again, and the board keeps the best) or after its last level, the run goes on the arcade
  board too, if every level went under the same name; a level skipped or posted under
  another name keeps it off (Brad, 2026-11-11). Each run goes into the library's `pending`
  store first, with its name, and is sent from there, oldest first except the run just
  posted, which goes ahead of the rest so its answer comes back at once. A run finished
  offline is sent at the next start or `online` event. A run the server answers, accepted
  or rejected, leaves the queue; only being offline stops the sending. A run queued before
  2026-11-11 has no name: it waits and goes under the next name posted.
- **The end screen's line,** above the prompt once the name is posted: "Sent" as soon as
  the run is in the queue, since from there it's sent whatever the player does next, then
  "Rank 3/12", "Queued" or "Not posted: score mismatch" when the server answers.
- **Scores,** on the title menu: rows for the board (Arcade, then each song with a hash)
  and the difficulty (Impossible once found), then the board's top 10, and "You 23" under
  the list when the place of the last name used on this device is lower. Each row is in
  its device's colour, `PLAYER_COLOURS[mark % 12]` (render/palette.ts: the theme's neons
  and LED colours, each at least 4.5:1 against the background, none amber, which marks the
  selected row; Brad, 2026-11-10), so two players with one name on different devices show
  apart. That place's row has a cyan "<" after the score. Columns: rank, name, the levels
  an arcade run reached when it ended in a game over ("L6", empty otherwise, so the scores
  stay aligned), score.
- Tests: `name-entry.test.ts` edits a name with keys and pad edits alone;
  `browser/touch-text.test.ts` focuses the input from a touch's pointerup and types into it
  in all three engines; `packages/core/test/name.test.ts` checks the filter against
  vulgarities and against innocent names that contain one.

`net.test.ts` runs `Leaderboards` against the real server in Node, through Fastify's
`inject`: Node's Web Crypto signs with Ed25519 as the browsers do.

### Renderer

- **Setup:** `createGameRenderer()` in `render/renderer.ts` asks PixiJS for WebGL
  (`preference: 'webgl'`) at 384x216, resolution 1, no antialiasing, `roundPixels` on, and
  nearest-neighbour texture sampling. The canvas's CSS size is 384x216 times the largest
  whole number of device pixels that fits the window, divided by `devicePixelRatio`
  (`integerScale(width, height, dpr)`), with `image-rendering: pixelated`, centred on black
  by `index.html`. Counting device pixels keeps every game pixel the same size: an 844x390
  phone at 3x gets 5 device pixels a game pixel (640x360 CSS px), where whole CSS pixels
  gave 1 (until 2026-11-10). `index.html` also sets `touch-action: none` and turns off text
  selection, so a touch doesn't scroll, zoom or select.
- **Layers,** back to front: the copper bars, the starfield, the world (terrain, tip sparks,
  capsules, enemies, shots, missiles, drones, the shield and bullets, ship, explosion, point
  popups), the HUD
  (the arsenal, multiplier and score, lives, shield pips), the game-over flash, and
  the UI (title screen, jukebox, controls, demo banner, messages, the pause menu, and the
  fade). With CRT on, the stage sits in a root container that carries the bloom, and a CSS
  overlay lies over the canvas.
- **Terrain** (`terrain.ts`, geometry in `terrain-layout.ts`): 41 columns
  (`MAX_VISIBLE_BARS`) of 46 sprites each, 23 a side (`SEGMENTS_PER_SIDE`, the most hard's
  50 px minimum gap allows), made once. Each frame moves the columns to the bars
  `visibleBars()` lists and tints each sprite: lit segment k is
  `LED_LIT[segmentColorIndex(k)]` (green at the screen edge, through amber, to red 12
  segments in, and red beyond).
  The walls drawn are the run's (`state.ceiling`, `state.floor`): each column keeps the
  segments it shows and repaints when they change, with rubble (an `Explosion` of 14
  particles in the wall's colour) where segments went. Falling blocks are a render group
  of their own (`blockLayer`): a container of 23 sprites per slot, shown and coloured once
  when its block starts falling and moved to its sim position each frame. Kept in the bars'
  group, the hidden ones would stay in its draw list at alpha 0 (see "Performance"). A
  block that shattered leaves rubble at its foot. Rubble is a third render group
  (`rubbleLayer`), so its particles don't rebuild the bars' draw list. The throttled perf
  check (4x, Hard, 30 s of The_Epic_Chip and Neon Techno) put this build within the noise of
  the one before, run twice in turn on the Unraid server: 95th percentiles 13.0 to 16.8 ms
  before against 14.3 to 15.3 ms after, the box being busy (2026-11-11). Unlit segments are hidden, so the passage is plain background. The scroll is rounded to a
  whole pixel once per frame, so bars never shift against each other. On Impossible the
  colours are `LED_RED`; with the LEDs setting on Colour-blind they are `LED_CIVIDIS` on
  every difficulty (`TerrainView.setColourBlind`): cividis (Nunez, Anderton and Renslow,
  PLOS ONE 2018), the colour map made to read nearly the same with red-green colour
  blindness, Matplotlib 3.9.2's entries from 0.1 to 1 in 11 steps, dark blue to yellow.
  Each segment is brighter than the one before (`test/palette.test.ts`), so depth reads
  from brightness alone; the neon's greens are brighter than its reds. The tip sparks take
  the same colours.
- **Ship** (`ship.ts`): a 16x8 sprite built from a character map, centred on the sim's
  `shipX` and `shipY`. The engine flame changes length every 1440 song samples (30 ms),
  and is longer while boosting.
- **Combat** (`combat.ts`, sprites from character maps in `pixels.ts`): `CombatView.draw()`
  draws the live enemies (up to 64), shots and bullets from the sim state. Turrets and
  tanks are placed from their world x against the terrain's drawn scroll, so they stay on
  their bars when the display runs a few ticks off the sim; ships and bullets use the sim's
  screen positions. It compares the state with the last draw to start a 16-particle burst
  for each enemy destroyed (8 at once at most) and the ship's explosion for a life lost,
  both timed in song time. It returns false on alternate 6-tick steps of the ship's safe
  time, which blinks the ship. The lives are ship icons on a dark panel in the top left,
  followed by a bomb icon, the multiplier when it is above 1, and a 7x7 amber ring per nuke held (3 at most); the score, 7 digits, is on a panel in the
  top right and changes only when the score does. Each kill's points rise 8 px over 600 ms
  from where the enemy was (8 popups at once at most). The bomb icon is drawn dim, with
  its bottom rows bright: none while a bomb falls, then filling over the reload
  (`state.bombReadyTick`), whole when one can drop. The bomb is a 4x4 sprite; its burst
  is a 40-particle explosion over 600 ms, and a nuke flashes the playfield like the crash
  (see "Flashing and shake"), under the HUD. An angled double shot is a 4x4 diagonal, a laser a
  16x2 white bar. A missile is an 8x4 sprite; each slot's burst is a 28-particle cyan
  explosion over 500 ms. Drones are 6x6 orbs, capsules 8x8 amber pills marked P, and the
  shield a 22x14 ring around the ship, more opaque with more points left (30% at 1 to 80%
  at 6), blinking with the ship. A hit flickers it white for 30 ticks, 3 on and 3 off,
  even when the hit emptied it. Enemy bullets are drawn by the kind that fired them
  (`Textures.bullets`): a ship's a 4x4 magenta and white dot, a tank's a 4x4 lime block, a
  turret's a 6x6 amber pellet (the hitbox is 4x4 for all three). An extra life shows a
  lime "1UP" rising from the ship, in the popups' pool. The missile icon follows the bomb icon once unlocked and fills the
  same way over `MISSILE_RELOAD_TICKS`.
- **Starfield** (`starfield.ts`): 112 stars in three layers placed by `seededRandom(seed)`,
  scrolling at 0.12, 0.25 and 0.5 of the terrain's speed.
- **Copper bars** (`copper.ts`; `test/copper.test.ts`): five 14 px bands behind the stars,
  violet, cyan, lime, amber and magenta, each stepped from 0.3 of its colour at the edges
  to full in the middle, 36 px apart. They sway together (20 px, a 5.3 s sine) and each
  ripples (8 px, 2.1 s, out of step), never overlapping, on song time. `songLook(levelData)`
  takes the bass (the loudest of spectrum bands 0 to 3, 40 Hz to about 179 Hz, per
  analysis frame) and the downbeats (rows that are multiples of 16, OpenMPT's default rows
  per measure, `DEFAULT_ROWS_PER_MEASURE` in soundlib/Snd_defs.h; libopenmpt can report a
  pattern's own value, which LevelData doesn't keep). The bars' opacity is 0.12 plus
  `COPPER_SWING` times 0.7 of the bass plus 0.5 of a downbeat pulse fading over 250 ms,
  capped at 1. That pulse is the "flash on downbeats". With Flashing Reduced the swing is
  0.24, so lime, the brightest, moves 0.08 in relative luminance, under WCAG's 0.1 for a
  flash; Full swings 0.48. The game keeps a `SongLook` per level (`Game.#looks`) and
  `#showLevel` hands it to the bars and the sparks; capture mode makes its own.
- **Tip sparks** (`sparks.ts`; `test/sparks.test.ts`): when a row with a note starting on it
  (`SongLook.noteRows`) begins, 5 sparks leave its bar's ceiling tip and 5 its floor tip,
  out into the passage within 1.1 rad of straight, at 45 to 115 px/s, falling at
  320 px/s squared, white turning to the tip's colour and fading over 200 to 360 ms; one
  in two is 2 px wide. Each spark's numbers come from `hash32(bar, spark)`, and the sparks
  are drawn fresh from song time each frame from a pool of 96, newest first.
- **Hit flash** (`CombatView`; `test/hit-flash.test.ts`): an enemy whose hits left drop
  without reaching 0 (only tanks have more than one, `ENEMY_HP`) is drawn all white
  (`Textures.tankHit`) for 70 ms of song time. `CombatView` keeps each enemy's hits left
  from the last draw to see it, sized to the level, cleared when the song starts over.
- **CRT** (`crt.ts`; `test/crt.test.ts`): on by default (Brad, 2026-11-10); capture mode
  leaves it off unless `crt=1`. The bloom is a GLSL filter on the
  root container at 384x216: each pixel adds 0.35 of its neighbours' bright parts
  (luminance through a smoothstep from 0.35 to 0.9), 12 taps out to 2 px. Its
  `uInputSize` and `uInputClamp` are `highp`, as in Pixi's default filter vertex shader;
  with a mismatch the program fails to link and the picture goes black. WebGL only, so
  with WebGPU the CRT look has no bloom. The scanlines and vignette are a CSS background on
  a div over the canvas, sized with it in `resize()`: a dark band (0.32 black) over the
  bottom 35% of each game pixel row at the screen's resolution, only from 2 device pixels
  per game pixel up, and a radial darkening from 62% out to 0.45 black at the corners.
- **Text** (`font.ts`, `text.ts`): a 5x7 pixel font for printable ASCII, with descenders,
  in one atlas texture. A character outside printable ASCII draws as `?`. `PixelText`
  reuses its sprites when its text changes.
- **Crash** (`ShipBreakup` in `effects.ts`; `test/breakup.test.ts`): the ship breaks apart
  pixel by pixel. Each of its sprite's 60 lit pixels (`SHIP_PIXELS`) starts where it was
  drawn, in its own colour, and flies outward from the sprite's centre (the vertical
  counted double, so it spreads beyond the flat ship; nose and tail faster; up to 0.45 rad
  of scatter), slowing with drag and fading to the background over 0.7 to 1.3 s. 24 white
  and amber sparks fly with them. A shockwave ring of 96 2x2 dots grows to 44 px over
  520 ms, fast then slowing, in four arcs of cyan, lime, amber and magenta that turn as it
  grows, fading from `RING_PEAK` (0.65 with Flashing Reduced, 1 with Full). Then a shake,
  and on the last life one white flash. `CombatView` plays it for a life lost, the renderer
  (`GameRenderer.explosion`) on game over.
- **Flashing and shake** (`flash.ts`, `shake.ts`; `test/flashing.test.ts`). Every flash
  fades linearly over 220 ms from a peak: the game-over flash (`Flash`), the nuke's
  (`CombatView`), and the hangar's red strobe (`strobeAlpha`). One `FlashGate` on the
  renderer decides which in-play flashes show, on the song clock. With Flashing Reduced the
  peak is 0.25 white and a flash starts at most every 334 ms, so never more than three in
  any second: WCAG 2.2 counts content with no more than three general and three red flashes
  in any one-second period as below its flash thresholds (definition "general flash and
  red flash thresholds"). A flash asked for inside the gap isn't drawn. Full raises the peak
  to 0.6 and drops the gap. The strobe flashes twice a second at either setting. Every
  crash, the last included, shakes the starfield and the world (not the HUD or the
  screens) by whole pixels: a new offset every 30 ms, within 3 px shrinking to 0 over
  300 ms, from a hash of the crash tick, so a replay or capture shakes the same way. In
  play the time is song time since `state.hitTick` (`drawPlay`); on game over, wall time.
  The frame loop puts the picture back first each frame, and with Shake off
  `shakeOffset` is always 0.
- **Allocation:** display objects are made at startup or when a screen changes. The
  per-frame path in play only writes positions and tints and allocates nothing in our code
  except the score and popup strings on a kill;
  PixiJS's own render call has not been audited.

### The frame loop

Each animation frame in play (`game.ts`; the pure parts are in `loop.ts` and tested in
Node):

1. Read `player.songTimeSamples()` once.
2. `targetTick(samples, level.tickCount)` is `floor(samples / 400)`, clamped to 0 before the
   song starts and to `tickCount` after it ends.
3. `catchUp()` runs `tick()` until the sim reaches that tick, the ship crashes, or the song
   ends. It never skips a tick. Each tick takes one input byte from `InputSampler.sample()`
   and appends it to the run's `InputLog`, a buffer of one byte per tick of the song, made
   when play starts from the title screen and reused by retries.
4. `DisplayClock` gives the song position to draw. The clock moves in steps of one audio
   callback (see "Audio and clock"), so it predicts from the frame time and eases towards
   each reading, snaps when they differ by more than 50 ms, and stays within 3 ticks ahead of
   and 2 behind the sim. `scrollPxAt()` interpolates the scroll table at that position. This
   is cosmetic; the sim only reads whole ticks.
5. Draw and render.

**Input.** `KeyMap.bit()` maps each bound key to its action's sim bit (by default arrows
and WASD to the movement bits, and Space, Z and J to fire; menus use `KeyMap.menuAction()`,
above). A key held during a frame sets
its bit on every tick that frame runs, and a key pressed and released between two ticks
still sets its bit for one tick.

**Pause.** Esc calls `player.pause()`, which suspends the audio context. The clock stops, so
the sim stops with it; resuming continues both from where they were.

**Crash and song end.** A life lost short of the last plays an explosion where the ship
was and the run goes on (`CombatView`). When `state.dead` is set, the song stops, the picture holds the
crash tick, and the explosion, flash and shake play on the wall clock. A retry calls
`resetSimState()` and `player.start()`, which plays the song from its start. When
`state.finished` is set, the "Song complete" message shows. Either way the run's difficulty,
input log and crash tick are kept in `Game.lastRun` for the replays in M2.

**Analysis.** `analyzeInWorker(bytes, tempoPermille)` (`analysis.ts`) sends the song file's
bytes and the difficulty's tempo to
`analysis-worker.ts`, a module worker that runs `loadOpenMpt()` and `analyze()` and sends
back the serialized LevelData as a transferred buffer. The main thread deserializes it and
calls `generateLevel()` for the chosen difficulty. The screen reads "Loading" until
both the analysis and the audio player are ready. Each song's bytes, its LevelData per tempo
and its levels are kept for the session, so a second run of a song starts at once. The
player loads a run's song at its difficulty's tempo (`player.load(bytes, tempoPermille)`);
the title music, jukebox and game-over music play at 1000, the song as written. The demo
uses normal, whose tempo is also 1000, so it matches the title music. The AudioContext is
created inside the key press that starts play or opens the jukebox, because browsers only
let audio start from a key press or click.

### Performance

Measured on 2026-11-08 in headless Chromium 153 in the cloud development container, with
`?autopilot=1&perf=1` over the whole fixture song on normal (2965 frames). The per-frame
JavaScript cost (sim catch-up, drawing, and PixiJS's render call) was 0.52 ms on average,
0.5 ms at p50, 0.9 ms at p95 and 1.2 ms at p99. The slowest frame took 5.2 to 7.5 ms over
three runs; which frames those were has not been traced. `performance.now()` is rounded to
0.1 ms in a page that isn't cross-origin isolated, so these values are coarse.

Headless Chromium renders WebGL with SwiftShader on the CPU, and that GPU-side time is not
in the number, so the headless frame rate says nothing about real hardware. M1's 60 fps check
is done by hand in desktop Chrome. `PLAN.md` sets a target of 2 ms or less per frame of sim
and render work on desktop.

**The Perf setting** (2026-11-11, Brad: a screenshot of the end screen is quicker on a
phone than reading the corner mid-run). Settings, Perf On turns on what `?perf=1` does,
kept with the settings. `PerfMeter` (`game/perf.ts`) keeps every frame's work in a ring
of 72 000 (ten minutes at 120 Hz, 288 KB, made the first time the stats are on) and counts
frames since the run started. When a run ends in game over or a clear, `perfReport` adds
three lines above the prompt:

- `Perf  Level 3  CHiP_OVERTURE  Hard`: where (an arcade level, or Levels for one song), the
  song and the difficulty;
- `59.8 fps  6345 frames  915x412 x2.63  CRT on`: frames a second over the run, the frames,
  the window in CSS px with its device pixel ratio, and the CRT setting, which costs GPU
  time that the work figures don't show;
- `Work ms  mean 2.1  p95 4.3  p99 6.0  max 12.4`: the frames' JavaScript work.

A run counts from the start of play to the crash or the song's end, paused time included. The report is made when the run ends, so it stays the same after watching the
replay.

**The throttled check** (`tools/perf-check.ts`, M6). After `pnpm build`, it serves the client,
plays each bundled song's level on Hard in headless Chromium with the autopilot and infinite
lives (the Konami code), turns on Chrome's CPU throttling once play starts
(`Emulation.setCPUThrottlingRate`), starts the meter again (`window.__pbPerfReset()`), and
reads it after `--seconds`. It prints a row per song and exits 1 if the worst 95th percentile
is `--limit` ms (default 8) or over. `--dist` serves another build, for before and after
comparisons. The "Perf check" workflow (`.github/workflows/perf.yml`, started by hand from
the Actions tab, with the rate and seconds as inputs) runs it on a runner with nothing else
on it. A CPU profile of the same run (CDP `Profiler`, on a `vite build --minify false`)
shows where the time goes.

**What Pixi does with visibility** (Pixi 8.22 source, `Container.visible` and
`collectRenderablesMixin`). Setting `visible` to a new value marks the render group's
structure changed, and Pixi then rebuilds that group's whole draw list
(`_buildInstructions`). `alpha` only marks a colour update, and `collectRenderables` skips
by display status, not alpha, so a sprite at alpha 0 stays in the list. The `tint` setter
parses its colour on every call, even an unchanged one. So:

- **The terrain** is a render group. Each column of LED sprites sits at its bar's world x
  (column = bar mod `MAX_VISIBLE_BARS`), scrolling moves the group, and a column is set
  again only when it takes a new bar. A segment that isn't drawn has alpha 0. Before this,
  every segment's `visible`, `x` and `tint` were set every frame and the scene's draw list
  was rebuilt every frame.
- **Combat sprites, the sparks and the HUD** are render groups of their own, so their
  sprites coming and going rebuild only their own small lists.

Measured on 2026-11-11 on the Unraid host (Xeon E5-2640, 12 threads, load average 15 to 24
from its other containers, so the numbers run high and vary by a ms or two):

| Neon Techno, Hard, 4x throttling | mean | p95 |
| --- | --- | --- |
| Before (two runs) | 13.6, 14.5 ms | 23.8, 25.6 ms |
| Terrain as a render group | 7.2, 7.3 ms | 14.1, 15.0 ms |
| Plus combat, sparks and HUD as groups | 6.6, 7.0 ms | 12.7, 13.7 ms |

Over all 16 bundled songs at 4x (30 s each, with every change above), the 95th percentile
ran from 12.8 ms (Neon Techno) to 17.8 ms (Girl From Mars). The songs differ little, so most
of the cost is the same every frame. Without throttling, Keygen 9000 took 1.6 ms on average
and 3.7 ms at p95. The 8 ms target under 4x throttling is not met on this host.

Brad's PC (2026-11-11, Chrome, a 1536 x 695 window at device pixel ratio 1.25, CRT on),
from the Perf report on game over: Neon Techno on normal, 1540 frames at 59.9 fps, frame
work 1.0 ms mean, 1.9 ms p95, 2.5 ms p99 and 33.5 ms at most.

The "Perf check" workflow's first run (2026-11-11, commit `3c11c14`, 4x, 30 s a song) on a
GitHub runner with nothing else on it came close: the 95th percentile ran from 5.9 ms
(Chica-pop!) to 9.6 ms (The_Epic_Chip), and the mean from 1.8 to 3.8 ms. Three songs were
over 8 ms: The_Epic_Chip (9.6), Neon Techno (8.7) and RNDD_Keygen#1.0 (8.6). These are
the first three levels the check plays, so part of it may be the browser warming up; not
yet checked.

## Leaderboard server

`packages/server` (docs/PLAN.md, "Server"). One Fastify process answers `/api` and hands
every other path to `static.ts`, which serves the built client as before. Node runs the
TypeScript directly, but not from inside `node_modules`, so the image keeps the workspace
layout, with `packages/core` and `packages/analysis` linked from `node_modules` as in the
repo (see the Dockerfile).

### The API

| Request | Signed | Answer |
|---|---|---|
| `GET /api` | no | `{ genVersion, simVersion }` |
| `POST /api/runs` | yes | `{ kind: 'song' \| 'arcade', name, replays: [base64] }`. `name` follows `packages/core/src/name.ts`: 422 `{ status: 'rejected', reason: 'bad name' }`, or `'name refused'` from the vulgarity filter. Answers `{ status: 'needModule', hashes }`, `{ status: 'accepted', runId, score, rank, players }`, or 422 `{ status: 'rejected', reason, level }`. A key's first run makes its player. |
| `PUT /api/songs/:hash` | yes | The song file as `application/octet-stream`, up to 4 MB. 403 from a key that has sent no run; 422 when its SHA-256 isn't `:hash`; 201 when stored, 200 when the server had it. |
| `GET /api/songs/:hash` | no | `{ hash, title, author, bundled, license, sourceUrl, players }`, or 404. |
| `GET /api/leaderboards/:hash?difficulty=&limit=&name=` | no | A song's board: `{ genVersion, simVersion, top, you, players }`. `limit` is 1 to 100, default 10. `you` is the place of the `X-PB-Key` header's key under `name`, or its best place under any name. `players` counts each key and name once. |
| `GET /api/leaderboards/arcade?difficulty=&limit=` | no | The arcade board, the same shape. Entries have `levels`, the levels the run reached. |
| `GET /api/replays/:sha` | no | A listed run's replay file, by the SHA-256 a board entry names. |

A board lists the best run of each key and name: the highest score, the earlier run first
on a tie. Each entry has `mark`, the first 32 bits of the SHA-256 of the key, so the game
can colour a device's rows the same everywhere without the key being sent. A replay sent
again under another name keeps the name it was first sent under.

The name is a column of `runs`. A database from before 2026-11-11, when the name and a link
lived on `players`, is brought up to date on open (`Database.#migrate`): each run takes its
player's name, and `players` is rebuilt without the name and link by the copy-and-rename
steps in the SQLite docs ("Making Other Kinds Of Table Schema Changes"), since SQLite can't
drop a UNIQUE column. `node:sqlite` opens with foreign keys on (Node docs,
`enableForeignKeyConstraints`, default true), so they're off until the migration is done.

### Signing

A player is an Ed25519 key pair; the public key names them. A signed request carries
`X-PB-Key` (the 32-byte public key, base64url), `X-PB-At` (milliseconds since 1970) and
`X-PB-Signature` (64 bytes, base64url) over the UTF-8 of `"<METHOD> <url>\n<at>\n"`
followed by the body's bytes, where `<url>` is the path and query as sent. The server turns
down a time more than 10 minutes from its clock. A run sent twice is kept once.

### Checking a run

`checker.ts`, in the worker thread from `check-worker.ts`, one check at a time. For each
replay, in order, it turns the run down with one of these reasons:

| Reason | When |
|---|---|
| `bad replay` | The bytes don't decode, or a song run has more than one replay. |
| `wrong songs` | An arcade run's songs aren't the arcade's (`music/arcade.json`) for its difficulty, in order. |
| `mixed difficulty` | An arcade run's levels aren't all one difficulty. |
| `old version` | The replay's `GEN_VERSION` or `SIM_VERSION` isn't the server's. |
| `cheat` | The replay has cheat flags. Impossible counts like any difficulty (Brad, 2026-11-10). |
| `song unreadable` | libopenmpt can't analyse the song. |
| `not ended` | The inputs stop before a game over or the song's end. |
| `score mismatch` | The replayed score isn't the replay's score. |
| `level not cleared` | An arcade level before the last ended in a game over. |

An accepted arcade run goes on the arcade board, and each of its levels on that song's
board. The level comes from the song's LevelData, cached in `data/levels/` as
`<hash>-<tempo>-<GEN_VERSION>.level` and the last 32 Levels in memory.

Measured in the container on Brad's Unraid server (Xeon E5-2640, 2026-11-10), on autopilot
runs: the first check of a song took 3.0 to 3.3 s (Neon Techno on normal, Keygen 9000 on
hard, Crush on Impossible), nearly all of it the analysis; the next checks took 5 to 15
ms, and 21 to 33 ms with the LevelData read from the disk cache after a restart. So the
server checks every run; checking only runs that reach a top 10 (the fallback the roadmap
allowed) isn't needed.

### Rate limits

Per IP (`@fastify/rate-limit`), and for signed requests a second limit per key:

| Route | Per IP | Per key |
|---|---|---|
| `POST /api/runs` | 30 a minute | 20 a minute |
| `PUT /api/songs/:hash` | 20 an hour | 10 an hour |
| Each `GET` | 120 a minute | |

Behind a reverse proxy, set `TRUST_PROXY` to its address, or every player shares the
proxy's IP.

## Reusable parts

Parts that don't depend on the game and could go into another project (Brad, 2026-11-09).
All are MIT licensed with the rest of the repository.

| Part | Where | Needs |
|---|---|---|
| Sound effect generator (sfxr style) | `packages/chipfx` (its README) | nothing |
| Effects mixer: echo, generated reverb, voice limit by priority | `packages/client/src/audio/mixer.ts` | chipfx and an effects table like `effects.ts` |
| Menu sounds as chip notes | `packages/client/src/audio/sfx.ts` | Web Audio |
| libopenmpt built to WebAssembly, with a fixed playback seed | `tools/build-libopenmpt.sh`, `tools/libopenmpt/`, `packages/analysis/vendor/libopenmpt/` | emsdk to rebuild |
| Module player in an AudioWorklet, and a latency-corrected song clock | `packages/client/src/audio/player.ts`, `worklet.ts`, `clock.ts` | the libopenmpt build |
| Screenshot and animated GIF pipeline driven by a shot list | `tools/screenshots/` | Playwright, gifenc, a page with a capture mode |
| Writing-rules check (banned words and characters) | `tools/check-docs.ts` | Node |
| Determinism lint plugin for Oxlint | `tools/lint/determinism-plugin.js`, `.oxlintrc.json` | Oxlint |
| Static file server with cache headers and `/healthz` | `packages/server/src/static.ts` | Node |

## The docs check

`tools/check-docs.ts` reads every file git tracks or would track, except
`pnpm-lock.yaml` and binary files, and:

- fails on an em-dash or an emoji in any of them
- fails on a never-list word in Markdown prose (code spans and fenced blocks are skipped)
- lists check-every-time words without failing

`docs/DOC-STYLE.md` is exempt from the word checks, because it lists the words. The word
lists themselves are in `DOC-STYLE.md`, "Plain wording"; keep the script and the guide in
step.

## Changelog and roadmap

`CHANGELOG.md` is the project's history, kept by whoever finishes the work; its wording
needs no approval. Player-facing release notes wait until the finished game is published
(Brad, 2026-11-09).

- **A finished roadmap item leaves `ROADMAP.md`**, its "At a glance" row and its section
  together, and becomes an entry in `CHANGELOG.md`. A milestone is finished when the
  acceptance checks the agent can run pass; it doesn't wait for Brad's play-test, and what
  the play-test finds becomes new roadmap items (Brad, 2026-11-09).
- **A test that needs a person or real hardware** goes in `PLAYTEST.md`, with why it's
  needed and what to look for; Brad runs them as time allows, and what one finds becomes a
  roadmap item (Brad, 2026-11-11). Remove a test once it's reported.
- **A new roadmap item** gets an "At a glance" row (one plain sentence and a stage) and, once
  planned, its own section with tasks, acceptance checks, and a **Docs:** line naming the
  files the work will change.
- **Changelog entries** are dated with the day the work lands on `main`, in
  America/New_York time (`TZ=America/New_York date`). If today already has an entry, add to
  it.
- **Item format:** `* **Category: Label.** Sentence saying what changed and why it matters.`
  One goal is one item, however many commits it took. Don't log a defect that was introduced
  and fixed before anyone could hit it.
- **Sections:** **Milestones** until the game is playable; after that, **New Features**,
  **Improvements**, and **Bug Fixes**, in that order.
