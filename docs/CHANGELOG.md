# Changelog

Finished work, newest first. When a roadmap item is done, it leaves the
[roadmap](ROADMAP.md) and is recorded here.

Until the game is playable, entries list finished roadmap items under **Milestones**. From
the first playable build on, entries use **New Features**, **Improvements**, and **Bug
Fixes**, in that order.

---

# November 13, 2026

## Milestones

* **Normal can be won.** Brad couldn't clear level 1 on normal. On that level, Neon Techno,
  turrets fired 103 shells a minute, each costing the whole shield, so it was the hardest
  arcade level by the new measure below. Enemy bullets now cost the shield 1 (ship), 2
  (tank) and 3 (turret) points, as Brad set, not 2, 3 and 6, and each turret fires at most
  1, 3 or 4 shells by difficulty. `pnpm check:difficulty` gained a human model: the
  autopilot misses 20% of the enemy bullets, and it must finish every easy and normal
  level. With the old rules it failed level 1 on normal, as Brad did. With the new ones
  it loses 0 to 2 lives on each arcade level on normal, and 7 on the last. Levels 2 to 7
  are now in order of how hard the model finds them. The studies behind it, and every
  other source the project has used, are listed in the new `docs/REFERENCES.md`.
  `GEN_VERSION` 10 and `SIM_VERSION` 15, so the leaderboards start over.

# November 12, 2026

## Milestones

* **Screenshots and docs brought up to date.** Brad asked: `pnpm screenshots` redrew the
  14 figures that had changed (the new HUD, Help's falling wall row, Settings' Fullscreen
  row, the Scores screen without its name row), and their alt text now says what they show.
  The README's status covers breaking walls, full screen and the phone's layout, and PLAN
  and the development guide cover the upright picture, Fullscreen and stick speed.
* **The sticks steer by how far they're pushed.** Brad found the touch stick "way too
  sensitive": past a 10 px dead zone it was full speed. Now the touch stick and a
  gamepad's stick move the ship as fast as they lean, from still at the dead zone's edge to
  full speed at full reach. The touch stick is larger (112 px across) with an 8 px dead
  zone, and a pad's stick uses the dead zone Microsoft's XInput guide gives. The sim still
  sees a direction held or not, so a part push holds it on a share of ticks; replays and
  the leaderboards are unchanged. Keys and the D-pad stay full speed.
