# PATTERN BREAK (working title)

A horizontal-scrolling neon tunnel shooter where every level is generated from a tracker module
(MOD/XM/S3M/IT). Same file → same level → one global leaderboard per song.

Status: repository scaffold. Next milestone is **S1** (libopenmpt access spike).

- Design and milestones: [`docs/PLAN.md`](docs/PLAN.md)
- Contributor/agent notes: [`CLAUDE.md`](CLAUDE.md)

## Development

Requires Node ≥ 22.18 (runs TypeScript directly) and pnpm 10.

```sh
pnpm install
pnpm dev        # client dev server
pnpm check      # lint + typecheck + test
```
