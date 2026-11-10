# Changelog

Finished work, newest first. When a roadmap item is done, it leaves the
[roadmap](ROADMAP.md) and is recorded here.

Until the game is playable, entries list finished roadmap items under **Milestones**. From
the first playable build on, entries use **New Features**, **Improvements**, and **Bug
Fixes**, in that order.

---

# November 10, 2026

## Milestones

* **CI: the browser tests pass in every engine.** The audio tests had failed on every push
  since November 8: Firefox had no sound server to play into, and WebKit rendered the
  worklet test's offline context before the worklet saw its start message. CI now starts
  PulseAudio, and the test waits for the song to start before rendering on.

---

# November 9, 2026

## Milestones

* **Play-test: Impossible looks and sounds the part.** Its walls are a gradient of dark to
  bright red instead of the neon green to red, and its hangar intro flashes red strobes
  twice a second while an air raid siren wails twice in the distance. Impossible runs go
  on the leaderboards; only cheats keep a run off.
* **Play-test: a shield on every life.** No one had finished a level, so every life now
  starts with a 6-point shield: a ship's bullet costs 2, a tank's shell 3, a turret's shell
  6, ramming 3, and a wall 3, which bounces the ship back towards the middle of the cave
  instead of killing it. It flickers with a thud on each hit, the shield power-up refills
  it, and tanks and turrets fire shells drawn apart from the ships' bullets (`SIM_VERSION`
  12). The zigzag test bot now lives about three times as long.
* **Play-test: extra lives.** One every 20 000 points, up to 9, with a chime and a "1UP"
  over the ship.
* **Play-test: touch controls.** On a phone or tablet a floating stick appears under the
  left thumb, and six buttons in the bar right of the picture show the HUD's symbols for
  pause, nuke, boost, missile, bomb and fire. They work the menus too and hide while a
  gamepad is connected.
* **Play-test: a bigger, sharper picture on high-density screens.** The picture scales by
  whole device pixels instead of whole CSS pixels: a phone held sideways went from 1x to
  640x360. A tap now starts the sound on a phone, where it used to act too early for the
  browser to allow it.
* **Play-test: the jukebox fits Crush.** With ten songs, Back ran into the spectrum; the
  rows close up to fit.
* **Play-test: the gamepad's Controls page.** Opening Controls after a pad press shows
  the Gamepad page again; since the split into three pages it showed WASD.
* **Play-test: a fairer level 1.** Every cave is 14 px wider, one LED segment
  a side, after Numen in Da Chip played too tight (`GEN_VERSION` 6). The recorded run of
  level 1 that used to die now finishes the song.
* **Play-test: a gentler respawn.** After a hit the ship flies in from the left
  along the cave's centre for 0.5 s with the controls locked, and the walls count again as
  soon as it has control. It used to appear at once and ignore the walls for 2 s, so it
  could drift into one and die as its safe time ended.
* **Play-test: power-ups unlock on pickup.** Buying from the meter in flight
  was impossible, so each capsule now unlocks the next power-up in the order double shot,
  missile, shield, drone, laser, boost, and the Buy button is gone. Double and laser stack.
  The meter lights what the ship has and greys the label of the next (`SIM_VERSION` 11).
* **Play-test: a demo that shows the weapons.** The autopilot steers for
  capsules when no bullet is near, so in its 30 s the demo picks up two power-ups, fires
  missiles and drops a bomb; before, it showed none of them.
* **Play-test: controls in three pages.** Arrows with Z, X, C, V and Shift;
  WASD with J, K, L, ; and '; then the gamepad. Each lights only its own keys, where one
  keyboard page with both layouts showed too many.
* **Play-test: three secrets.** The Konami code on the title screen gives
  infinite lives; holding Esc or Start while choosing Play gives god mode; and stepping the
  difficulty through easy, normal and hard three times shows Impossible, one level of
  Crush by Drozerix at 1.5 times level 8's speed. A run with a cheat shows "Cheat", and its
  replay (format 2) records it so the boards can refuse it (`GEN_VERSION` 7).
