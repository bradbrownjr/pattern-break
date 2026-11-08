# Development guide

How to work on the code: setup, layout, conventions, checks, and how the changelog and
roadmap are kept. The design itself is in [`PLAN.md`](PLAN.md); the writing rules are in
[`DOC-STYLE.md`](DOC-STYLE.md). A module (or mod) is a song file made in a music tracker,
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
| `pnpm lint` | Oxlint over the repo, including the core determinism rules. |
| `pnpm typecheck` | `tsc` (TypeScript 7) in each package, then in `tools/`. |
| `pnpm test` | Vitest in each package, in Node. |
| `pnpm test:browser` | The golden LevelData test in real browsers (see "Tests"). |
| `pnpm --filter @game/analysis analyze <file>` | Analyzes one module and prints its LevelData hash and a summary. |
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
├── .oxlintrc.json                 # lint config; the core determinism rules are its override
├── docs/
│   ├── PLAN.md                    # design, rules, tech choices
│   ├── ROADMAP.md                 # what comes next
│   ├── CHANGELOG.md               # what is finished
│   ├── DEVELOPMENT.md             # this file
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
│   │   └── src/config/brand.ts    # the game's name, in one place
│   └── server/                    # @game/server: leaderboard API and replay validator (M5)
├── tools/
│   ├── check-docs.ts              # writing-rules check
│   ├── build-libopenmpt.sh        # rebuilds the vendored libopenmpt WASM
│   ├── libopenmpt/*.patch         # our patches to libopenmpt (see "libopenmpt build")
│   ├── make-fixture-mod.ts        # writes the test modules in packages/analysis/fixtures
│   ├── gen-spectrum-tables.ts     # writes core's spectrum tables
│   └── lint/determinism-plugin.js # Oxlint JS plugin for core
├── tsconfig.base.json             # shared compiler options
└── pnpm-workspace.yaml
```

Each workspace package's `exports` points at `./src/index.ts`; other packages and Node
import the source directly.

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
