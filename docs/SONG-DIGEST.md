# Song digest

Every song considered for Pattern Break, checked and measured, so the game can grow without
redoing the search. A song here is a module: a song file made in a music tracker, a program
that arranges short sound samples into patterns of notes and beats. The bundled ones are
listed in `music/manifest.json`; how to add one is in `DEVELOPMENT.md`, "Bundled songs".

## How a song gets on this list

- **License:** Public Domain, CC0, or CC BY, read on the song's Mod Archive page. CC BY-SA
  needs Brad's review. NC (non-commercial) and ND (no derivatives) are out.
- **No covers:** the page's comments and the file's own text (its message, instrument and
  sample names) are read for signs of a cover. A sample credited to a commercial sample CD
  rules a song out too, since the song's license doesn't cover the samples.
- **File:** the downloaded file's MD5 matches the one on its page.
- **Playable:** the path check passes and the autopilot reaches the end on easy, normal,
  and hard (the same test `pnpm test` runs on bundled songs).
- **Suitable:** no swearing, censored or not, and no adult themes in the title.

## Columns

- **Rows/s:** rows of the song per second at normal speed. Each row is one LED bar, 10 px
  apart, so this sets how fast the cave scrolls: 10 rows/s is 100 px/s.
- **Notes/s:** note-ons per second, every channel together. Enemies will come from notes,
  so a low number means a quiet level.
- **Gap:** the cave's opening on normal in pixels: the narrowest tenth of bars, then the
  median. The screen is 216 px high.
- **Rating:** the member rating on The Mod Archive, out of 10.

Measured 2026-11-09 with `GEN_VERSION` 2. A levelgen change can move the gap numbers; the
rest come from the song. `GEN_VERSION` 6 (2026-11-10) opens most gaps 14 px wider, one
segment a side; a side already at its 2-segment minimum keeps it.

## Bundled

In the order of the arcade run. The_Epic_Chip is the title and demo music and isn't a level.

