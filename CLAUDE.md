# CLAUDE.md

A tunnel shooter whose levels are built from tracker modules: song files made in a music
tracker. The docs, each with one job:

- **`docs/PLAN.md`**: the design, the determinism rules, and the tech choices. Read the
  section for a package before working on it.
- **`docs/ROADMAP.md`**: what comes next, in order, with acceptance checks.
- **`docs/CHANGELOG.md`**: what is finished.
- **`docs/DEVELOPMENT.md`**: setup, commands, layout, TypeScript conventions, the
  determinism lint, and how the changelog and roadmap are kept.
- **`docs/DOC-STYLE.md`**: the writing rules.
- **`docs/SONG-DIGEST.md`**: every song considered for the game, its numbers and license
  checks, and why the unused ones were left out.
- **`docs/PLAYTEST.md`**: the tests Brad runs by hand on real hardware, and how to report
  them. What they find becomes roadmap items.
- **`docs/SOUND-EFFECTS.md`**: the sound effects' research, with sources, their design,
  and what was measured. The generator, `packages/chipfx`, is meant for reuse.
- **`docs/REFERENCES.md`**: every study, guide, specification and other published source
  the project rests on, by topic, with what each informed.

## Writing

**Read `docs/DOC-STYLE.md` before writing anything a person reads:** docs, the README, code
comments, commit messages, UI text. In short: no em-dashes, no emoji, no filler phrasing,
sentence case headings, and verify every claim before writing it. `pnpm check:docs` fails on
the parts a script can catch.

## Before you commit

Run `pnpm check` (lint, type-check, tests, docs check). Commands and what each one does are
in `docs/DEVELOPMENT.md`.

## Roadmap and changelog

- Work the roadmap in order. A milestone is finished when the acceptance checks the agent
  can run pass. **Don't wait for Brad's play-test** to move it to the changelog; what Brad's
  play-tests find becomes new roadmap items (Brad, 2026-11-09).
- A finished item leaves `docs/ROADMAP.md` (its "At a glance" row and its section together)
  and becomes an entry in `docs/CHANGELOG.md`. Format and dating rules are in
  `docs/DEVELOPMENT.md`, "Changelog and roadmap".
- **`docs/CHANGELOG.md` is the agent's record of the project's history.** Write and keep it
  up to date without waiting for Brad to approve the wording. Player-facing release notes
  wait until the finished game is published (Brad, 2026-11-09).
- A new roadmap item gets an "At a glance" row, and once planned, a section with tasks,
  acceptance checks, and a **Docs:** line.
- Technical facts and patterns that a future change needs go in `docs/DEVELOPMENT.md`.

## Hard rules

1. **`packages/core/src` is deterministic.** Lint bans randomness, transcendental `Math`,
   `**`, clocks, host and DOM globals, and non-relative imports there. Don't disable these
   rules. If something seems to need one, the value belongs in a precomputed table
   (`/tools`) or must be passed in by the caller. When you add a rule, add a case to
   `packages/core/test/determinism-lint.test.ts`.
2. **The sim uses integer fixed-point** at a fixed 120 Hz tick. Collision is integer-only.
   The PRNG is seeded and called in a fixed order.
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
10. **TypeScript 7 has no compiler API yet.** Don't add tools that need one
    (typescript-eslint, ts-morph). Lint is Oxlint.

## Always and never

This file is the project's memory for agents. When Brad says to always or never do
something, add it here as a clear, testable rule. A rule that isn't written here may be
forgotten next session.

- Rely on published knowledge, not assumed knowledge: before setting a design target, a
  standard, or a technical fact, find and cite a published source, and say so when none
  exists (Brad, 2026-11-11).
- Every source research turns up that informs a decision goes in `docs/REFERENCES.md`, with
  what it informed and where, as well as beside the decision; so do searches that found
  nothing (Brad, 2026-11-13).
- On-screen text is arcade terse: labels and key prompts ("R Replay"), never sentences
  (Brad, 2026-11-09; see `docs/DOC-STYLE.md`, "On-screen text is arcade terse").
- Completed roadmap items move to the changelog without waiting for Brad's play-test, and
  the changelog's wording needs no approval from Brad (Brad, 2026-11-08 and 2026-11-09).
- The first mention of a module, mod, or tracker in anything a person reads says what it is:
  a song file made in a music tracker. Player-facing text calls them songs (Brad,
  2026-11-08; see `docs/DOC-STYLE.md`, "Say what a module is").
- Bundled music is Drozerix only, in the techno and retro-futuristic style of the songs
  already bundled (Brad, 2026-11-10; see `docs/SONG-DIGEST.md`, "How a song gets on this
  list").
- Impossible runs go on the leaderboards like any other difficulty; only a run with a cheat
  is kept off (Brad, 2026-11-10).
- When a change is ready for Brad to play-test, push it, wait for the "Docker image" workflow
  to publish `edge`, then update the `pattern-break` container on Unraid (10.6.26.2, host
  port 8380, served at https://patternbreak.lynwood.us) and confirm the new build is the
  one served. The container doesn't update itself (Brad, 2026-11-08; see
  `docs/SELF-HOSTING.md`).

## Open decisions

The list is in `docs/ROADMAP.md`, "Open decisions". Ask Brad; don't guess.
