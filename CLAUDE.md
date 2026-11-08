# CLAUDE.md

Tracker-module-driven tunnel shooter. **`docs/PLAN.md` is the source of truth** for design,
determinism rules and milestones. Read the relevant section before working on a package.

## Status

Scaffold only. Current milestone: **S1 — libopenmpt access spike** (PLAN §14). Work the
milestones in order; a milestone is done only when its acceptance checks pass, then commit.

## Commands

```sh
pnpm install
pnpm lint          # ESLint (includes the core determinism ban)
pnpm typecheck     # tsc per package
pnpm test          # vitest per package
pnpm check         # all three
pnpm dev           # client (Vite)
pnpm build
```

Single package: `pnpm --filter @game/core test`. Single file: `pnpm --filter @game/core exec vitest run test/foo.test.ts`.

## Layout

- `packages/core` (`@game/core`): pure deterministic code: levelgen, sim, PRNG, fixed-point, replay format. `src/version.ts` holds `GEN_VERSION` / `SIM_VERSION`.
- `packages/analysis` (`@game/analysis`): libopenmpt WASM wrapper → `LevelData`. Golden fixtures go in `fixtures/`.
- `packages/client` (`@game/client`): Vite app (Pixi, audio, UI, storage, PWA). Game name lives only in `src/config/brand.ts`.
- `packages/server` (`@game/server`): Fastify + SQLite leaderboard and replay validator (M5).
- `music/`: bundled modules + `manifest.json`. `tools/`: build-time generators and validators.

## TypeScript conventions

- Workspace packages export their TS source (`exports: ./src/index.ts`); there is no build step for core/analysis/server. Node ≥ 22.18 runs them via type stripping.
- Relative imports use the `.ts` extension (`import { x } from './x.ts'`).
- `erasableSyntaxOnly` is on: no `enum`, `namespace`, or constructor parameter properties. Use `as const` objects and union types.
- `strict` + `noUncheckedIndexedAccess`. Typed arrays for hot data.

## Hard rules

1. **`packages/core/src` is deterministic.** ESLint bans `Math.random`, transcendental `Math.*`, `**`, `Date`, `performance`, host/DOM globals, and every non-relative import. Its tsconfig has no DOM or Node types. Don't disable these rules; if something seems to need them, the value belongs in a precomputed table (`/tools`) or must be passed in by the caller. `packages/core/test/determinism-lint.test.ts` keeps the ban honest; extend it when you add rules.
2. **Sim uses integer fixed-point** at a fixed 120 Hz tick; collision is integer-only; PRNG is seeded and called in a fixed order (PLAN §5, §8).
3. **Any change to levelgen or sim output requires bumping `GEN_VERSION` / `SIM_VERSION`** and updating golden snapshots in the same commit.
4. **Cosmetics stay in `client`** (particles, shake, CRT, flashes) and never feed back into sim state.
5. **Tracker formats only** (`.mod .xm .s3m .it`). No MP3/streaming.
6. **Offline-first.** Only leaderboards may require network.
7. **Pin libopenmpt.** Commit the WASM binary; render at 48 000 Hz with explicitly set render params.
8. **Music licensing:** only PD, CC0, CC BY. CC BY-SA → flag for manual review. No NC/ND, no covers of commercial songs. Every bundled file needs a complete `manifest.json` entry.
9. Module and WASM files are `binary` in `.gitattributes` so their hashes never change. Keep it that way.

## Open decisions (ask the owner, don't guess)

Final title; free vs paid (also affects licensing and the repo's own LICENSE); desktop-first vs
mobile-first; leaderboard hosting; whether boards accept user-imported modules at launch (PLAN §16).
