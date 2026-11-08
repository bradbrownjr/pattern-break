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
| `pnpm test:browser` | The golden LevelData, level and sim tests and the client's audio and renderer tests in real browsers (see "Tests"). |
| `pnpm --filter @game/analysis analyze <file>` | Analyzes one module (a song file made in a music tracker) and prints its LevelData hash and a summary. |
| `pnpm screenshots` | Regenerates every figure in `docs/img/` (see "Screenshots"). |
| `pnpm --filter @game/analysis bench:sim [file]` | Builds each difficulty's level, flies it with the autopilot, and prints sim ticks per second. |
| `pnpm check:docs` | The writing-rules check (`tools/check-docs.ts`). |
| `pnpm gen:tables` | Regenerates `packages/core/src/spectrum/tables.generated.ts`. |
| `pnpm check` | Lint, type-check, tests, and the docs check, in that order. |

One package: `pnpm --filter @game/core test`. One test file:
`pnpm --filter @game/core exec vitest run test/determinism-lint.test.ts`.

## Project structure

```
pattern-break/
├── .github/workflows/ci.yml       # checks, build, and the golden test in three browser engines
├── .github/workflows/docker.yml   # builds the image, pushes it to ghcr.io (see SELF-HOSTING.md)
├── Dockerfile                     # the play-test image: built client plus the static server
├── deploy/                        # docker-compose.yml and the Unraid template
├── .oxlintrc.json                 # lint config; the core determinism rules are its override
├── docs/
│   ├── PLAN.md                    # design, rules, tech choices
│   ├── ROADMAP.md                 # what comes next
│   ├── CHANGELOG.md               # what is finished
│   ├── DEVELOPMENT.md             # this file
│   ├── SELF-HOSTING.md            # running the Docker image: Docker, Compose, Unraid, HTTPS
│   └── DOC-STYLE.md               # writing and voice
├── music/manifest.json            # bundled modules and their licenses (empty until M4)
├── packages/
│   ├── core/                      # @game/core: deterministic levelgen, sim, PRNG, replays
│   │   ├── src/version.ts         # GEN_VERSION, SIM_VERSION, TICK_HZ, ANALYSIS_SAMPLE_RATE
│   │   ├── src/analysis-constants.ts  # the analysis pass parameters
│   │   ├── src/level-data/        # LevelData types and binary format
│   │   ├── src/spectrum/          # FFT, band and LED analysis, generated tables
│   │   ├── src/playfield.ts       # playfield geometry and tick timing
│   │   ├── src/levelgen/          # generateLevel, the path check, Level bytes
│   │   ├── src/sim/               # tick, collision, the autopilot
│   │   └── test/determinism-lint.test.ts
│   ├── analysis/                  # @game/analysis: libopenmpt wrapper, produces LevelData
│   │   ├── src/analyze.ts         # the analysis pass
│   │   ├── src/openmpt.ts         # the libopenmpt binding
│   │   ├── scripts/analyze.ts     # prints a module's LevelData hash
│   │   ├── vendor/libopenmpt/     # the pinned WASM build (see "libopenmpt build")
│   │   ├── scripts/bench-sim.ts   # sim ticks per second on a module
│   │   ├── fixtures/              # test modules and golden.json, their pinned hashes
│   │   └── vitest.config.ts       # the node and browser test projects
│   ├── client/                    # @game/client: the Vite app
│   │   ├── src/config/brand.ts    # the game's name, in one place
│   │   ├── src/audio/             # the libopenmpt AudioWorklet player and the song clock
│   │   ├── src/render/            # PixiJS renderer: terrain, ship, starfield, pixel font, effects
│   │   ├── src/game/              # game flow, frame loop, input, analysis worker, capture mode
│   │   ├── audio-debug.html       # dev-server page that plays the fixture and shows the clock
│   │   └── vitest.config.ts       # the node and browser test projects
│   └── server/                    # @game/server: static file server now; leaderboard API and replay validator (M5)
│       ├── src/static.ts          # serves the built client: MIME types, cache headers, /healthz
│       ├── src/main.ts            # entry point (PORT, CLIENT_DIST)
│       └── test/static.test.ts
├── tools/
│   ├── check-docs.ts              # writing-rules check
│   ├── screenshots/               # pnpm screenshots: the shot manifest, PNG reader, GIF writer
│   ├── build-libopenmpt.sh        # rebuilds the vendored libopenmpt WASM
│   ├── libopenmpt/*.patch         # our patches to libopenmpt (see "libopenmpt build")
│   ├── make-fixture-mod.ts        # writes the test modules in packages/analysis/fixtures
│   ├── gen-spectrum-tables.ts     # writes core's spectrum tables
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
  gets DOM and `vite/client`; the server gets Node. Core and analysis type-check their
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

`LevelData` is the output of the analysis pass: `analyze(openmpt, bytes)` in
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
  explicitly too (`RENDER_CTLS` in `analyze.ts`): `play.at_end` is `stop`, because the
  default `fadeout` renders a fade after the song ends; Amiga resampler emulation is on;
  subsong 0 only.
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
| `formatVersion` (1), `genVersion` | u32 each |
| `libopenmptVersion` | str |
| `params`: sampleRate, chunkFrames, hopFrames, fftSize, bandCount, bandLowHz, bandHighHz, ledLevels | u32 each |
| `params.ledBottomDb` | i32 |
| `params`: ledStepDb, vuScale, maxDurationSamples | u32 each |
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
  0 to n - 1 lit. A peak p above the level lights segment p - 1 as a peak dot.
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

For each bar in order, with the previous bar's final values:

1. **Band value:** the ceiling reads left band `i mod 16`, the floor right band
   `15 - (i mod 16)`. A frame f belongs to the row spanning `[start, end)` if its window
   centre `(f + 1) * 800 - 1024` is in it; the value is the maximum over those frames.
   With none, the frame whose centre is nearest `start` is used (the earlier on a tie).
2. **Minimum gap:** the ceiling and floor together may light at most
   `floor((216 - minGap) / 7)` segments: 17 on easy (96 px), 20 on normal (72 px), 22 on
   hard (56 px). Above that, the ceiling becomes `floor((2 c M + (c + f)) / (2 (c + f)))`,
   which is `c M / (c + f)` rounded half up, and the floor gets `M - ceiling`.
3. **Gap movement:** twice the gap centre is `7 (c - f) + 216`. It may move from the
   previous bar's by at most twice `gapShiftLimitPx(previous row length)`: the ship's
   straight travel in that time, `floor(384 * samples / (400 * 256))` px, but never more
   than the minimum gap minus 10 px (`MIN_GAP_OVERLAP_PX`, the hitbox height plus 4), so
   consecutive gaps overlap by at least 10 px. If the gap moved down too far, the ceiling
   loses segments until it fits or reaches 0; if up, the floor does. A side that reaches 0
   leaves a gap that contains the previous one.
4. **Peak hold:** a level at or above the peak sets the peak and a 6-bar hold
   (`PEAK_HOLD_BARS`). Otherwise the hold counts down, and once it is 0 the peak drops one
   segment per bar. Peaks are never below their levels.
5. **Peak gap:** if the two peaks together exceed the segment budget of step 2, the
   ceiling peak is lowered first (down to its level), then the floor peak.
6. **Hard only:** peaks are solid, so step 3 runs again on the peaks. A peak is lowered
   first; once it equals its level, both go down together.

`findPathViolation(level)` in `levelgen/path-check.ts` checks the guarantee: every bar's
solid gap (peaks on hard, levels otherwise) is at least the minimum, and every centre move
is within the limit unless the new gap contains the old one. Tests run it on random loud
songs at every difficulty and on each fixture.

### Simulation

- **Ticks:** `level.tickCount` is `ceil(totalSamples / 400)`. `state.tick` counts the ticks
  run, so the state shows song sample `400 * state.tick`. `tick()` moves the ship, clamps
  it, increments `state.tick`, then tests collision at the new tick. It does nothing once
  `state.dead` or `state.finished` is set.
- **Input bits** (`InputBit`, one byte per tick): up 1, down 2, left 4, right 8, fire 16,
  bomb 32, buy 64. Only movement does anything in M1. Opposite directions cancel.
- **Ship:** 384 Q8 (1.5 px) per tick straight. Diagonals move 272 Q8 on each axis
  (384 / sqrt 2, rounded), about 1.503 px per tick in total. The centre stays within
  x 16 to 160 and y 3 to 213, so the hitbox never leaves the screen. It starts at (64, 108).
- **Collision:** the hitbox against the solid part of every bar it overlaps horizontally:
  lit segments, plus peak dots on hard. Integer comparisons only.
- **Death:** `state.dead` and `state.deathTick` (the value of `state.tick` after the fatal
  tick). M1 restarts the song on death; `state.lives` is there for later.
- **Running a log:** `runInputLog(level, inputs, state?)` runs from the state's current
  tick until the log ends, the ship dies, or the song ends. `resetSimState` reuses a state.
- **Autopilot:** `autopilotInputs(level)` in `sim/autopilot.ts` flies a level by looking
  24 ticks ahead and records its input log. Tests use it to show the path exists; it never
  moves horizontally.
- **Speed:** `pnpm --filter @game/analysis bench:sim` on the fixture ran 12.5 to 13.7
  million ticks per second in Node 26 in the cloud development container (checked
  2026-11-08), about 100 000 times real time.

## Versions to bump

`packages/core/src/version.ts`:

- **`GEN_VERSION`**: bump when level generation output changes for any input.
- **`SIM_VERSION`**: bump when simulation output changes for any input.

Leaderboards are keyed on `GEN_VERSION`, so a bump starts fresh boards. Update the golden
snapshots in the same commit as the bump. Both are 0 until the first release.

## Tests

Vitest runs per package. Packages with no tests yet run with `--passWithNoTests`; drop the
flag when a package gets its first test.

**Golden hashes.** `packages/analysis/fixtures/golden.json` pins the SHA-256 of the
serialized LevelData for each fixture, with the `GEN_VERSION` and libopenmpt version it was
made with. `test/golden.test.ts` analyzes each fixture and compares. Change a hash only in
the same commit as a `GEN_VERSION` bump.
`packages/analysis/fixtures/golden-levelgen.json` pins, for each fixture and difficulty,
the SHA-256 of `serializeLevel(level)` and of `serializeSimState` after two scripted runs:
the autopilot (which must survive) and a fixed zigzag log (which crashes, at the recorded
`zigzagDeathTick`). The same test checks them in Node and in the browsers. A Level hash
changes only with a `GEN_VERSION` bump, a sim hash only with a `SIM_VERSION` bump.

**Browsers.** The analysis package's `vitest.config.ts` has two projects. `node` runs every
test in Node and is what `pnpm test` runs. `browser` runs the golden test in real browsers
through Vitest browser mode and Playwright, and is what `pnpm test:browser` runs. Every
engine has to produce the committed hash, which is how we know Node and the browsers build
identical levels.

The client's `vitest.config.ts` has the same two projects. Its `browser` project runs
`test/browser/audio.test.ts`, the worklet and clock tests in "Audio and clock", and
`test/browser/render.test.ts`, which draws a hand-made level with WebGL and checks canvas
pixels against the terrain rules and the palette. Each engine
is launched with audio allowed to start without a click: Chromium with
`--autoplay-policy=no-user-gesture-required`, Firefox with the `media.autoplay.default` and
`media.autoplay.block-webaudio` preferences, WebKit with Playwright's defaults.

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
| `scene` | Which screen to show: `title` or `play`. |
| `song` | Song id from the bundled manifest. |
| `t` | Song clock in seconds. |
| `difficulty` | Difficulty name. |
| `seed` | Integer seed for cosmetic randomness. Default 1. |

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

- **`scene=title`** draws the title screen with the song and difficulty, and the prompt
  steady instead of blinking. The stars sit where `t` puts them.
- **`scene=play`** analyzes the song in the analysis worker, builds the level for
  `difficulty`, records `autopilotInputs(level)`, and runs the sim from tick 0 to
  `floor(round(t * 48000) / 400)` with that log, through the same `catchUp` the game loop
  uses. It then draws the frame at song sample `round(t * 48000)`, the scroll interpolated
  between ticks as in play. If the autopilot crashed before `t`, the frame shows the crash,
  timed from the crash tick in song time.
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
  changes; past 256, gifenc's quantizer builds one from all the frames. The game's flat
  colours keep it exact: `gameplay-clip` uses 28.
- GIF frame delays are whole hundredths of a second, so `fps` must divide 100; the script
  rejects other values.
- The script fails a clip over 5 MB. Keep clips a few seconds long: `gameplay-clip` is 4 s at
  25 fps, 100 frames, about 1.9 MB.

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

Firefox and WebKit run the same tests in CI only; their latency reporting and
`currentTime` step size are not measured here.

## Renderer and game loop

`packages/client/src/render/` draws the game with PixiJS 8.22.0 (MIT, checked 2026-11-08),
and `packages/client/src/game/` runs the screens and the frame loop. The design is in
`PLAN.md`, "Visual spec" and "Client UI"; the coordinates are in "Level and sim" above.

### Playing it

Run `pnpm dev` and open the URL it prints. The title screen shows the one bundled song, the
generated test module `pb-fixture-01.mod`. Keys 1, 2 and 3 pick easy, normal or hard (normal
to start with); any other key, or a click, starts. Arrows or WASD move, and Esc pauses and
resumes. After a crash, any key restarts the song; at the song's end, any key goes back to
the title. Both screens ignore keys for 0.7 s, so a key still held from play doesn't skip
them. The game pauses when the window loses focus or the tab is hidden.

Two query parameters help in development:

| Parameter | Effect |
|---|---|
| `autopilot=1` | `autopilotInputs(level)` flies the ship; the keyboard doesn't move it. |
| `perf=1` | Records the cost of each frame. `window.__pbPerf()` in the console returns the mean, p50, p95, p99 and maximum in ms. |

### Renderer

- **Setup:** `createGameRenderer()` in `render/renderer.ts` asks PixiJS for WebGL
  (`preference: 'webgl'`) at 384x216, resolution 1, no antialiasing, `roundPixels` on, and
  nearest-neighbour texture sampling. The canvas's CSS size is the largest whole multiple of
  384x216 that fits the window (`integerScale()`), with `image-rendering: pixelated`, centred
  on black by `index.html`.
- **Layers,** back to front: the starfield, the world (terrain, ship, explosion), the death
  flash, and the UI (title screen and messages).
- **Terrain** (`terrain.ts`, geometry in `terrain-layout.ts`): 41 columns
  (`MAX_VISIBLE_BARS`) of 24 sprites each, one per segment, made once. Each frame moves the
  columns to the bars `visibleBars()` lists and tints each sprite: lit segment k is
  `LED_LIT[k]` (green at the screen edge, through amber, to red towards the gap), unlit is
  `LED_DIM[k]`, and a peak dot is white. The scroll is rounded to a whole pixel once per
  frame, so bars never shift against each other.
- **Ship** (`ship.ts`): a 16x8 sprite built from a character map, centred on the sim's
  `shipX` and `shipY`. The engine flame changes length every 1440 song samples (30 ms).
- **Starfield** (`starfield.ts`): 112 stars in three layers placed by `seededRandom(seed)`,
  scrolling at 0.12, 0.25 and 0.5 of the terrain's speed.
- **Text** (`font.ts`, `text.ts`): a 5x7 pixel font for printable ASCII, with descenders,
  in one atlas texture. A character outside printable ASCII draws as `?`. `PixelText`
  reuses its sprites when its text changes.
- **Crash** (`effects.ts`, `flash.ts`): 48 particles in a seeded burst, and one white flash
  that fades from 25% opacity over 220 ms. "Reduce flashing" is on by default (`PLAN.md`,
  "Visual spec") and M1 has no settings screen, so this reduced flash is the only one.
- **Allocation:** display objects are made at startup or when a screen changes. The
  per-frame path in play only writes positions and tints and allocates nothing in our code;
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

**Input.** `keyToBit()` maps arrows and WASD to `InputBit`. A key held during a frame sets
its bit on every tick that frame runs, and a key pressed and released between two ticks
still sets its bit for one tick.

**Pause.** Esc calls `player.pause()`, which suspends the audio context. The clock stops, so
the sim stops with it; resuming continues both from where they were.

**Crash and song end.** When `state.dead` is set, the song stops, the picture holds the
crash tick, and the explosion and flash play on the wall clock. A retry calls
`resetSimState()` and `player.start()`, which plays the song from its start. When
`state.finished` is set, the "Song complete" message shows. Either way the run's difficulty,
input log and crash tick are kept in `Game.lastRun` for the replays in M2.

**Analysis.** `analyzeInWorker(bytes)` (`analysis.ts`) sends the song file's bytes to
`analysis-worker.ts`, a module worker that runs `loadOpenMpt()` and `analyze()` and sends
back the serialized LevelData as a transferred buffer. The main thread deserializes it and
calls `generateLevel()` for the chosen difficulty. The screen reads "Analyzing song..." until
both the analysis and the audio player are ready. LevelData and each difficulty's level are
kept for the session. The AudioContext is created inside the key press that leaves the title
screen, because browsers only let audio start from a key press or click.

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

- **A finished roadmap item leaves `ROADMAP.md`**, its "At a glance" row and its section
  together, and becomes an entry in `CHANGELOG.md`. A milestone is finished only when its
  acceptance checks pass, and Brad confirms it before it's marked done.
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
- **Brad approves changelog wording** before it reaches `main`.
