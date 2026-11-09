# Pattern Break

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<img src="docs/img/gameplay-clip.gif" width="768" alt="Four seconds of play in an LED cavern. Columns of square LED segments, lit green at the screen edges through yellow and orange to red at their tips, hang from the top and rise from the bottom and scroll from right to left, one column per row of the song. Small magenta and amber turrets ride in on the tips of the floor and ceiling, and small magenta enemy ships fly in from the right and fire round magenta bullets. A small cyan ship on the left keeps firing cyan shots and moves up and down to dodge. Three ship icons in the top left corner show the lives left, followed by "x3" in amber, and the score in the top right corner counts up as each kill shows its points where the enemy was.">

A side-scrolling neon tunnel shooter where every level is built from a song. The songs are
tracker modules, often called mods: music files made in a tracker, a program that arranges
short sound samples into patterns of notes and beats. The formats are MOD, XM, S3M, and IT.

The terrain is a cavern of LED meter bars, one bar per row of the song: the cave squeezes on
every hit and winds up and down with the melody, so the tunnel moves with the music. The
notes in its patterns will spawn the enemies. The same file always makes the same level, so
every song gets its own leaderboard.

## Status

An early playable slice: title music with an attract demo, an arcade run of levels and a
practice mode, the LED tunnel scrolling in time with the music, a ship you fly through it,
game over and retry, and a jukebox for listening to the songs. Turrets come from the drums,
tanks from the bass, and ships from the other instruments, and each fires on its own
notes; you have three lives and a gun, and kills score double on their instrument's beat.
Power-ups and the gamepad come next, in M2.
Level data comes out byte-for-byte the same in Node, Chromium, Firefox, and WebKit, which is
what lets one song have one leaderboard.

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
own licenses, listed in `music/manifest.json` and shown in the game. The nine songs so far
are Public Domain, by [JAM](https://modarchive.org/member.php?81691) and
[Drozerix](https://modarchive.org/member.php?84702):

- [The_Epic_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=172424) by Drozerix (title music)
- [Numen in Da Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=169046) by JAM
- [FastLane](https://modarchive.org/index.php?request=view_by_moduleid&query=208417) by JAM
- [CHiP_OVERTURE](https://modarchive.org/index.php?request=view_by_moduleid&query=172185) by Drozerix
- [The_Dim_Dungeon](https://modarchive.org/index.php?request=view_by_moduleid&query=172732) by Drozerix
- [4_RNDD!](https://modarchive.org/index.php?request=view_by_moduleid&query=172898) by Drozerix
- [Girl From Mars](https://modarchive.org/index.php?request=view_by_moduleid&query=173935) by Drozerix
- [Wrath_of_the_Djinn](https://modarchive.org/index.php?request=view_by_moduleid&query=173080) by Drozerix
- [Keygen 9000](https://modarchive.org/index.php?request=view_by_moduleid&query=173938) by Drozerix

Every song considered, and why the others weren't used, is in the
[song digest](docs/SONG-DIGEST.md).
