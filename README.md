# Pattern Break

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="docs/img/gameplay-clip.gif" width="768" alt="Four seconds of play in an LED cavern. Columns of square LED segments, lit green at the screen edges through yellow and orange to red at their tips, hang from the top and rise from the bottom and scroll from right to left, one column per row of the song. Behind them, soft horizontal bands of teal, olive, amber and violet sway up and down and glow brighter with the bass. A small cyan ship on the left, inside a faint cyan ring that is its shield, joined partway by a small glowing drone orb, fires rows of cyan shots, angled shots and missiles at magenta enemy ships flying in from the right and dodges up and down. Turrets ride in on the column tips and fire amber pellets, and each kill bursts into coloured specks with its points in white digits. Amber-framed capsules showing a laser icon scroll past. In the HUD, a row of small power-up icons on a dark panel in the top left corner, bright for what the ship has and faint for the rest, ending in three faint nuke icons; &quot;x3&quot;, then &quot;x4&quot;, in amber and the score counting up from 5000 to 7700 in the top right; three ship icons for the lives in the bottom left; six cyan shield pips in the bottom right.">

A side-scrolling neon tunnel shooter where every level is built from a song. The songs are
tracker modules, often called mods: music files made in a tracker, a program that arranges
short sound samples into patterns of notes and beats. The formats are MOD, XM, S3M, and IT.

The terrain is a cavern of LED meter bars, one bar per row of the song: the cave squeezes on
every hit and winds up and down with the melody, so the tunnel moves with the music. The
notes in its patterns spawn the enemies. The same file always makes the same level, so
every song gets its own leaderboard.

## Status

An early playable slice: title music with an attract demo, an arcade run of levels and a
practice mode, the LED tunnel scrolling in time with the music, a ship you fly through it,
game over and retry, and a jukebox for listening to the songs and importing your own. The
game installs as an app and plays with no connection. Turrets come from the drums,
tanks from the bass, and ships from the other instruments, and each fires on its own
notes; you have three lives, a shield that takes a few hits and bounces you off the walls,
and a gun, and kills score double on their instrument's beat. Every 20 000 points gives a
life.
A bomb takes out tanks on the floor, and a nuke earned by playing the beat clears the
screen. Missiles and bombs break the walls, and a ceiling cut loose falls on whatever is
under it, enemies and ship alike. Shooting down a whole formation drops a capsule that unlocks the next power-up:
boost, double shot, laser, missile, drone or a shield refill. Sound effects are synthesized in the
browser, with the pitched ones on the song's notes. Settings has the music and effects
volume, reduced flashing (on until changed), switches for screen shake and a CRT look,
colour-blind LED colours, full screen, and Sync, which measures the audio delay from presses on a click
so the walls match what the player hears. A short black-and-white intro opens each run: the captain boards the
fighter and puts the first song's cassette in the deck, and pressing Play starts the
level, which floods into colour with the music. A gamepad works next to the keyboard, and both
can be remapped. A phone or tablet plays full screen with on-screen controls, held
sideways or upright, where the picture sits above the pad; its stick, like a gamepad's,
moves the ship as fast as it is pushed. Every
run can be watched again or saved as a replay file. Level data and replays come out
byte-for-byte the same in Node, Chromium, Firefox, and WebKit, which is what lets one song
have one leaderboard: each song and difficulty has a global board, and the arcade run has
one for its total. The server checks every run by playing it again before it goes on a
board.

- [Roadmap](docs/ROADMAP.md): what comes next
- [Changelog](docs/CHANGELOG.md): what is finished
- [Plan](docs/PLAN.md): the design and the tech choices

## Development

You need Node 26 and pnpm 12. Node runs the TypeScript packages directly, so only the
browser client has a build step.

```sh
pnpm install
pnpm dev          # play it: open the printed address
pnpm check        # lint, type-check, tests, and the docs and music checks
```

Setup, the project layout, and the checks are in the
[development guide](docs/DEVELOPMENT.md). Before writing docs, comments, or anything a
player reads, read the [writing guide](docs/DOC-STYLE.md).

## License

Pattern Break is free and open source. The code is [MIT](LICENSE). Bundled music keeps its
own licenses, listed in `music/manifest.json` and shown in the game. The sixteen songs so far
are Public Domain, all by [Drozerix](https://modarchive.org/member.php?84702):

- [The_Epic_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=172424) by Drozerix (title music)
- [Neon Techno](https://modarchive.org/index.php?request=view_by_moduleid&query=178172) by Drozerix
- [RNDD_Keygen#1.0](https://modarchive.org/index.php?request=view_by_moduleid&query=172896) by Drozerix
- [CHiP_OVERTURE](https://modarchive.org/index.php?request=view_by_moduleid&query=172185) by Drozerix
- [The_Dim_Dungeon](https://modarchive.org/index.php?request=view_by_moduleid&query=172732) by Drozerix
- [4_RNDD!](https://modarchive.org/index.php?request=view_by_moduleid&query=172898) by Drozerix
- [Girl From Mars](https://modarchive.org/index.php?request=view_by_moduleid&query=173935) by Drozerix
- [Wrath_of_the_Djinn](https://modarchive.org/index.php?request=view_by_moduleid&query=173080) by Drozerix
- [Keygen 9000](https://modarchive.org/index.php?request=view_by_moduleid&query=173938) by Drozerix
- [Crush](https://modarchive.org/index.php?request=view_by_moduleid&query=179581) by Drozerix
- [Augmented_Emotions](https://modarchive.org/index.php?request=view_by_moduleid&query=172184) by Drozerix
- [The_Dim_Dungeon_2](https://modarchive.org/index.php?request=view_by_moduleid&query=172897) by Drozerix
- [Cabin Fever!](https://modarchive.org/index.php?request=view_by_moduleid&query=174833) by Drozerix
- [Chica-pop!](https://modarchive.org/index.php?request=view_by_moduleid&query=189433) by Drozerix
- [Peachy Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=191437) by Drozerix
- [Sleepy Snow](https://modarchive.org/index.php?request=view_by_moduleid&query=196372) by Drozerix (end credits)

Every song considered, and why the others weren't used, is in the
[song digest](docs/SONG-DIGEST.md).