* **M2: Replays.** Every run that ends keeps a replay: the song's SHA-256, the difficulty,
  `GEN_VERSION`, `SIM_VERSION`, the score, and the inputs run-length encoded. R watches it,
  S saves it as a `.pbreplay` file, and a saved file dropped on the title screen plays. A
  replay the game recorded in Chromium scores the same 34 800 in Node, Chromium, Firefox
  and WebKit, which is what the M5 server check needs. `bench:sim:max` measured that check
  at 4.1 s of song analysis and 0.15 s of level generation and sim for a 198 s song.
* **M2: Retries play like a fresh start.** Watching the first replay showed that restarting
  a level left enemy fire out of step, so every retry played differently from a fresh run
  and scored differently from its replay. Fixed in `SIM_VERSION` 10, with a test.
* **M2: Controls screen and pause menu.** A Controls item on the title menu, and on the new
  pause menu (Resume, Controls, Quit), shows a keyboard page and a gamepad page, each a
  drawing with every key or button in its action's colour. The title and jukebox lost
  their control hints, the jukebox's list and spectrum no longer overlap, and on-screen
  text is cut to arcade prompts ("R Replay  S Save").
* **M2: Power-ups.** Shooting down a whole formation drops a capsule that falls to the cave
  floor and scrolls away on it. Each capsule moves the meter's highlight along boost,
  double, laser, missile, drone and shield, and the buy button buys the lit one. Boost and
  the missile have their own buttons. Falling capsules cut the autopilot's pickups from 17
  to 60 a level on normal to 0 to 8.
* **M2: Bomb and nuke.** The bomb falls in an arc and bursts on the floor or an enemy,
  destroying everything within 24 px, tanks included, then reloads for 1 s. The nuke clears
  the screen of enemies and bullets; one charges per 10 kills on the beat, up to 3.
* **M2: Gamepad.** Pads with the Gamepad API's standard mapping fly, fire and drive the
  menus next to the keyboard. Pads without that mapping move to M3's remappable controls.
* **M2: Scoring.** Kills score 100 a ship, 200 a turret and 300 a tank, doubled within 25 ms
  of a note of the enemy's instrument, with a multiplier that grows to 4 on a streak
  without a hit and 1000 for each life left at the end of the song.

# November 8, 2026

## Milestones

* **M2: Enemies and shooting.** Notes become enemies: turrets from the drums on the bar
  tips, tanks from the bass along the floor, and formations of ships from the other
  instruments. Each fires on its own instrument's notes. The ship has three lives, and
  turrets and tanks count as wall in the path check, so no level needs a kill to get
  through.
* **Levels: Eight levels.** Six more Public Domain songs from The Mod Archive, so the
  arcade run has eight levels ordered by difficulty, from Numen in Da Chip to Keygen 9000.
  `SONG-DIGEST.md` records every song considered and why the others were left out.
* **Levels: Cavern terrain.** The walls are a cave that squeezes on every hit and winds with
  the melody, built from the song's channel volumes and its highest note. Difficulty sets
  the song's speed (0.9, 1 and 1.15 times) and the cave's width.
* **Front end: Title music, demo, and an arcade run.** A start screen starts the title music;
  an attract demo flies the title song's level by autopilot; the menus have square-wave
  chip sounds. Play runs the levels in order, each opening with a card crediting its song,
  and game over plays the last song's opening as it fades.
* **Songs: Bundled songs and jukebox.** The first Public Domain songs, a manifest check in
  CI, a title menu to pick song and difficulty, and a jukebox to hear them with an LED
  spectrum.
* **M1: Vertical slice.** One song analyzed and played back, LED terrain scrolling in time
  with it, and a ship that flies and crashes. Capture mode replays a scripted input log
  through the sim, so screenshots and the README's gameplay clip show real play and come
  out byte for byte the same each run.
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
