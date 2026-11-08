# Pattern Break

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A side-scrolling neon tunnel shooter where every level is built from a tracker module
(MOD, XM, S3M, or IT). The ceiling and floor are the song's left and right spectrum, drawn as
LED meter bars, and the notes in its patterns spawn the enemies. The same file always makes
the same level, so every song gets its own leaderboard.

## Status

Nothing is playable yet. The game can read a module and turn it into level data: the
stereo spectrum as LED levels, per-channel volume, row timing, and every note. That data
comes out byte-for-byte the same in Node and in the browser, which is what lets one song
have one leaderboard. The next step is M1, a playable slice on one song.

- [Roadmap](docs/ROADMAP.md): what comes next
- [Changelog](docs/CHANGELOG.md): what is finished
- [Plan](docs/PLAN.md): the design and the tech choices

## Development

You need Node 26 and pnpm 12. Node runs the TypeScript packages directly, so only the
browser client has a build step.

```sh
pnpm install
pnpm dev          # client dev server
pnpm check        # lint, type-check, tests, and the docs check
```

Setup, the project layout, and the checks are in the
[development guide](docs/DEVELOPMENT.md). Before writing docs, comments, or anything a
player reads, read the [writing guide](docs/DOC-STYLE.md).

## License

Pattern Break is free and open source. The code is [MIT](LICENSE). Bundled music will keep its own licenses, listed in
`music/manifest.json` and on the in-game credits screen.
