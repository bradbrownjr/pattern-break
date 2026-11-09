# Roadmap

*Last updated: 2026-11-09*

## At a glance

What comes next for Pattern Break, in build order. It's a list of intentions, not a
schedule; nothing here has a promised date. Finished items leave this page and are
recorded in the [changelog](CHANGELOG.md). The design behind every item is in
[`PLAN.md`](PLAN.md).

| Item | What it delivers | Stage |
|---|---|---|
| [M1: vertical slice](#m1-vertical-slice) | One song, LED terrain scrolling in time with it, a ship you can fly and crash. | Built; Brad to play-test |
| [Songs and jukebox](#songs-and-jukebox) | Three bundled songs to pick from on a title menu, and a jukebox to listen to them. | Built; Brad to play-test |
| [Title music, demo, and levels](#title-music-demo-and-levels) | Title music, an attract demo, menu sounds, an arcade run of levels, and game-over music. | Built; Brad to play-test |
| [Cavern terrain](#cavern-terrain) | A cave that squeezes on every hit and winds with the melody; difficulty sets the song's speed and the cave's width. | Built; Brad to play-test |
| [Eight levels](#eight-levels) | Six more songs, so the arcade run has eight levels. | Built; Brad to play-test |
| [M2: enemies and scoring](#m2-enemies-and-scoring) | Notes become enemies; shooting, scoring, lives, power-ups, gamepad support, and replays that give the same score in every browser. | Enemies, shooting, scoring, the gamepad, bomb and nuke built; Brad to play-test |
| [M3: effects and look](#m3-effects-and-look) | Particles, big explosions, sound effects, copper bars, starfield, CRT filter, title and results screens, accessibility options. | Planned |
| [M4: library, offline, music pack](#m4-library-offline-music-pack) | Import your own songs, install the game, and play with no connection; a bundled, credited music pack. | Planned |
| [M5: leaderboards](#m5-leaderboards) | A global board per song, with scores checked by replaying them on the server. | Planned |
| [M6: mobile and polish](#m6-mobile-and-polish) | Touch controls, latency calibration, phone performance, tuned difficulty. | Planned |
| [Boss patterns](#later) | A mini boss at the end of level 4 and the final boss at the end of level 8, from the song's patterns. | Later |
| [Per-song enemy overrides](#later) | A sidecar file that changes which instrument spawns which enemy for one song. | Later |
| [Amiga PAL mode](#later) | An optional 320x256 display mode. | Later |
| [Player accounts](#later) | Sign-in by magic link in place of the anonymous device key. | Later |

**Stages:** *Next* is being worked on or starts as soon as the current item is finished. *Waiting for
Brad* means its checks pass and it moves to the changelog once Brad confirms it.
*Planned* is settled and waiting its turn. *Later* comes after M6 and has no plan of its own
yet.

Each milestone is finished only when its acceptance checks pass. Work them in order; don't
start the next until the current one is done.

---

## M1: vertical slice

**Goal:** the core loop on one song.

- [x] One bundled song, analyzed and played back.
- [x] LED terrain (ceiling and floor) scrolling in sync with playback.
- [x] The player ship, terrain collision, death and restart.
- [x] Capture mode in the renderer (the contract in `DEVELOPMENT.md`, "Screenshots"), with
      the ship flown by a scripted input log replayed through the sim, so captures show
      real play.
- [x] Animated clips in the screenshot pipeline: a shot can give a song-time range and a
      frame rate, each frame is captured at its own song time, and the frames are encoded
      as a GIF with a small JavaScript encoder (no ffmpeg). Captured at 2x (768x432) so the
      pixels stay sharp, a few seconds long, a few MB at most.
- [x] A gameplay clip at the top of the README, with alt text, and refreshed by the release
      workflow like the stills.

**Acceptance:** 60 fps in desktop Chrome; the terrain is audibly in time with the music;
`pnpm screenshots` produces the same clip bytes twice in a row.

**Docs:** `DEVELOPMENT.md` (renderer, capture mode, clips), the README clip and status.

**Result (2026-11-08):** all tasks done. `pnpm screenshots` gives identical clip bytes run
after run. JavaScript cost per frame in headless Chromium is 0.5 ms on average and 1.2 ms
at the 99th percentile. Two checks need Brad: 60 fps in desktop Chrome, and whether the
terrain sounds in time with the music.

## Songs and jukebox

**Goal:** songs worth playing, and a way to hear them before picking one. Added 2026-11-08,
after the test song proved dull to play to. It pulls the first songs and the manifest check
forward from M4.

- [x] Three Public Domain songs from The Mod Archive in `music/`, each checked on its page
      (license, and an MD5 matching the file), with complete `manifest.json` entries.
- [x] `tools/validate-manifest.ts`, run by `pnpm check` and CI (`pnpm check:music`).
- [x] A Node test that every bundled song makes a level whose path check passes and that
      the autopilot finishes on every difficulty.
- [x] The title screen as a menu (Play, Song, Difficulty, Jukebox) driven by up, down,
      left, right, confirm and back, so M2's gamepad maps onto it.
- [x] The jukebox: the song list with authors, play and stop, play on to the next song, an
      LED spectrum of what is playing, and the playing song's title, author, license and
      time.
- [x] Q while paused, and Esc after a crash, go back to the title, so a run can end without
      finishing the song.

**Acceptance:** Brad picks each song from the title menu and plays it; the jukebox plays,
stops and moves between songs with the arrows and Enter; `pnpm check` passes.

**Docs:** `DEVELOPMENT.md` ("Playing it", "Bundled songs", "Menus and the jukebox", the
commands and tests), `PLAN.md` ("Client UI"), the README status and music credits.

## Title music, demo, and levels

**Goal:** an arcade front end. Added 2026-11-08 at Brad's request; it pulls attract mode and
the menu sounds forward from M3.

- [x] A start screen ("Press any key"), whose first key press starts the title music, The_Epic_Chip, which loops.
- [x] An attract demo: the title song's level flown by the autopilot, starting on the song's
      change at 18 s (or after 20 s with no key press), joined where the music is. Any key
      returns to the menu.
- [x] Menu sounds synthesized as square-wave chip notes: coin, move, change, select, back,
      start.
- [x] An arcade run: Play starts level 1 (Numen in Da Chip) and goes through the levels in
      order; Keygen 9000 is the last. Practice plays one song, The_Epic_Chip first. Each
      level opens with a card crediting its song.
- [x] Game over on any crash, with Keygen 9000's first 8 s fading out. Any key retries the
      level.

**Acceptance:** Brad plays the arcade run, practice, and the demo, and is happy with the
title music, the demo's timing, the menu sounds, and the game-over music; `pnpm check`
passes.

**Docs:** `DEVELOPMENT.md` ("Playing it", "Bundled songs", "Menus and the jukebox"),
`PLAN.md` ("Client UI"), the README status.

## Cavern terrain

**Goal:** terrain that feels like the song's beat and like a cavern. Added 2026-11-09 after
Brad's play-test of the demo: the walls showed a sliding spectrum rather than the beat, and
the gap (a median of 111 to 125 px on normal) was far wider than the ship. A first version
that drove the walls from the bass and treble levels still didn't feel like it responded to
the music; measured, it closed only 1.04 to 1.16 times as much on beat rows.

- [x] The cave squeezes on every hit: the jumps in the song's channel volume meters when
      notes start narrow both walls at once, and the cave opens again over a few bars.
- [x] The cave winds with the melody: the gap rises on high notes and dips on low ones,
      following the highest note of any instrument that isn't a drum.
- [x] Difficulty sets the song's speed (0.9, 1 and 1.15 times, pitch unchanged) and the
      cave's width (base gap 104, 90, 76 px; minimum 52, 44, 36 px). Each difficulty is
      analyzed at its own speed.
- [x] Every three consecutive gaps share 10 px, since the ship touches two bars at once,
      and the first bar's gap is centred on the ship's start.
- [x] Walls are LED segments from the screen edge in, green to red; unlit segments are not
      drawn, so the passage is plain background.
- [x] `GEN_VERSION` 2 and LevelData format 2, with the golden hashes regenerated.

**Acceptance:** Brad plays the demo and the three songs and finds the walls move with the
music, the cave feels like a cave, and each difficulty's speed and width are right; every bundled song
passes the path check and the autopilot on every difficulty; `pnpm check` passes.

**Docs:** `PLAN.md` ("Level generation", "Visual spec"), `DEVELOPMENT.md` ("Level and
sim", "Rendering"), the README, the "Decided" list below.

## Eight levels

**Goal:** the arcade run Brad wants to begin with: the practice and demo song plus levels 1
to 8 (2026-11-08).

- [x] Find six songs for levels 2 to 7: PD, CC0 or CC BY, checked on their Mod Archive pages,
      no covers. Brad listens and picks. 34 Public Domain songs by Drozerix and JAM were
      measured and 13 shortlisted; Brad took the suggested six (2026-11-09).
- [x] Order the levels by difficulty (gap sizes, tight bars, rows per second), with Numen in
      Da Chip first and the full Keygen 9000 last: FastLane, CHiP_OVERTURE,
      The_Dim_Dungeon, 4_RNDD!, Girl From Mars, Wrath_of_the_Djinn.
- [x] Each song passes the bundled-songs test and gets complete `manifest.json` entries.
- [x] `SONG-DIGEST.md` records every song considered, with its numbers, and why the others
      were left out, for adding levels later (Brad, 2026-11-09).

**Acceptance:** the arcade run has eight levels, each playable on every difficulty.

**Docs:** `DEVELOPMENT.md` ("Bundled songs"), `SONG-DIGEST.md`, the README music credits.

## M2: enemies and scoring

**Goal:** a complete, deterministic run. Built in slices, each play-tested before the next
(Brad, 2026-11-09).

### Enemies and shooting

- [x] Turrets from the drums, on the bar tips of the floor and the ceiling; tanks from the
      bass, along the floor; formations of ships from the other instruments, at heights
      from their pitch and with motion from their effects.
- [x] Every enemy fires on its own instrument's notes, aimed at the ship. Difficulty sets
      the spacing, bullet speed, and how many bullets can be in flight.
- [x] Hold fire to shoot (Space, Z or J). Turrets and ships take one hit, tanks three.
- [x] Three lives: a hit costs one, and the ship comes back at the playhead, safe for 2 s.
- [x] Turrets and tanks count as wall in the path check, so a level never needs a kill to
      get through.
- [x] The autopilot holds fire and dodges bullets and ships, so the attract demo fights.
- [x] `GEN_VERSION` 3, `SIM_VERSION` 2 and Level format 2, with the golden hashes
      regenerated. The golden autopilot run has enemies, so the browser tests check them in
      every engine.

**Acceptance:** Brad plays the levels and finds the enemies fair, readable, and tied to the
music; `pnpm check` passes.

**Docs:** `PLAN.md` ("Level generation", "Simulation", "Visual spec"), `DEVELOPMENT.md`
("Enemies", "Simulation", "Playing it"), the README status.

### Scoring

- [x] Kill points (100 a ship, 200 a turret, 300 a tank), doubled within 25 ms of a note
      of the enemy's instrument; a multiplier up 1 every 10 kills without a hit, to 4; 1000
      a life left at the end of the song.
- [x] The score in the top right, each kill's points where it fell (amber on the beat), the
      multiplier after the lives, and the score on game over and level complete, with the
      arcade run's total.
- [x] `GEN_VERSION` 4 and Level format 3 (each instrument's note ticks), `SIM_VERSION` 3
      (4 once turrets went to 200), with the golden hashes regenerated.

**Acceptance:** Brad plays a few levels and finds the on-beat bonus noticeable and earned,
not automatic; `pnpm check` passes.

**Docs:** `PLAN.md` ("Simulation"), `DEVELOPMENT.md` ("Enemies", "Simulation", "Playing
it", "Renderer").

### Gamepad

Moved up from M6 (2026-11-08): a shooter wants a pad from the start.

- [x] Pads with the Gamepad API's standard mapping, read once a frame: the stick or D-pad
      flies, A, X, RB or RT fires, Start pauses, Select quits from the pause. Menus take
      the same `MenuAction`s as the keyboard, with held directions repeating.
- [x] On a fresh page a pad press on the start screen says a key or click must come
      first, since browsers start sound only on those.

**Acceptance:** Brad plays a level and the menus with a pad, keyboard untouched after the
first key; `pnpm check` passes.

**Docs:** `DEVELOPMENT.md` ("Playing it", "Menus and the jukebox"), the title screen's
help.

### Bomb and nuke

- [x] The bomb button drops a concussive bomb that falls in an arc and bursts on the
      floor or an enemy, destroying everything within 24 px, tanks included. One per
      press, one in the air, 1 s to reload; a HUD icon shows when it is ready. Never more
      than one tank is on screen at once, on any of the 27 levels.
- [x] At most 3 shots in flight, not 6, so a miss costs time and aiming beats spraying.
- [x] The nuke button destroys every enemy on screen and clears the bullets. One charges
      per 10 kills on the beat, up to 3, shown after the lives.
- [x] Keys X or K (bomb) and V or ; (nuke); pad B and X. The autopilot bombs, and nukes
      when it can't dodge.
- [x] `SIM_VERSION` 5, then 6 for the reload and the shot cap, with the golden hashes
      regenerated.

**Acceptance:** Brad finds the bomb useful against tanks without making shooting pointless,
timing and aim matter more than holding buttons, and the nuke is worth earning; `pnpm check` passes.

**Docs:** `PLAN.md` ("Simulation"), `DEVELOPMENT.md` ("Simulation", "Playing it",
"Renderer").

### Still to come

- [ ] Capsules from whole formations and the power-up meter: boost (an afterburner on its
      own button), double shot, laser, option pod, shield. Input grows to 16 bits for the
      boost button.
- [ ] Pads and arcade sticks without the Gamepad API's standard mapping, which need a
      way to assign their buttons.
- [ ] Replay recording and playback.
- [ ] Cross-engine determinism tests in Vitest browser mode.
- [ ] The headless sim benchmark (10 000 ticks, maximum entities), which also gives the
      first number for what a server-side replay check costs.

**Acceptance:** a replay recorded in Chromium reproduces the same score in Firefox, WebKit,
and Node.

## M3: effects and look

**Goal:** it looks and feels like the pitch.

- [ ] Particles, copper bars, parallax starfield, CRT filter, hit flashes.
- [ ] Big explosions: a destroyed ship breaks apart pixel by pixel, each pixel of its sprite
      flying off as its own particle in its own colour, with a colourful shockwave ring and
      a short screen shake. With "reduce flashing" on, the ring's brightness is capped.
- [ ] Sound effects, made in the browser with Web Audio (no sound files to license): shots,
      hits, power-ups, and an explosion with a deep boom, echo, and reverb. Mixed under the
      music, with their own volume and an off switch.
- [ ] The results screen. (The title screen's attract mode and menu sounds came earlier,
      in "Title music, demo, and levels".)
- [ ] Accessibility toggles: reduce flashing (on by default), shake, colour-blind-safe LED
      palette, remappable controls.

## M4: library, offline, music pack

**Goal:** bring your own music, play anywhere.

- [ ] Module import (file picker, drag and drop, directory import on Chromium) and
      IndexedDB storage.
- [ ] Level caching by hash and `GEN_VERSION`.
- [ ] PWA install and full offline play.
- [ ] The bundled music pack (more songs after the first three), attribution with author
      and source links on song cards and level intros, and a credits screen.
      `tools/validate-manifest.ts` is already in CI (see "Songs and jukebox").

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
- **Lives:** three; a hit costs one and the ship comes back at the playhead (2026-11-09).
- **M2 comes in slices,** enemies and shooting first, each play-tested (2026-11-09).
- **Power-ups:** shooting down a whole formation of ships drops a capsule. The meter is
  boost, double shot, laser, option pod, shield. Boost is an afterburner on its own button:
  the first buy unlocks it and more buys add fuel, since a permanent speed-up made the
  ship too hard to steer. Losing a life loses every power-up bought (2026-11-09).
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
