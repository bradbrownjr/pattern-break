# CLAUDE.md

A tracker-module-driven tunnel shooter. **`docs/PLAN.md` is the source of truth** for the
design, the determinism rules, the tech choices, and the milestones. Read the section for a
package before working on it.

## Writing

**Read `docs/DOC-STYLE.md` before writing anything a person reads:** docs, the README, code
comments, commit messages, UI text. In short: no em-dashes, no emoji, no filler phrasing,
sentence case headings, and verify every claim before writing it. `pnpm check:docs` fails on
the parts a script can catch.

## Status

Scaffold only. Current milestone: **S1, the libopenmpt access spike** (PLAN §14). Work the
milestones in order. A milestone is done only when its acceptance checks pass; ask Brad
before calling one complete, then commit.

## Commands

```sh
pnpm install
pnpm lint          # Oxlint, including the core determinism rules
pnpm typecheck     # tsc (TypeScript 7) per package, plus tools/
pnpm test          # Vitest per package
pnpm check:docs    # writing rules (tools/check-docs.ts)
pnpm check         # all four
pnpm dev           # client (Vite)
pnpm build
```

One package: `pnpm --filter @game/core test`. One file:
`pnpm --filter @game/core exec vitest run test/foo.test.ts`.

## Layout

- `packages/core` (`@game/core`): pure deterministic code: levelgen, sim, PRNG, fixed-point
  math, replay format. `src/version.ts` holds `GEN_VERSION` and `SIM_VERSION`.
- `packages/analysis` (`@game/analysis`): libopenmpt WASM wrapper that produces
  `LevelData`. Golden fixtures go in `fixtures/`.
- `packages/client` (`@game/client`): the Vite app (Pixi, audio, UI, storage, PWA). The game
  name lives only in `src/config/brand.ts`.
- `packages/server` (`@game/server`): Fastify and SQLite leaderboard and replay validator
  (M5).
- `music/`: bundled modules and `manifest.json`. `tools/`: build-time generators, checkers,
  and the Oxlint determinism plugin (`tools/lint/`).

## TypeScript

- Node 26 runs the workspace packages' `.ts` source directly; `exports` points at
  `./src/index.ts`. Only the client is built (Vite).
- Relative imports carry the `.ts` extension: `import { x } from './x.ts'`.
- `erasableSyntaxOnly` is on: no `enum`, `namespace`, or constructor parameter properties.
  Use `as const` objects and union types.
- `strict` and `noUncheckedIndexedAccess` are on. Use typed arrays for hot data.
- TypeScript 7 has no compiler API yet, so nothing in the repo may depend on one
  (typescript-eslint, ts-morph and the like). Lint is Oxlint.

## Hard rules

1. **`packages/core/src` is deterministic.** Lint bans `Math.random`, transcendental
   `Math` functions, `**`, computed or aliased `Math`, `Date`, `Temporal`, `performance`,
   host and DOM globals, and every non-relative import. Its tsconfig has no DOM or Node
   types. Don't disable these rules. If something seems to need one, the value belongs in a
   precomputed table (`/tools`) or must be passed in by the caller. When you add a rule, add
   a case to `packages/core/test/determinism-lint.test.ts`.
2. **The sim uses integer fixed-point** at a fixed 120 Hz tick. Collision is integer-only.
   The PRNG is seeded and called in a fixed order (PLAN §5, §8).
3. **Any change to levelgen or sim output bumps `GEN_VERSION` or `SIM_VERSION`** and
   updates the golden snapshots in the same commit.
4. **Cosmetics stay in `client`** (particles, shake, CRT, flashes) and never feed back into
   sim state.
5. **Tracker formats only** (`.mod .xm .s3m .it`). No MP3 or streaming.
6. **Offline-first.** Only leaderboards may need the network.
7. **Pin libopenmpt.** Commit the WASM binary. Render at 48 000 Hz with every render
   parameter set explicitly.
8. **Music licensing:** PD, CC0, and CC BY only. CC BY-SA is flagged for manual review. No
   NC or ND, no covers of commercial songs. Every bundled file needs a complete
   `manifest.json` entry.
9. Module and WASM files are `binary` in `.gitattributes` so their hashes never change.
   Keep it that way.

## Always and never

This file is the project's memory for agents. When Brad says to always or never do
something, add it here as a clear, testable rule. A rule that isn't written here may be
forgotten next session.

## Open decisions

Ask Brad; don't guess (PLAN §16): the final title, free or paid distribution, desktop-first
or mobile-first, leaderboard hosting, and whether boards accept user-imported modules at
launch. The code license is decided: MIT.