| Level | Song | Artist | Length | Rows/s | Notes/s | Gap | Rating |
|---|---|---|---|---|---|---|---|
| Title | [The_Epic_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=172424) | Drozerix | 3:48 | 10.7 | 34.9 | 48 / 69 | 8 |
| 1 | [Numen in Da Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=169046) | JAM | 1:48 | 8.3 | 18.9 | 48 / 76 | none |
| 2 | [FastLane](https://modarchive.org/index.php?request=view_by_moduleid&query=208417) | JAM | 1:49 | 10.0 | 15.5 | 69 / 83 | none |
| 3 | [CHiP_OVERTURE](https://modarchive.org/index.php?request=view_by_moduleid&query=172185) | Drozerix | 2:15 | 10.7 | 32.0 | 48 / 69 | 8 |
| 4 | [The_Dim_Dungeon](https://modarchive.org/index.php?request=view_by_moduleid&query=172732) | Drozerix | 1:41 | 12.0 | 17.0 | 62 / 90 | 9 |
| 5 | [4_RNDD!](https://modarchive.org/index.php?request=view_by_moduleid&query=172898) | Drozerix | 2:02 | 14.2 | 27.5 | 55 / 83 | 8 |
| 6 | [Girl From Mars](https://modarchive.org/index.php?request=view_by_moduleid&query=173935) | Drozerix | 1:52 | 15.5 | 26.9 | 48 / 83 | 9 |
| 7 | [Wrath_of_the_Djinn](https://modarchive.org/index.php?request=view_by_moduleid&query=173080) | Drozerix | 1:52 | 16.0 | 20.0 | 69 / 90 | 9 |
| 8 | [Keygen 9000](https://modarchive.org/index.php?request=view_by_moduleid&query=173938) | Drozerix | 3:20 | 16.0 | 34.7 | 62 / 90 | 9 |
| Impossible | [Crush](https://modarchive.org/index.php?request=view_by_moduleid&query=179581) | Drozerix | 2:05 | 24.0 | 54.0 | 48 / 83 | 10 |

Crush is the secret Impossible difficulty's one level (Brad, 2026-11-10): the fastest song
measured, 1.5 times level 8's speed, played at its own tempo with hard's cave. Checked again
on 2026-11-10 before bundling: Public Domain on its page, the MD5 matches
(1613a27c819396c6d4e74b426c21a36a), the comments praise it with no mention of a cover, and
its only text is the artist's name banner and contact address.

The run is about 16.5 minutes on normal. Levels are ordered by scroll speed, Keygen 9000
last as Brad chose. The_Dim_Dungeon is level 4, before the mini boss. Wrath_of_the_Djinn's
sample names read "A Grand Keygen Chipp ... Gott That Boss? :)", which leads into level 8.

## Shortlisted, not used

Brad heard these on 2026-11-09. All are Public Domain and pass every check.

| Song | Artist | Length | Rows/s | Notes/s | Gap | Rating | Notes |
|---|---|---|---|---|---|---|---|
| [City Patrol](https://modarchive.org/index.php?request=view_by_moduleid&query=206532) | JAM | 1:48 | 8.3 | 17.1 | 55 / 76 | none | |
| [8-bit Castle](https://modarchive.org/index.php?request=view_by_moduleid&query=195782) | JAM | 2:11 | 8.3 | 16.1 | 48 / 83 | none | |
| [Klopoty z Czasem](https://modarchive.org/index.php?request=view_by_moduleid&query=176492) | JAM | 2:12 | 12.3 | 10.3 | 76 / 90 | 9 | Hip-hop, few notes |
| [Augmented_Emotions](https://modarchive.org/index.php?request=view_by_moduleid&query=172184) | Drozerix | 3:45 | 12.8 | 38.4 | 48 / 69 | 9 | Tight cave, long |
| [The_Dim_Dungeon_2](https://modarchive.org/index.php?request=view_by_moduleid&query=172897) | Drozerix | 2:16 | 14.4 | 22.1 | 55 / 90 | 8 | Sequel to level 4 |
| [Chica-pop!](https://modarchive.org/index.php?request=view_by_moduleid&query=189433) | Drozerix | 3:03 | 16.8 | 27.8 | 62 / 90 | 10 | Faster than level 8 |
| [Cabin Fever!](https://modarchive.org/index.php?request=view_by_moduleid&query=174833) | Drozerix | 2:00 | 17.6 | 31.8 | 76 / 90 | 10 | Faster than level 8 |

CHiP_OVERTURE and Augmented_Emotions credit "M0n50n", and 4_RNDD! "Drozerix/M0N50N"; all
three are on Drozerix's Mod Archive account, so it reads as an earlier name of theirs.

## Checked, not heard

Public Domain, MD5 matched, and playable on every difficulty, but not shortlisted. Most of
the fast ones scroll well past the final level.

| Song | Artist | Length | Rows/s | Notes/s | Gap | Rating |
|---|---|---|---|---|---|---|
| [Haunted Occult Mans](https://modarchive.org/index.php?request=view_by_moduleid&query=177399) | JAM | 4:25 | 5.6 | 7.0 | 48 / 76 | 9 |
| [RNDD_Keygen#1.0](https://modarchive.org/index.php?request=view_by_moduleid&query=172896) | Drozerix | 1:10 | 8.3 | 17.8 | 55 / 83 | 9 |
| [XLR8](https://modarchive.org/index.php?request=view_by_moduleid&query=205968) | JAM | 2:53 | 8.3 | 12.4 | 48 / 83 | none |
| [Silicon Dancer](https://modarchive.org/index.php?request=view_by_moduleid&query=209692) | Drozerix | 3:45 | 8.3 | 11.8 | 62 / 83 | 8 |
| [Highway Encounter](https://modarchive.org/index.php?request=view_by_moduleid&query=211660) | JAM | 3:04 | 8.3 | 12.2 | 48 / 76 | none |
| [Chasing the UFO](https://modarchive.org/index.php?request=view_by_moduleid&query=176493) | JAM | 1:12 | 8.9 | 19.7 | 48 / 83 | none |
| [NeuroTransfer](https://modarchive.org/index.php?request=view_by_moduleid&query=169083) | JAM | 3:33 | 11.8 | 31.0 | 48 / 69 | none |
| [May is 4 Her](https://modarchive.org/index.php?request=view_by_moduleid&query=197296) | Drozerix | 2:05 | 12.5 | 14.3 | 76 / 90 | 9 |
| [Bakin' Blueberry Pie](https://modarchive.org/index.php?request=view_by_moduleid&query=200041) | Drozerix | 1:12 | 15.1 | 26.2 | 62 / 90 | 8 |
| [Bubble Machine](https://modarchive.org/index.php?request=view_by_moduleid&query=176020) | Drozerix | 1:49 | 16.0 | 66.5 | 48 / 76 | 9 |
| [Bouncy Beach Babes](https://modarchive.org/index.php?request=view_by_moduleid&query=215254) | Drozerix | 2:54 | 16.5 | 47.8 | 55 / 83 | 8 |
| [Key Generators](https://modarchive.org/index.php?request=view_by_moduleid&query=173939) | Drozerix | 2:18 | 16.7 | 22.4 | 76 / 90 | 8 |
| [Mecanum Overdrive](https://modarchive.org/index.php?request=view_by_moduleid&query=175349) | Drozerix | 3:18 | 17.3 | 27.6 | 69 / 90 | 10 |
| [Cyber Spider](https://modarchive.org/index.php?request=view_by_moduleid&query=192354) | Drozerix | 1:03 | 18.6 | 26.3 | 55 / 90 | 8 |
| [Poppy Flower Girls](https://modarchive.org/index.php?request=view_by_moduleid&query=175325) | Drozerix | 2:34 | 18.7 | 49.8 | 48 / 83 | 9 |
| [Fluxchip](https://modarchive.org/index.php?request=view_by_moduleid&query=200310) | Drozerix | 1:09 | 18.7 | 17.4 | 62 / 90 | 8 |
| [Lost Without (Her)](https://modarchive.org/index.php?request=view_by_moduleid&query=177708) | Drozerix | 2:14 | 23.2 | 34.5 | 48 / 90 | 9 |
| [Dream Candy](https://modarchive.org/index.php?request=view_by_moduleid&query=178565) | Drozerix | 3:52 | 23.5 | 76.8 | 48 / 83 | 8 |
| [Leisurely Voice](https://modarchive.org/index.php?request=view_by_moduleid&query=183837) | Drozerix | 4:09 | 23.6 | 29.2 | 48 / 90 | 9 |

## Ruled out

| Song | Artist | Why |
|---|---|---|
| [Night Cruiser](https://modarchive.org/index.php?request=view_by_moduleid&query=208304) | JAM | Public Domain, but its sample names credit a commercial sample CD: "(c) 1998 MAZ, Sample-CD 'no.1 instruments'". |
| [Cornered!!](https://modarchive.org/index.php?request=view_by_moduleid&query=172568) | Drozerix | A page comment identifies it as a cover of an Ace Attorney song. |
| [Digital Rendezvous](https://modarchive.org/index.php?request=view_by_moduleid&query=180821) | Drozerix | A page comment asks whether it's a cover. Rated 10; worth a closer look if it can be cleared. |
| [Pokemon: Gym](https://modarchive.org/index.php?request=view_by_moduleid&query=174461) | Drozerix | A cover by its title, and Mod Archive Distribution license. |
| Ievan Polkka, IevanPolkkaRMX, PacManOnWax | JAM | Covers by their titles; licenses not checked. |
| Wires on Fire, Maxavision, intersection | JAM | CC BY-NC (Attribution Non-commercial). |
| Conquest!, Of Swords & Glory, Voyage, 14-The High Ground, Slayers of High Toro, Perfect Pale, This is how we do it, Drozerix VS LHS, Drozerix VS LHS #2 | Drozerix | Mod Archive Distribution license, not an open license. |
| Titles with swearing or adult themes | Drozerix | Not suitable for all ages; not measured. |

## Where to look next

- **Drozerix** ([modules](https://modarchive.org/index.php?request=view_artist_modules&query=84702)):
  80 modules, 70 Public Domain. Every Public Domain song rated 8 or higher has been
  measured above; the unrated ones haven't.
- **JAM** ([modules](https://modarchive.org/index.php?request=view_artist_modules&query=81691)):
  93 modules, mostly unrated. Only the ones with game-like titles were checked; the newest
  (2025 and later) are mostly CC BY-NC.
- **By license:** The Mod Archive lists modules by license
  ([Public Domain](https://modarchive.org/index.php?request=view_by_license&query=publicdomain)),
  which is the way to find other artists.
