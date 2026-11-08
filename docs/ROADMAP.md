# Roadmap

*Last updated: 2026-11-08*

## At a glance

What comes next for PATTERN BREAK, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [S1: libopenmpt access](#s1-libopenmpt-access) | Proof that the game can read a module's pattern data and audio levels the same way in Node and in a browser. | Next |
| [M1: vertical slice](#m1-vertical-slice) | One song, LED terrain scrolling in time with it, a ship you can fly and crash. | Planned |
| [M2: enemies and scoring](#m2-enemies-and-scoring) | Notes become enemies; shooting, scoring, lives, power-ups, and replays that give the same score in every browser. | Planned |
| [M3: effects and look](#m3-effects-and-look) | Particles, copper bars, starfield, CRT filter, title and results screens, accessibility options. | Planned |
| [M4: library, offline, music pack](#m4-library-offline-music-pack) | Import your own modules, install the game, and play with no connection; a bundled, credited music pack. | Planned |
| [M5: leaderboards](#m5-leaderboards) | A global board per song, with scores checked by replaying them on the server. | Planned |
| [M6: mobile and polish](#m6-mobile-and-polish) | Touch and gamepad controls, latency calibration, phone performance, tuned difficulty. | Planned |
| [Boss patterns](#later) | A song's last or most-repeated pattern becomes a boss fight. | Later |
| [Per-song enemy overrides](#later) | A sidecar file that changes which instrument spawns which enemy for one song. | Later |
| [Amiga PAL mode](#later) | An optional 320x256 display mode. | Later |
| [Player accounts](#later) | Sign-in by magic link in place of the anonymous device key. | Later |

**Stages:** *Next* is being worked on or starts as soon as the current item is finished.
*Planned* is settled and waiting its turn. *Later* comes after M6 and has no plan of its own
yet.

Each milestone is finished only when its acceptance checks pass. Work them in order; don't
start the next until the current one is done.

---

## S1: libopenmpt access

**Goal:** confirm the game can get everything it needs out of libopenmpt, and settle how
libopenmpt is built and loaded.

- [ ] Find out whether chiptune3.js exposes pattern, row, and channel command data; the
      current order and row; per-channel VU; offline rendering to a buffer; and loading in
      Node.
- [ ] If it doesn't, build libopenmpt with Emscripten from the newest upstream release and
      export the needed C API functions. Commit the `.wasm` and record its version.
- [ ] Load one `.mod` in a Node script and in a browser page, and produce `LevelData` from
      each.
- [ ] Add the first golden fixture to `packages/analysis/fixtures`.

**Acceptance:** the Node script and the browser page print the same SHA-256 of the
serialized `LevelData`.

**Docs:** `DEVELOPMENT.md` (how libopenmpt is built and loaded), the tech table in
`PLAN.md`, the README status.

## M1: vertical slice

**Goal:** the core loop on one song.

- [ ] One bundled song, analyzed and played back.
- [ ] LED terrain (ceiling and floor) scrolling in sync with playback.
- [ ] The player ship, terrain collision, death and restart.

**Acceptance:** 60 fps in desktop Chrome; the terrain is audibly in time with the music.

## M2: enemies and scoring

**Goal:** a complete, deterministic run.

- [ ] Note events become enemies, with motion from their effects.
- [ ] Shooting, the on-beat bonus, score, lives, and the power-up meter.
- [ ] Replay recording and playback.
- [ ] Cross-engine determinism tests in Vitest browser mode.
- [ ] The headless sim benchmark (10 000 ticks, maximum entities), which also gives the
      first number for what a server-side replay check costs.

**Acceptance:** a replay recorded in Chromium reproduces the same score in Firefox, WebKit,
and Node.

## M3: effects and look

**Goal:** it looks and feels like the pitch.

- [ ] Particles, copper bars, parallax starfield, CRT filter, hit flashes.
- [ ] Title screen with attract mode, and the results screen.
- [ ] Accessibility toggles: reduce flashing (on by default), shake, colour-blind-safe LED
      palette, remappable controls.

## M4: library, offline, music pack

**Goal:** bring your own music, play anywhere.

- [ ] Module import (file picker, drag and drop, directory import on Chromium) and
      IndexedDB storage.
- [ ] Level caching by hash and `GEN_VERSION`.
- [ ] PWA install and full offline play.
- [ ] The bundled music pack, `tools/validate-manifest.ts` in CI, attribution on song cards
      and level intros, and a credits screen.

**Acceptance:** install as a PWA, turn on airplane mode, import a new module, and play it.

## M5: leaderboards

**Goal:** fair global boards.

- [ ] The Fastify server with `POST /runs`, `GET /leaderboards/:hash`, and
      `GET /songs/:hash`.
- [ ] Replay validation in a worker thread, and module upload for unknown songs. Level data
      is built once per song and cached, so a check re-runs only the sim.
- [ ] Measure the cost of one check on the target server before turning it on. If it's too
      heavy, check only runs that reach a board's top 10 instead of every run; the client
      doesn't change either way (decided 2026-11-08).
- [ ] Per-song boards, nicknames, and the optional profile link.
- [ ] Rate limiting, and a Docker Compose file.

**Acceptance:** a tampered score is rejected; a legitimate run appears on the board.

## M6: mobile and polish

**Goal:** good on a phone.

- [ ] Touch controls and gamepad support.
- [ ] The latency calibration screen.
- [ ] A performance pass on a mid-range Android phone.
- [ ] Difficulty tuning across about 20 varied modules.

---

## Later

Ideas that come after M6. Each gets its own section here, with tasks, once it's planned.

- **Boss patterns:** the last pattern, or the most-repeated one, becomes a boss whose weak
  points pulse on the lead channel.
- **Per-song enemy overrides:** a sidecar JSON that overrides the instrument-to-enemy
  heuristic for one song.
- **Amiga PAL mode:** an optional 320x256 internal resolution.
- **Player accounts:** magic-link login, replacing or linking the anonymous device keypair.

## Open decisions

These need Brad's answer before the work that depends on them. Don't guess.

1. **Final game title.** The placeholder is PATTERN BREAK. Needed before M4 (PWA name and
   icons).
2. **Free or paid.** The code is MIT either way. This affects distribution and which music
   licenses are worth reviewing; NC is excluded regardless. Needed before M4.
3. **Platform priority:** desktop web first or mobile first. Affects how early M6 work
   starts.
4. **Leaderboard hosting:** self-hosted homelab or a VPS. Needed before M5.
5. **User-imported modules on leaderboards** from day one, or bundled songs only at first.
   Needed before M5.

## Out of scope (decided)

- **MP3, OGG, and streaming audio.** Levels come from tracker pattern data, which those
  formats don't have.
