# Roadmap

*Last updated: 2026-11-10*

## At a glance

What comes next for Pattern Break, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [M5: leaderboards](#m5-leaderboards) | A global board per song, with scores checked by replaying them on the server. | Next |
| [M6: mobile and polish](#m6-mobile-and-polish) | Latency calibration, phone performance, tuned difficulty. | Planned |
| [Boss patterns](#later) | A mini boss at the end of level 4 and the final boss at the end of level 8, from the song's patterns. | Later |
| [Per-song enemy overrides](#later) | A sidecar file that changes which instrument spawns which enemy for one song. | Later |
| [Amiga PAL mode](#later) | An optional 320x256 display mode. | Later |
| [Player accounts](#later) | Sign-in by magic link in place of the anonymous device key. | Later |

**Stages:** *Next* is being worked on or starts as soon as the current item is finished.
*Planned* is settled and waiting its turn. *Later* comes after M6 and has no plan of its own
yet.

Each milestone is finished only when its acceptance checks pass. Work them in order; don't
start the next until the current one is done.

---

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
- [ ] Rate limiting.
- [ ] One Docker image that serves the API and the built client, published to ghcr.io by a
      GitHub Actions workflow, with a Compose file and the settings needed to run it on
      Unraid (port, data volume for the SQLite database and stored replays).

**Acceptance:** a tampered score is rejected; a legitimate run appears on the board.

## M6: mobile and polish

**Goal:** good on a phone.

- [ ] The latency calibration screen.
- [ ] A performance pass on a mid-range Android phone.
- [ ] Difficulty tuning across about 20 varied modules.

---

## Later

Ideas that come after M6. Each gets its own section here, with tasks, once it's planned.

- **Boss patterns:** the last pattern, or the most-repeated one, becomes a boss whose weak
  points pulse on the lead channel. Brad wants a mini boss at the end of level 4 and the
  final boss at the end of level 8 (2026-11-08); both need M2's enemies first.
- **Per-song enemy overrides:** a sidecar JSON that overrides the instrument-to-enemy
  heuristic for one song.
- **Amiga PAL mode:** an optional 320x256 internal resolution.
- **Player accounts:** magic-link login, replacing or linking the anonymous device keypair.

## Open decisions

These need Brad's answer before the work that depends on them. Don't guess.

1. **Platform priority:** desktop web first or mobile first. Affects how early M6 work
   starts.
2. **User-imported modules on leaderboards** from day one, or bundled songs only at first.
   Needed before M5.
3. **Peak dots:** they are off on every difficulty (2026-11-08). They could come back as a
   display option, as solid obstacles on hard, or not at all.
4. **Shots through walls:** the player's shots pass through the LED walls, so turrets on
   the bar tips can be hit; enemy bullets stop on them (2026-11-09, for Brad's play-test).
   The other way, turrets are hard to reach behind taller bars.
