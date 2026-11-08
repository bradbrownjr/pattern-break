# Development guide

How to work on the code: setup, layout, conventions, checks, and how the changelog and
roadmap are kept. The design itself is in [`PLAN.md`](PLAN.md); the writing rules are in
[`DOC-STYLE.md`](DOC-STYLE.md).

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
| `pnpm screenshots` | Regenerates every figure in `docs/img/` (see "Screenshots"). |
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
│   │   └── test/determinism-lint.test.ts
│   ├── analysis/                  # @game/analysis: libopenmpt wrapper, produces LevelData
│   │   ├── src/analyze.ts         # the analysis pass
│   │   ├── src/openmpt.ts         # the libopenmpt binding
│   │   ├── scripts/analyze.ts     # prints a module's LevelData hash
│   │   ├── vendor/libopenmpt/     # the pinned WASM build (see "libopenmpt build")
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

## Screenshots

Every figure in the README and docs is generated, never hand-made or hand-edited. One command
regenerates all of them from a manifest, so they stay current with the latest release.

```sh
pnpm screenshots                      # build the client, capture every shot
pnpm screenshots --only smoke-placeholder,other-id
pnpm screenshots --list               # print the manifest
pnpm screenshots --no-build           # reuse packages/client/dist
```

The script builds the client, serves `packages/client/dist` on a free local port, opens each
shot in headless Chromium at a device scale factor of 1, waits for `window.__pbCaptureReady`
(15 s, then it fails and names the shot), and writes `docs/img/<id>.png`. It also writes
`docs/img/figures.json`, which maps each id to its path, alt text, caption, and where it is
used. Set `PB_CHROMIUM` to a Chromium binary when Playwright's own download is not available
(the same variable the browser tests use).

**Output is byte-stable.** Two runs on the same machine give identical PNG bytes. Chromium is
started with fixed font hinting, no LCD text, and an sRGB profile, and the script writes a file
only when its bytes differ, so an unchanged screen never shows up as a modified file. Different
Chromium builds or fonts can still change pixels, which is why CI regenerates the figures
rather than people.

### The manifest

`tools/screenshots/shots.ts` is a typed list. Each shot has:

| Field | Meaning |
|---|---|
| `id` | File name stem, lowercase letters, digits, and hyphens. The image is `docs/img/<id>.png`. |
| `query` | The capture-mode parameters below. The script adds `capture=1`. |
| `viewport` | Optional, default 1152x648: an exact 3x of the 384x216 internal resolution, so pixels stay square. |
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
| `scene` | Which screen to show (`play`, a menu, and so on). |
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

The placeholder page calls `markCaptureReady()` today, which is what the smoke shot
(`docs/img/smoke-placeholder.png`, not used in the README) exercises.

### The release workflow

`.github/workflows/screenshots.yml` runs on `release: published` and on manual dispatch
(`workflow_dispatch`). It installs, runs `playwright install --with-deps chromium`, runs
`pnpm screenshots`, and, if anything under `docs/img/` changed, pushes a `screenshots/run-<id>`
branch and opens a pull request with `gh pr create` using `GITHUB_TOKEN` (permissions
`contents: write` and `pull-requests: write`). The repository setting **Allow GitHub Actions
to create and approve pull requests** (Settings, Actions, General) must be on for that step.
A person reviews the changed images and merges the pull request; nothing is pushed to `main`
directly.

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
