# Roadmap

*Last updated: 2026-11-10*

## At a glance

What comes next for Pattern Break, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [Play-test, November 10](#play-test-november-10) | A wider cave, a gentler respawn, power-ups without buying, a better demo, clearer controls, and three secrets. | Next |
| [M3: effects and look](#m3-effects-and-look) | Particles, big explosions, sound effects, copper bars, starfield, CRT filter, the results screen, accessibility options. | Planned |
| [M4: library, offline, music pack](#m4-library-offline-music-pack) | Import your own songs, install the game, and play with no connection; a bundled, credited music pack. | Planned |
| [M5: leaderboards](#m5-leaderboards) | A global board per song, with scores checked by replaying them on the server. | Planned |
| [M6: mobile and polish](#m6-mobile-and-polish) | Touch controls, latency calibration, phone performance, tuned difficulty. | Planned |
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

## Play-test, November 10

**Goal:** fix what Brad's play-test of level 1 found, and add the secrets he and his son
asked for. Decided with Brad on 2026-11-10.

- [x] **A wider cave.** Numen in Da Chip, level 1, squeezes to 48 px from about 23 s, and
      at 9.6 s climbs from the middle to the ceiling in 0.7 s while squeezed. Every
      difficulty's base and minimum gap grow by 14 px: one LED segment fewer on each side.
      `GEN_VERSION` bump.
- [x] **A gentler respawn.** The ship came back in the middle of the cave but couldn't hit
      the walls for 2 s, so it could drift into one. It now flies in from the left along
      the cave's centre with the controls locked, then has the rest of its safe time
      against enemies and bullets only. `SIM_VERSION` bump.
- [x] **Power-ups unlock on pickup.** Buying in flight was impossible. Each capsule unlocks
      the next power-up in a fixed order: double shot, missile, shield, drone, laser, boost.
      The Buy button goes. `SIM_VERSION` bump.
- [x] **A better demo.** The demo never picked up a power-up, dropped a bomb or fired a
      missile. The autopilot steers for capsules, and the demo is checked for all three.
- [x] **Controls in three pages:** arrows with Z, X, C, V and Shift; WASD with J, K, L, ;
      and '; then the gamepad. Each keyboard page lights only its own keys.
- [ ] **Konami code:** up, up, down, down, left, right, left, right, B, A on the title
      screen gives infinite lives. The run's replay is marked, the M5 boards refuse it, and
      the screen shows it.
- [ ] **God mode:** holding Esc, or Start on a pad, while choosing Play starts with a
      shield that never breaks and every power-up, kept after losing a life. Marked like
      the Konami code.
- [ ] **Impossible:** stepping the difficulty through easy, normal and hard three times
      shows Impossible after the third hard. Play on it is one level, Crush by Drozerix
      (Public Domain, 24 rows a second, 1.5 times level 8's speed) with hard's cave.

**Acceptance:** `pnpm check` passes with the goldens and the replay fixture updated; the
autopilot finishes every bundled song on every difficulty; a capture of the demo shows a
capsule picked up, a bomb and a missile; a test enters the Konami code and the Impossible
steps through the menu, and a replay with either cheat is marked.

**Docs:** `DEVELOPMENT.md` ("Playing it", "Replays", the sim's order of a tick), `PLAN.md`
(power-ups, lives, difficulty), `SONG-DIGEST.md` (Crush), the help and controls screens.

---

## M3: effects and look

**Goal:** it looks and feels like the pitch.

- [ ] Particles, copper bars, parallax starfield, CRT filter, hit flashes.
- [ ] Big explosions: a destroyed ship breaks apart pixel by pixel, each pixel of its sprite
      flying off as its own particle in its own colour, with a colourful shockwave ring and
      a short screen shake. With "reduce flashing" on, the ring's brightness is capped.
- [x] Sound effects, made in the browser (no sound files to license): shots, hits,
      kills, power-ups, and an explosion with a deep boom, echo, and reverb, from our own
      sfxr-style generator (`@game/chipfx`), with pitched effects on the song's notes.
      Mixed under the music, with their own volume and an off switch in a new Settings
      screen (Music and Effects). Research in `SOUND-EFFECTS.md`. Brad listens and says
      which to change.
- [ ] The results screen. (Attract mode and the menu sounds came earlier; see the
      changelog, November 8.)
- [x] A help screen (Brad, 2026-11-10), from the title and pause menus: a key to every
      sprite and HUD icon, drawn with the game's sprites, and what each enemy and bonus
      scores, from the sim's constants. It scrolls.
- [x] A hangar intro before level 1 (Brad, 2026-11-10), skippable: in black and white, the
      captain climbs into the fighter, ejects the deck's door open, puts the song's cassette
      in it and pushes it shut; Play starts
      the song, the canopy closes, and the level floods into colour with the song. The
      hangar, the fighter (in the player ship's shape), the cockpit, the captain and the
      glove are generated art (`art/hangar/README.md`).
- [ ] Accessibility toggles: reduce flashing (on by default), shake, colour-blind-safe LED
      palette, remappable controls. Remapping also covers pads and arcade sticks without
      the Gamepad API's standard mapping (moved from M2), tested once there is such a pad:
      without one, only hand-made gamepad objects could check it.

## M4: library, offline, music pack

**Goal:** bring your own music, play anywhere.

- [ ] Module import (file picker, drag and drop, directory import on Chromium) and
      IndexedDB storage.
- [ ] Level caching by hash and `GEN_VERSION`.
- [ ] PWA install and full offline play.
- [ ] The bundled music pack (more songs after the first three), attribution with author
      and source links on song cards and level intros, and a credits screen.
      `tools/validate-manifest.ts` is already in CI.

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
- [ ] Rate limiting.
- [ ] One Docker image that serves the API and the built client, published to ghcr.io by a
      GitHub Actions workflow, with a Compose file and the settings needed to run it on
      Unraid (port, data volume for the SQLite database and stored replays).

**Acceptance:** a tampered score is rejected; a legitimate run appears on the board.

## M6: mobile and polish

**Goal:** good on a phone.

- [ ] Touch controls.
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

## Decided

- **Title:** Pattern Break (2026-11-08).
- **Free and open source,** with the code under MIT (2026-11-08). Bundled music keeps its
  own licenses.
- **Hosting:** Docker on Brad's Unraid server, with images published to GitHub Container
  Registry (2026-11-08).
- **Terrain:** one LED bar per row of the song, a cavern that squeezes on every hit and winds
  with the melody (2026-11-09; until then the ceiling came from the left channel and the
  floor from the right). What matters is that it feels like playing the beat and that
  there is always a path for the ship, even a hard one (2026-11-08).
- **Enemies:** drums make turrets on the floor and ceiling, the bass makes tanks on the
  floor, and the other instruments make ships. Every enemy shot lands on a note of its
  instrument (2026-11-09).
- **M2 comes in slices,** enemies and shooting first, each play-tested (2026-11-09).
- **Power-ups:** shooting down a whole formation of ships drops a capsule, which falls to
  the cave's floor so collecting one means flying low (2026-11-09). Each capsule unlocks
  the next power-up in order: double shot, missile, shield, drone, laser, boost; there is
  no buy button (2026-11-10). Boost is an afterburner on its own button, more unlocks
  adding fuel, since a permanent speed-up made the ship too hard to steer. The missile is
  the bomb for air to air: its own button, one per press, area damage, a reload. The gun is
  the standard weapon and sprays freely. Losing a life loses every power-up (2026-11-09).
- **Lives:** three; a hit costs one and the ship flies back in at the playhead (2026-11-09,
  the fly-in 2026-11-10).
- **Bomb:** its own button from the start; a concussive bomb falls to the floor and
  destroys the tanks and turrets near where it bursts (2026-11-09).
- **Nuke:** a last resort on its own button that clears the screen of enemies and
  bullets. One charges per 10 on-beat kills, up to 3 held; a level starts with none
  (2026-11-09).
- **Difficulty sets the song's speed and the cave's width;** the beat and the winding are
  the same on every difficulty, and enemies add the rest of the challenge (2026-11-09).
- **Terrain height comes from the song as it is,** with no per-song normalization. A quiet
  song makes an easy level; enemies still make it a challenge (2026-11-08).
- **Wording:** player-facing text calls modules songs and says what a module is on first
  mention (2026-11-08).
- **libopenmpt patch:** we carry `tools/libopenmpt/deterministic-prng.patch`, which seeds
  playback randomness with a fixed value so a song renders the same on every load
  (2026-11-08).
- **Server-side replay checks** stay, measured before they're turned on (2026-11-08; see
  M5).

## Out of scope (decided)

- **MP3, OGG, and streaming audio.** Levels come from tracker pattern data, which those
  formats don't have.
