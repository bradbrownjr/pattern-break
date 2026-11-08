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
| `pnpm test` | Vitest in each package. |
| `pnpm check:docs` | The writing-rules check (`tools/check-docs.ts`). |
| `pnpm gen:tables` | Regenerates `packages/core/src/spectrum/tables.generated.ts`. |
| `pnpm check` | Lint, type-check, tests, and the docs check, in that order. |

One package: `pnpm --filter @game/core test`. One test file:
`pnpm --filter @game/core exec vitest run test/determinism-lint.test.ts`.

## Project structure

```
pattern-break/
├── .github/workflows/ci.yml       # install, lint, typecheck, test, check:docs, build
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
│   │   └── fixtures/              # golden-test modules (from S1)
│   ├── client/                    # @game/client: the Vite app
│   │   └── src/config/brand.ts    # the game's name, in one place
│   └── server/                    # @game/server: leaderboard API and replay validator (M5)
├── tools/
│   ├── check-docs.ts              # writing-rules check
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
- Each package's `tsconfig.json` sets its own `lib` and `types`. Core gets ES2022 only (no
  DOM, no Node); the client gets DOM and `vite/client`; the server gets Node.
- TypeScript 7 has no compiler API yet (the package exports only its version), so no tool in
  the repo may depend on one. That rules out typescript-eslint and ts-morph for now.

## The determinism lint

`packages/core/src` has to produce the same output in every engine (PLAN.md, "Determinism
rules"). Lint enforces the parts a linter can see.

- **Built-in rules** in the `overrides` block of `.oxlintrc.json`, scoped to
  `packages/core/src/**`:
  - `no-restricted-properties`: `Math.random` and the transcendental `Math` functions
  - `no-restricted-globals`: clocks, host and DOM globals, timers, `fetch`, `WebAssembly`
  - `no-restricted-imports`: everything except relative paths, which are `./` at any
    depth and `../` one level up
- **Plugin rules** in `tools/lint/determinism-plugin.js`, for what Oxlint has no built-in
  rule for:
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
  default"), because what -1 means can change between releases.
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
flag when a package gets its first test. Cross-engine tests (Vitest browser mode with the
Playwright provider) arrive with M2.

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
