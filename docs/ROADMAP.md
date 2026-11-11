# Roadmap

*Last updated: 2026-11-10*

## At a glance

What comes next for Pattern Break, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [M6: mobile and polish](#m6-mobile-and-polish) | Phone performance and difficulty targets. | Next |
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

## M6: mobile and polish

**Goal:** as good on a phone as on a computer.

Decided 2026-11-10: desktop and phone count equally; a change is done when it is right on
both. Difficulty is tuned to measured targets, on the bundled songs plus a few varied
public-domain or CC0 test songs kept in test fixtures, never bundled.

- [ ] **Performance:** an on-screen frame-time readout; a measured pass under Chrome's 4x
      and 6x CPU throttling, fixing what stands out; then Brad's phone, a Samsung Galaxy
      S25 (Snapdragon 8 Elite for Galaxy, 6.2 inch 1080 x 2340 display, 1 to 120 Hz
      adaptive refresh, per the launch spec tables; Brad, 2026-11-10). At 120 Hz a frame
      has 8.3 ms, so the game has to hold that, not only 60 fps.
- [ ] **Difficulty targets:** per difficulty, set and test enemies a minute, bullets on
      screen, the narrowest gap, and how far a scripted bot gets, on the 16 bundled songs
      and 4 to 6 varied test songs (licenses checked as for bundled songs, kept in
      `packages/analysis/fixtures`). Brad confirms the targets by play-test.

**Acceptance:**

- Under 4x CPU throttling in headless Chromium, the sim and renderer work of a frame
  stays under 8 ms at the 95th percentile on the busiest bundled level.
- Every bundled and test song meets its difficulty's targets on every difficulty.

**Docs:** `PLAN.md` "Level generation"; `DEVELOPMENT.md` "Performance"; `SONG-DIGEST.md`
for the test songs.

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

1. **Peak dots:** they are off on every difficulty (2026-11-08). They could come back as a
   display option, as solid obstacles on hard, or not at all.
2. **Shots through walls:** the player's shots pass through the LED walls, so turrets on
   the bar tips can be hit; enemy bullets stop on them (2026-11-09, for Brad's play-test).
   The other way, turrets are hard to reach behind taller bars.
