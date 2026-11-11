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

**Why:** the name entry by touch was tested in headless browsers and by gamepad in Node
alone, not on real devices.

Open **Scores**, choose the **Name** row, and set a name: once on the phone with its
keyboard, once with a gamepad on the PC.

**Looking for:** the keyboard opens and stays open, the name saves, and the gamepad's up,
down, Y and A do what the hint says.

### 5. The title demo

**Why:** the autopilot that flies the demo changed on 2026-11-11.

Leave the title screen alone until the demo starts, and watch it once.

**Looking for:** anything that looks wrong: flying into a wall, odd jitter, or a crash it
should have dodged.
