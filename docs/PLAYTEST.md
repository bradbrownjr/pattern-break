# Play-tests

Tests that need a person, real hardware, or both: things the automated checks can't see.
Brad runs them as time allows, often with a second player, Brad's son. Nothing here blocks the roadmap. What a
test turns up becomes a roadmap item, and the test leaves this list once it's reported.

## How to report

- Turn on **Settings, Perf** for every test here; it costs nothing you'd notice.
- At the end of each run, take a screenshot of the game over or clear screen. Its last three
  lines name the level, song and difficulty and give the frame figures, so a screenshot
  needs no notes to go with it.
- Add a line or two only for what the screen can't show: how it felt, what went wrong, who
  was playing.
- Send the screenshots and notes in any order, whenever they're ready.

## The tests

### 1. Phone performance

**Why:** the game has to hold the Galaxy S25's 120 Hz, a frame every 8.3 ms. The automated
check only approximates a phone, with a throttled desktop browser.

On the Galaxy S25, in Chrome, play these through on Hard (a game over is fine too):

1. Level 1, Neon Techno.
2. The_Epic_Chip, from Levels: the slowest level in the automated check.
3. Girl From Mars, from Levels: the slowest on the development server.
4. Any one of them again with **Settings, CRT** off, for comparison.

**Looking for:** frames a second near 120 (or 60, if the phone's in a 60 Hz mode), and
whether it ever stutters or drops frames you can see.

### 2. How each difficulty feels

**Why:** levels are built from songs, so nobody tunes one by hand. The automated
guardrails show every level can be finished and each step up is busier; only people can say
whether the steps feel right.

Each of you plays two or three songs on Easy, Normal and Hard: the arcade run's first
levels, or any songs from Levels.

**Looking for:**

- Since 2026-11-13 (lighter bullet costs, fewer turret shells, a new level order): can you
  clear the arcade run's first levels on Normal, losing a life or two along the way? The
  aim is a win you have to work for, not a clean sweep. If Normal is now too easy or still
  too hard, say which levels.
- Is Easy too easy, or still too much for a new player? Your son's take matters most here.
- Is Hard a fair challenge, or too busy? It sends about 2.5 to 3 ships a second on most songs.
- Any death that felt unfair, with nothing you could have done: note the song,
  difficulty and roughly when.

### 3. Sync with headphones

**Why:** Bluetooth headphones can lag the sound by 150 ms or more, and the Sync screen is
meant to correct it. It has only been tested in the development browsers.

On the phone, run **Settings, Sync** twice: once on the phone's speaker, once on Bluetooth
headphones. Keep each result, then play a level with each.

**Looking for:** the two offsets (a screenshot of each result), and whether the walls and
shots feel in time with the music after.

### 4. Name entry on the phone and with a gamepad

**Why:** the end screens' name entry by touch was tested in headless browsers and by
gamepad in Node alone, not on real devices.

Finish or lose a run and enter a name on the game over or clear screen: once on the phone
(tap the Name key, a letter and a cursor, for its keyboard), once with a gamepad on the PC. Then let the other
player take a turn and post under their own name.

**Looking for:** the keyboard opens in capitals and stays open, the keyboard's Enter and
the gamepad's A post, B skips, up and down change letters, and both names show on Scores in
different places.

### 5. The title demo

**Why:** the autopilot that flies the demo was rewritten on 2026-11-11 to play more like a
person: it lines up shots, and brakes and backs up to dodge.

Leave the title screen alone until the demo starts, and watch it once.

**Looking for:** anything that looks wrong: flying into a wall, odd jitter, shots wasted on
walls, or a crash it should have dodged. Does it look like someone playing?

### 6. Breaking walls

**Why:** missiles and bombs break the walls, and a cut ceiling falls (2026-11-11). Tests
check the rules; only playing shows whether it feels good and reads clearly.

Unlock the missile, then fire it into a wall hanging from the ceiling, below the
ceiling's edge, with enemies under it. Bomb the floor too. Then stand under a falling
block once, and brake out from under the next.

**Looking for:** whether the broken walls, the falling block and the rubble are easy to
read, whether crushing enemies feels worth setting up, the crumble sound, and whether
braking out from under a block feels fair.

### 7. The phone, upright and sideways

**Why:** the touch controls gained an upright layout, menu keys with icons and full screen
on 2026-11-12. Headless Chromium as a phone checked the layout; a real phone checks the
rest.

On the phone, open the game in the browser and tap the start screen. Go through the menus,
the jukebox and a run held upright, then the same held sideways. Lose a run and try
Replay, Save, Retry and Title. Swipe out of full screen once and tap again. On the PC,
click the start screen, then press Esc in a run.

**Looking for:** the page goes full screen on the first tap and back in after a swipe out;
upright, the picture fills the width in the top half, with the pad under it, and its
pixels look even enough; each menu key's icon says what it does without a word; quick taps
never get missed; nothing names a keyboard key while the touch keys are on show. On the PC,
the click goes full screen; in Chrome or Edge Esc pauses and holding it leaves full screen,
in Firefox Esc leaves it.

### 8. Stick speed

**Why:** the touch stick and a gamepad's stick were full speed past a small dead zone,
which made the ship hard to steer on the phone. Since 2026-11-12 the ship goes as fast as
the stick is pushed, and the touch stick is larger (112 px across, 8 px dead zone).

Play a level on the phone, then one with a gamepad's stick. Try lining up with an enemy a
few pixels away, and dodging at full speed.

**Looking for:** whether small corrections are easy, whether a full push still feels fast
enough to dodge, any visible stutter at slow speeds, and whether the stick's ring feels the
right size. Say if it wants a curve (slower near the centre) or a different dead zone.
