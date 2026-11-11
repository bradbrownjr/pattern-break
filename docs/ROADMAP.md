# Roadmap

*Last updated: 2026-11-11*

## At a glance

What comes next for Pattern Break, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [M5: leaderboards](#m5-leaderboards) | A global board per song and an arcade board, with scores checked by replaying them on the server. | Next |
| [M6: mobile and polish](#m6-mobile-and-polish) | Latency calibration, phone performance, tuned difficulty. | Planned |
| [Boss patterns](#later) | A mini boss at the end of level 4 and the final boss at the end of level 8, from the song's patterns. | Later |
| [Per-song enemy overrides](#later) | A sidecar file that changes which instrument spawns which enemy for one song. | Later |
| [Amiga PAL mode](#later) | An optional 320x256 display mode. | Later |
| [Player accounts](#later) | Sign-in by magic link in place of the anonymous device key. | Later |
| [End scene](#later) | A short scene after the last level, before the credits. | Later |

**Stages:** *Next* is being worked on or starts as soon as the current item is finished.
*Planned* is settled and waiting its turn. *Later* comes after M6 and has no plan of its own
yet.

Each milestone is finished only when its acceptance checks pass. Work them in order; don't
start the next until the current one is done.

---

## M5: leaderboards

**Goal:** fair global boards.

Decided 2026-11-11: imported songs get boards from day one; the arcade run gets a board of
its own for the run's total, beside the per-song boards; the Unraid container gets a data
volume, `/mnt/user/appdata/pattern-break` mounted at `/data`.

- [x] Fastify serves the API and the built client. SQLite (`node:sqlite`) holds players,
      songs and runs; replays and uploaded songs are files under `/data`.
- [x] `POST /api/runs`, `PUT /api/songs/:hash`, `GET /api/leaderboards/:hash`,
      `GET /api/leaderboards/arcade`, `GET /api/songs/:hash`, `PUT /api/players/me`, and
      `GET /api/replays/:sha`.
- [x] Replay checking in a worker thread. Level data is built once per song, difficulty and
      `GEN_VERSION` and cached, so a check re-runs only the sim. A run is rejected when its
      versions aren't the server's, when it used a cheat, or when the replayed score isn't
      the claimed one.
- [x] An unknown song answers `needModule`, and the client uploads it (4 MB cap; the server
      checks the hash). Uploaded songs are kept only for checking and aren't served.
- [x] Arcade runs: the run's level replays in order, each checked like a song run, on the
      arcade's songs for that difficulty. A run that ends in a game over still counts, with
      the levels it reached.
- [ ] Measure the cost of one check in the Unraid container before turning it on. If it's
      too heavy, check only runs that reach a board's top 10 instead of every run; the
      client doesn't change either way (decided 2026-11-08).
- [ ] Players: an Ed25519 device key in IndexedDB signs each submission; a nickname and an
      optional profile link, set in Settings.
- [ ] Client: submit from Results, a queue for runs finished offline, and the global top 10
      on song select when online.
- [x] Rate limiting per IP and per player.
- [x] The `/data` volume in the image, the Compose file and the Unraid template.

**Acceptance:** a tampered score is rejected; a legitimate run appears on the board. Both
are checked by a server test that `pnpm check` runs: a real autopilot run is accepted and
listed, a raised score is rejected, edited inputs with the original score are rejected, and
an upload whose bytes don't match its hash is refused.

**Docs:** `PLAN.md` "Server"; `DEVELOPMENT.md` (the API, the database, the checker);
`SELF-HOSTING.md` (the data volume).

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
- **End scene:** a short scene after the last level, before the credits roll. Brad would
  reserve AI Renaissance or May is 4 Her for it (2026-11-10).

## Open decisions

These need Brad's answer before the work that depends on them. Don't guess.

1. **Platform priority:** desktop web first or mobile first. Affects how early M6 work
   starts.
2. **Peak dots:** they are off on every difficulty (2026-11-08). They could come back as a
   display option, as solid obstacles on hard, or not at all.
3. **Shots through walls:** the player's shots pass through the LED walls, so turrets on
   the bar tips can be hit; enemy bullets stop on them (2026-11-09, for Brad's play-test).
   The other way, turrets are hard to reach behind taller bars.
