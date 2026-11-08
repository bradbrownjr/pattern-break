# Changelog

Finished work, newest first. When a roadmap item is done, it leaves the
[roadmap](ROADMAP.md) and is recorded here.

Until the game is playable, entries list finished roadmap items under **Milestones**. From
the first playable build on, entries use **New Features**, **Improvements**, and **Bug
Fixes**, in that order.

---

# November 8, 2026

## Milestones

* **S1: The same level in every browser.** The game reads a song file (a tracker module,
  made in a music tracker) with its own build of
  libopenmpt 0.8.10 and turns it into level data: the stereo spectrum as LED levels,
  per-channel volume, row timing, and every note. That data is byte-for-byte the same in
  Node, Chromium, Firefox, and WebKit, which is what lets one song have one leaderboard.
* **Project: Ready to build.** The repository has the workspace for the game's four
  packages (core, analysis, client, server), type-checking, tests, and CI, plus lint rules
  that reject non-deterministic code in the level generator and simulation. The code is MIT
  licensed. The S1 spike can start from here.
* **Docs: Plan, roadmap, and writing guide.** The design is in `PLAN.md`, what comes next is
  in `ROADMAP.md`, how to work on the code is in `DEVELOPMENT.md`, and the writing rules are
  in `DOC-STYLE.md`, which `pnpm check:docs` enforces in CI.