* **Full screen, a phone held upright, and menu keys as icons.** Brad's requests: the game
  goes full screen on the first tap, click or key, on any device (not an iPhone's Safari,
  which can't; adding the game to the home screen does it there), and Settings has a
  Fullscreen row to turn it off. In Chrome and Edge, Esc stays the pause key and holding
  it leaves full screen. Held upright, the picture fills the width in the top half, with
  the pad under it: the stick at the left and the six buttons in the same grid as
  sideways. Off play the six buttons give way to only the keys a screen uses, each an
  icon: Select and Back in the menus; Retry, Title, Replay and Save on game over; Post,
  Skip and Name on the name entry; Remove in the jukebox, which touch couldn't do before.
  Prompts that name keyboard keys are left out while they show. A tap shorter than a frame
  no longer gets missed. Holding Back while choosing Play gives god mode on touch.

# November 11, 2026

## Milestones

* **Missiles and bombs break the walls, and a cut ceiling falls.** Brad's idea: a blast
  breaks every wall segment it reaches, leaving the 2 at each wall's edge. The part of a
  hanging wall beyond the cut drops as a block that crushes every enemy it falls on,
  scoring each, so a missile into the ceiling can clear a crowded stretch below. A block
  costs the ship a wall's 3 shield points; braking and backing up gets out from under it.
  Broken floor crumbles; a turret on a broken tip falls with it and a tank drives into the
  hole, both for points. Blocks shatter on the floor, so the way through stays open.
  Rubble flies where walls break, a new crumble sound plays when a block lands, Help lists
  both, and the autopilot dodges falling blocks. `SIM_VERSION` 14, so the leaderboards
  start over again.
* **Song lengths in the jukebox.** Each song's row shows its length between the title and
  the author, as Brad asked. Bundled songs' lengths are in the music manifest, checked
  against libopenmpt by `pnpm check:music`; an imported song's is measured when it's
  imported, or the first time it plays for one imported earlier.
* **Every weapon stops on the walls, peak dots are gone, and the autopilot plays like a
  person.** Brad didn't like the peak dots and wanted shots to hit walls. Shots, double
  shots, drone shots and the laser now stop on the LED walls, and a missile bursts on them,
  its blast catching what's near; a turret on a bar's tip still takes a shot that reaches
  it. The peak dots, off since 2026-11-08, are removed from the levels. With shots
  stopping on walls the old autopilot failed October_Chip's Hard level, so it was
  rewritten: it lines up its shots on the enemy most worth shooting that it has a clear
  line of fire to (ships, then turrets, then tanks), fires missiles at any enemy lined up,
  and dodges across as well as up and down, braking and backing up, without flying into
  walls. Across every bundled and test song on easy, normal and hard it loses 10 lives
  and finishes every level. The demo shows it.
  A missile fired point blank into a wall now gets its launch sound even when it bursts
  before the next frame. `GEN_VERSION` 9 and `SIM_VERSION` 13, so the leaderboards start
  over.
* **Two fixes from Brad's play-test of the name entry.** The end screen's line reads
  "Sent" as soon as the run is safe in the queue, so the player knows they can move on;
  the rank follows when the server answers, and the run just posted now goes ahead of any
  older ones waiting. And back from a replay stopped early, game over showed the replay's
  last frame: its ship still flying, shielded, over a level with no walls, with the HUD
  as the replay left it. The run's last frames are drawn again now, as play drew them, and
  the crash's explosion, flash and shake don't play a second time: the results come back
  at once.
* **Names on the end screens, arcade style, from Brad's play-test.** Game over and the
  clear screens now ask for a name for every run that can be posted, filled in with the
  last name used: Enter posts, typing replaces it, up and down change a letter, and Esc
  skips. Names are up to 8 capitals and digits. Each run carries its own name, so players
  taking turns on one device post under their own, and each device keeps its colour on
  the boards, which tells apart two players with the same name. An arcade run goes on the
  arcade board only when every level went under one name. A rough filter turns down
  obvious vulgarities without catching innocent words like CUTLASS. The Name row on Scores,
  the "N Set name" line and profile links are gone, and the server drops stored links.
  Fixed: one run held for a name stopped every later run from being sent, so they all
  read "Queued".
* **A graphical HUD, from Brad's play-test.** The power-up bar and its six labels along
  the bottom are gone, and the HUD is icons and digits. Top left, the arsenal: bomb,
  missile, double, laser, two drones, boost with its fuel, and three nukes, each in a fixed
  place and faint until held. Top right, the multiplier beside the score, where it reads
  as part of the score (after the missile icon it read as a missile count). Bottom left, a
  ship per life, with room for a long run's nine; bottom right, six shield pips. A capsule
  now shows the icon of the power-up it gives. The Help screen matches.
* **M6: mobile and polish, closed with phone tuning parked.** Brad parked further
  performance tuning so the game can be finished. Where it stands: Brad's PC holds 60 fps
  with 1.9 ms of frame work at the 95th percentile; under 4x CPU throttling on a clean
  GitHub runner, 13 of the 16 levels are under the 8 ms goal and the worst is 9.6 ms. The
  Galaxy S25 check moved to the new `docs/PLAYTEST.md`, a short list of tests that need
  people and real hardware (the phone at 120 Hz, how each difficulty feels, Sync with
  Bluetooth headphones, name entry on a phone and a gamepad, the new demo flight), with how
  to report them: a screenshot of the end screen with Perf on. What they find becomes
  roadmap items.
* **M6: a Perf setting, with a report on the end screens.** Settings, Perf On does what
  `?perf=1` did: frames a second and frame times in the corner, now under the score instead
  of over it. Game over and the clear screens then end with three lines for a screenshot:
  the level, song and difficulty; frames a second, frames, the window size and the CRT
  setting; and the mean, 95th and 99th percentile and slowest frame's work over the whole
  run. For checking Brad's phone without reading the corner mid-run. `?perf=1` still works
  for `tools/perf-check.ts`.
* **M6: difficulty guardrails, in place of fixed targets.** No published standard sets
  enemies a minute or bullets on screen for an arcade shooter, and rhythm games, the
  nearest match to levels built from music, step their difficulties against each other.
  So `pnpm check:difficulty` checks what a player relies on, on the 16 bundled songs and 5
  test songs: the autopilot finishes every level on every difficulty, each step up has more
  enemies a minute on every song, and no song is as busy as the median song one difficulty
  up. All 64 levels pass, and CI runs the check as its own job. The test songs are unbundled
  Drozerix songs, Public Domain, chosen for range (the most notes a second, the fewest,
  the longest, the shortest, and one that used to kill the autopilot), and kept in the test
  fixtures with their own manifest, which `pnpm check:music` now checks too.
* **The autopilot dodges without flying into walls.** It used to weigh its moves against
  bullets and ships alone, 16 ticks ahead, so on The Dim Dungeon 2 and October_Chip on
  Hard it dodged into a floor that rose beyond those 16 ticks and lost every life. It now weighs
  plans that move for 1 to 32 ticks and then hold, against bullets, ships and the walls,
  32 ticks ahead. Over the 63 levels on easy, normal and hard, lives lost fell from 18 to
  9 and failed levels from 2 to none, and it runs as fast as before. The title demo flies
  differently from here on; the golden autopilot hashes were updated, and replays don't
  depend on it.
* **The Perf check's first clean run.** On a GitHub runner with nothing else on it, under
  4x CPU throttling, the 95th percentile of frame work ran from 5.9 to 9.6 ms; 13 of the 16
  levels were under the 8 ms goal.

---

# November 10, 2026

## Milestones

* **M6: faster drawing, and a frame-time readout.** The LED walls made the renderer rebuild
  its whole draw list every frame, as segments came and went; they now scroll as one piece
  and a column is redrawn only when it takes a new bar. Under 4x CPU throttling, frame work
  on Neon Techno fell from about 14 ms to 7 ms on average, with the picture unchanged.
  `?perf=1` now shows frames a second and frame times in the corner, for checking a phone,
  and `tools/perf-check.ts` measures every bundled level under throttling. Brad's phone, a
  Galaxy S25, is the target; the 8 ms goal under 4x throttling isn't met yet.
* **M6: name entry by gamepad and touch.** A gamepad sets a name the arcade way: up and
  down cycle the letter under the cursor, capitals first, left and right move, Y erases,
  and the hint shows the pad's buttons. On a phone, a touch on the name entry opens the
  phone's keyboard, Enter moves to the next field, and a touch on Save saves. Spaces at a
  name's ends are trimmed before saving, as the server wants none. Tested with pad edits
  alone in Node, typing into the touch input in Chromium, Firefox and WebKit, and a touch
  run end to end against a local server.
* **M6: a Sync screen for the audio offset.** Under Settings, clicks play every half
  second and the player presses on each; the median gap over 16 presses, after 4 warm-up
  presses and any slips over 100 ms, becomes the offset, so the walls and the presses line
  up with what the player hears, Bluetooth headphones included. The Sync row sets it by
  hand too, -300 to +100 ms in 5 ms steps, and it is kept with the settings. A press is
  read the way the game's clock reads one, not with `getOutputTimestamp()` as planned, so
  the offset corrects the clock the game uses. Tested in Node and, with the clicks
  rendered, in Chromium, Firefox and WebKit.
* **Practice is now Levels, from Brad's review.** Its runs go on the song boards, so it
  isn't practice any more. A song played from it opens with a "Ready" card.
* **M5: leaderboards.** Global boards per song and difficulty, and an arcade board for a
  run's total, from Brad's answers: songs players import get boards too. The image now
  runs a Fastify server that serves the game and the leaderboard API, and checks every
  run by building the song's level and playing its inputs again; the score must come out
  the same, so a raised score or edited inputs are turned down. A song the server lacks
  is uploaded once and checked against its hash. In the game, runs post as they end
  (arcade runs at a game over and after the last level), the end screen shows the run's
  rank, runs finished offline wait in a queue, and a Scores screen on the title menu
  shows each board's top 10, with the player's name and link. From Brad's review, each
  player's rows take a bright colour of their own, picked from a hash of their key, and
  how far an unfinished arcade run got sits in its own column so the scores line up. The player is a key pair
  made in the browser that signs each submission. Measured in the Unraid container, a
  check takes about 3 s the first time a song is seen and 5 to 15 ms after, so every run
  is checked. The data lives in `/data`, mounted from `/mnt/user/appdata/pattern-break`.
* **Fixed: a freeze at a level's start.** The hangar intro could stop the game on its
  first frame, the screen left on the title, about one start in two in headless Chromium.
  A frame's timestamp can come a moment before the key press that started the intro, and
  the negative time picked a walk frame that doesn't exist. The intro's clock now never
  reads below 0.
* **Sleepy Snow plays under the ending's credits,** Brad's pick from six Drozerix songs.
  It is in Practice and the Jukebox too. AI Renaissance and May is 4 Her, his other two
  favourites, are kept for an end scene before the credits (on the roadmap under Later).
* **A credit roll, from Brad's review.** The credits roll slowly up the screen like a
  film's. Up, down or Enter stops the roll on a row, Enter opens its page, and after 4 s
  with no input it rolls on. From the title menu the roll loops over the title music.
  Finishing a run now leads to an ending: "Thank you for playing" with the run's
  difficulty and total, the credits, and "The End", then the title; Esc skips to The End.
  The ending's own song waits for Brad's pick, so the title song plays for now.
* **No license on the song lines, from Brad's review.** The title, the Jukebox and the
  level intro credit a song as "by Drozerix"; its license is on the Credits screen.
* **M4 finished: library, offline, music pack.** Its acceptance check passes: the game
  installs, plays with no connection, and imports and plays a new song offline
  (`pnpm check:offline`). The last step adds the music pack and a Credits screen:
  * Five more Drozerix songs, checked again against their pages: Augmented_Emotions,
    The_Dim_Dungeon_2, Cabin Fever!, Chica-pop! and Peachy Chip. They are in Practice and
    the Jukebox; the run keeps its eight levels.
  * Credits, the title menu's last row, lists the songs, the code the game is built on
    with its licenses, and the game. Enter opens a song's page on The Mod Archive, a
    license text the game serves (offline too), or the source code. Song lines elsewhere
    keep the author and license without a link (Brad, 2026-11-10).
  * The build now serves the bundled packages' licenses under `licenses/`, libopenmpt's
    BSD-3-Clause notice among them.
* **Keep imported songs.** After the first import, the game asks the browser to keep its
  data when the device runs low on space. Firefox asks the player; Chrome, Edge and Safari
  decide on their own.
* **M4: install and offline play.** The game has a web app manifest and icons, and a
  service worker that caches every built file, the bundled songs included, on the first
  visit, so it installs as an app and plays with no connection; imported songs work
  offline too. Online, the page always loads the newest build. `pnpm check:offline` (also
  in CI) installs it in headless Chromium, cuts the network, imports a song and plays it.
* **One Import row, from Brad's review.** Import and Import folder become one Jukebox row,
  "Import < File >", where left and right choose File or Folder.
* **M4: import songs.** The Jukebox has Import and Import folder rows, and song files can
  be dropped on the title or the Jukebox. Each `.mod .xm .s3m .it` file is hashed, checked
  by analyzing it, and kept in the browser; imported songs join Practice and the Jukebox,
  and Del (twice) removes one. The Jukebox list now scrolls, with a scroll bar.
* **M4: level cache.** Analyzed levels are kept in the browser's IndexedDB, keyed by the
  song's hash, the difficulty's tempo and `GEN_VERSION`, so each song is analyzed once per
  difficulty instead of on every visit. Entries from an older `GEN_VERSION` are deleted.
  The same database has a store ready for imported songs.
* **Neon Techno is level 1.** Brad picked it from the three candidates, so the run has
  eight levels again: Neon Techno, then RNDD_Keygen#1.0, with The_Dim_Dungeon back at level
  4. Peachy Chip goes into the M4 music pack. The recorded replay is now a run of Neon
  Techno.
* **Drozerix catalog.** `SONG-DIGEST.md` now lists all 80 of Drozerix's modules with
  their license, measurements and status, for picking songs later; 38 more Public Domain
  songs were downloaded, checked and measured. Three are picked for Brad to hear as the
  new level 1: Neon Techno, Peachy Chip and Viral Legacy.
* **Drozerix only.** The bundled music keeps to Drozerix's style, so JAM's two songs,
  Numen in Da Chip and FastLane, leave the run. RNDD_Keygen#1.0 is the new level 1, and
  the run has seven levels until a second new song is picked; Silicon Dancer was tried
  and dropped as too funky. The recorded replay is now a run of RNDD_Keygen#1.0.
* **Amiga resampler emulation off** (`GEN_VERSION` 8). With it on, a 4-channel MOD took
  15 times as long to analyze (18 s for Silicon Dancer, against 1 s), and Brad found MODs
  sound fine without it. Only MODs change; every bundled song is an XM.
* **Title menu and CRT, from Brad's play-test.** Help moves below Settings on the title
  menu, and the CRT look is on by default. A player who has already saved settings keeps
  their own CRT choice.
* **M3: remappable controls. M3 is finished.** Settings has Keys: each action can have up
  to three keys, so the defaults still fit (Z, J and Space all fire), and menus follow
  them: the directions move, Fire confirms, Bomb backs out. Esc always pauses, and Enter,
  Esc and Backspace always work in menus, so no layout can lock a player out. A pad can be
  remapped too, one layout for standard pads and one for each other pad, so pads and
  arcade sticks without the standard mapping now work once their buttons are set. The
  Controls screen draws whatever is set. Y on a pad now watches the replay on the end
  screens; it never did, since the pad's Y presses weren't passed on. Hit-stop is dropped
  from the plan: a freeze would put the picture out of step with the music.

* **M3: colour-blind LED colours.** Settings has LEDs, Neon or Colour-blind. Colour-blind
  lights the walls dark blue to yellow (cividis, a colour map made to read the same with
  red-green colour blindness), each segment brighter than the one before, on every
  difficulty.
* **M3: the results screen.** Level complete and game over now break the score down into
  kills, the beat bonus and the lives bonus, lined up in columns, and show the personal
  best for the song and difficulty, kept in this browser; a new best shows in amber. A run
  with a cheat never sets one. Replay and Save stay on the same screen.
* **M3: the look.** Copper bars, bands of violet, cyan, lime, amber and magenta, sway
  behind the stars, glow brighter with the bass and pulse on each downbeat; with Flashing
  Reduced their brightness never swings far enough to count as a flash. Sparks fly off the
  LED tips when a row with a note reaches the playhead. A tank that takes a hit and
  survives shows white for a moment. Settings has a CRT look, off by default: a slight
  bloom, scanlines and a vignette. Screenshots now report the page's errors.
* **M3: the ship breaks apart.** When the ship is destroyed, every pixel of it flies off in
  its own colour with hot sparks, inside a shockwave ring of cyan, lime, amber and magenta
  that grows and fades, and the screen shakes. Flashing Reduced dims the ring.
* **M3: flashing and shake settings.** Settings has Flashing, Reduced until the player
  changes it, and Shake. Reduced keeps every flash (the game-over flash, the nuke, the
  hangar's red strobe) at a quarter of white or less and never starts more than three in a
  second, under WCAG 2.2's flash thresholds; Full is brighter with no limit on how often.
  Every crash now shakes the picture for 0.3 s, by whole pixels, the same way in a replay;
  Shake Off keeps it still.
* **CI passes again.** The browser tests had failed on every push since November 8.
  Firefox had no sound server to play into, and WebKit rendered the worklet test's offline
  context before the worklet saw its start message. CI now gives Firefox a PulseAudio null
  sink, and the worklet test waits for the song to start before rendering on. WebKit's live
  audio contexts in CI stay "interrupted" or "suspended", cause unknown, so its three
  song-clock tests skip there with a logged reason; Chromium and Firefox run them.

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
