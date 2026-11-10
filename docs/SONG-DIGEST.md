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
- **Drozerix only** (Brad, 2026-11-10): the bundled music keeps one artist's style,
  techno and retro-futuristic chiptune. JAM's songs sound out of place beside it, and so
  does a funkier Drozerix song (Silicon Dancer, below).

## Columns

- **Rows/s:** rows of the song per second at normal speed. Each row is one LED bar, 10 px
  apart, so this sets how fast the cave scrolls: 10 rows/s is 100 px/s.
- **Notes/s:** note-ons per second, every channel together. Enemies will come from notes,
  so a low number means a quiet level.
- **Gap:** the cave's opening on normal in pixels: the narrowest tenth of bars, then the
  median. The screen is 216 px high.
- **Rating:** the member rating on The Mod Archive, out of 10.
- **Added:** when the song was uploaded to The Mod Archive.

Drozerix's songs were measured on 2026-11-10 with `GEN_VERSION` 8, JAM's on 2026-11-09
with `GEN_VERSION` 2. A levelgen change can move the gap numbers; the rest come from the
song. `GEN_VERSION` 6 opened most gaps 14 px wider, one segment a side, so JAM's gaps read
narrower than they would today.

## Bundled

In the order of the arcade run. The_Epic_Chip is the title and demo music and isn't a level.

| Level | Song | Artist | Length | Rows/s | Notes/s | Gap | Rating |
|---|---|---|---|---|---|---|---|
| Title | [The_Epic_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=172424) | Drozerix | 3:48 | 10.7 | 34.9 | 62 / 83 | 8 |
| 1 | [RNDD_Keygen#1.0](https://modarchive.org/index.php?request=view_by_moduleid&query=172896) | Drozerix | 1:10 | 8.3 | 17.8 | 69 / 97 | 9 |
| 2 | [CHiP_OVERTURE](https://modarchive.org/index.php?request=view_by_moduleid&query=172185) | Drozerix | 2:15 | 10.7 | 32.0 | 62 / 83 | 8 |
| 3 | [The_Dim_Dungeon](https://modarchive.org/index.php?request=view_by_moduleid&query=172732) | Drozerix | 1:41 | 12.0 | 17.0 | 76 / 104 | 9 |
| 4 | [4_RNDD!](https://modarchive.org/index.php?request=view_by_moduleid&query=172898) | Drozerix | 2:02 | 14.2 | 27.5 | 69 / 97 | 8 |
| 5 | [Girl From Mars](https://modarchive.org/index.php?request=view_by_moduleid&query=173935) | Drozerix | 1:52 | 15.5 | 26.9 | 62 / 97 | 9 |
| 6 | [Wrath_of_the_Djinn](https://modarchive.org/index.php?request=view_by_moduleid&query=173080) | Drozerix | 1:52 | 16.0 | 20.0 | 83 / 104 | 9 |
| 7 | [Keygen 9000](https://modarchive.org/index.php?request=view_by_moduleid&query=173938) | Drozerix | 3:20 | 16.0 | 34.7 | 76 / 104 | 9 |
| Impossible | [Crush](https://modarchive.org/index.php?request=view_by_moduleid&query=179581) | Drozerix | 2:05 | 24.0 | 54.0 | 62 / 97 | 10 |

Crush is the secret Impossible difficulty's one level (Brad, 2026-11-10): the fastest song
measured, 1.5 times the last level's speed, played at its own tempo with hard's cave. Checked again
on 2026-11-10 before bundling: Public Domain on its page, the MD5 matches
(1613a27c819396c6d4e74b426c21a36a), the comments praise it with no mention of a cover, and
its only text is the artist's name banner and contact address.

The run is seven levels, about 14 minutes on normal, until a new level 1 is picked
(Brad, 2026-11-10; see "Dropped"). Levels are ordered by scroll speed, Keygen 9000 last as
Brad chose. RNDD_Keygen#1.0 was checked again on 2026-11-10 before bundling: Public Domain
on its page, the MD5 matches (d5c5e8661d259428a115537c536a59dc), the page has no comments,
and its only text is the artist's banner, "Composed&Sampled By: Drozerix/M0n50n" and a
contact address. With a new level 1, The_Dim_Dungeon is level 4 again, before the mini
boss. Wrath_of_the_Djinn's sample names read "A Grand Keygen Chipp ... Gott That Boss? :)",
which leads into the last level.

## Level 1 picks

Brad passed on Silicon Dancer, so level 1 needs another Drozerix song in the bundled
songs' style. These three are the closest by speed; RNDD_Keygen#1.0 (8.3 rows/s) moves to
whichever level its speed puts it. Their text holds nothing that suggests a cover, and
their pages have no comments. Not yet heard.

| Song | Added | Length | Rows/s | Notes/s | Gap | Why |
|---|---|---|---|---|---|---|
| [Neon Techno](https://modarchive.org/index.php?request=view_by_moduleid&query=178172) | Mar 2016 | 3:32 | 8.3 | 19.7 | 76 / 90 | Genre tag Electronic - Techno; text is only the title banner |
| [Peachy Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=191437) | Apr 2021 | 2:12 | 9.9 | 33.9 | 62 / 83 | A chiptune by its title; its text dates it 2020-12-31 |
| [Viral Legacy](https://modarchive.org/index.php?request=view_by_moduleid&query=173936) | Jun 2013 | 2:27 | 10.6 | 34.2 | 62 / 76 | Its text dates it 2012, like most of the bundled songs; "[System:On-line]" |

The slower Sleepy Snow (4.1 rows/s) is calm and sparse, and Spectrum (8.5) is written with
another artist; both are in the catalog below.

## Drozerix catalog

Every module on [Drozerix's Mod Archive page](https://modarchive.org/index.php?request=view_artist_modules&query=84702),
80 in all, as of 2026-11-10. Each Public Domain song with a suitable title was downloaded,
its MD5 checked against its page, its text and comments read, and its level built and
flown by the autopilot (with enemies) on easy, normal and hard; a note says where the
autopilot died. Statuses:

- **Bundled:** in the game now. **Pack:** chosen for the M4 music pack (Brad,
  2026-11-10). **Level 1 pick:** above.
- **Measured:** passes the checks; not yet heard by Brad.
- **Dropped:** heard and turned down. **Ruled out:** a possible cover. **Not suitable:**
  the title fails the all-ages rule (the archive masks these titles). **Not open:** Mod
  Archive Distribution license.

| Song | Added | Format | Length | Rows/s | Notes/s | Gap | Rating | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| [L3V3L_33](https://modarchive.org/index.php?request=view_by_moduleid&query=172183) | Mar 2012 | XM | 1:05 | 15.3 | 38.5 | 83 / 97 | 7 | Measured |  |
| [Augmented_Emotions](https://modarchive.org/index.php?request=view_by_moduleid&query=172184) | Mar 2012 | XM | 3:45 | 12.8 | 38.4 | 62 / 83 | 9 | Pack | M4 music pack; tight cave |
| [CHiP_OVERTURE](https://modarchive.org/index.php?request=view_by_moduleid&query=172185) | Mar 2012 | XM | 2:15 | 10.7 | 32.0 | 62 / 83 | 8 | Bundled | Level 2 |
| [Dissorint](https://modarchive.org/index.php?request=view_by_moduleid&query=172423) | May 2012 | XM | 1:53 | 12.8 | 43.4 | 62 / 83 | none | Measured |  |
| [The_Epic_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=172424) | May 2012 | XM | 3:48 | 10.7 | 34.9 | 62 / 83 | 8 | Bundled | Title and demo music |
| [Cornered!!](https://modarchive.org/index.php?request=view_by_moduleid&query=172568) | Jun 2012 | XM |  |  |  |  | 8 | Ruled out | A cover of an Ace Attorney song (text: "Original Artist: Sugimori Masakazu") |
| [The_Dim_Dungeon](https://modarchive.org/index.php?request=view_by_moduleid&query=172732) | Aug 2012 | XM | 1:41 | 12.0 | 17.0 | 76 / 104 | 9 | Bundled | Level 3 |
| [Necromancer's_Castle](https://modarchive.org/index.php?request=view_by_moduleid&query=172786) | Aug 2012 | XM | 1:24 | 16.0 | 22.0 | 83 / 104 | 7 | Measured |  |
| [RNDD_Keygen#1.0](https://modarchive.org/index.php?request=view_by_moduleid&query=172896) | Sep 2012 | XM | 1:10 | 8.3 | 17.8 | 69 / 97 | 9 | Bundled | Level 1 |
| [The_Dim_Dungeon_2](https://modarchive.org/index.php?request=view_by_moduleid&query=172897) | Sep 2012 | XM | 2:16 | 14.4 | 22.1 | 69 / 104 | 8 | Pack | M4 music pack; a sequel to The_Dim_Dungeon; autopilot died on hard |
| [4_RNDD!](https://modarchive.org/index.php?request=view_by_moduleid&query=172898) | Sep 2012 | XM | 2:02 | 14.2 | 27.5 | 69 / 97 | 8 | Bundled | Level 4 |
| [Wrath_of_the_Djinn](https://modarchive.org/index.php?request=view_by_moduleid&query=173080) | Nov 2012 | XM | 1:52 | 16.0 | 20.0 | 83 / 104 | 9 | Bundled | Level 6 |
| [Nerve_intro](https://modarchive.org/index.php?request=view_by_moduleid&query=173081) | Nov 2012 | XM | 1:30 | 21.3 | 23.1 | 90 / 104 | none | Measured |  |
| [Nerve_2.00](https://modarchive.org/index.php?request=view_by_moduleid&query=173082) | Nov 2012 | XM | 1:31 | 12.8 | 21.4 | 76 / 104 | none | Measured |  |
| [****** Bit 3!!!](https://modarchive.org/index.php?request=view_by_moduleid&query=173083) | Nov 2012 | XM |  |  |  |  | 9 | Not suitable | Title |
| [October_Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=173084) | Nov 2012 | XM | 2:02 | 12.6 | 19.4 | 69 / 97 | none | Measured | "Inspired by Scott", written for RNDD; autopilot died on hard |
| [Porn_Industry](https://modarchive.org/index.php?request=view_by_moduleid&query=173085) | Nov 2012 | XM |  |  |  |  | 9 | Not suitable | Title |
| [Knuckles_Sucks!](https://modarchive.org/index.php?request=view_by_moduleid&query=173086) | Nov 2012 | XM | 1:25 | 15.0 | 19.5 | 76 / 104 | none | Measured | Title names a game character |
| [The Radix Point](https://modarchive.org/index.php?request=view_by_moduleid&query=173934) | Jun 2013 | XM | 1:44 | 16.7 | 21.3 | 90 / 104 | none | Measured |  |
| [Girl From Mars](https://modarchive.org/index.php?request=view_by_moduleid&query=173935) | Jun 2013 | XM | 1:52 | 15.5 | 26.9 | 62 / 97 | 9 | Bundled | Level 5 |
| [Viral Legacy](https://modarchive.org/index.php?request=view_by_moduleid&query=173936) | Jun 2013 | XM | 2:27 | 10.6 | 34.2 | 62 / 76 | none | Level 1 pick | Its text dates it 2012, like most of the bundled songs; "[System:On-line]" |
| [Computer_Adventures!](https://modarchive.org/index.php?request=view_by_moduleid&query=173937) | Jun 2013 | XM | 2:49 | 15.9 | 34.0 | 83 / 104 | none | Measured |  |
| [Keygen 9000](https://modarchive.org/index.php?request=view_by_moduleid&query=173938) | Jun 2013 | XM | 3:20 | 16.0 | 34.7 | 76 / 104 | 9 | Bundled | Level 7, game over |
| [Key Generators](https://modarchive.org/index.php?request=view_by_moduleid&query=173939) | Jun 2013 | XM | 2:18 | 16.7 | 22.4 | 90 / 104 | 8 | Measured |  |
| [Ambient Starfield](https://modarchive.org/index.php?request=view_by_moduleid&query=174160) | Jul 2013 | XM | 2:27 | 20.0 | 48.2 | 76 / 97 | 7 | Measured |  |
| [Drozerix VS LHS](https://modarchive.org/index.php?request=view_by_moduleid&query=174244) | Aug 2013 | XM |  |  |  |  | 10 | Not open | Mod Archive Distribution license |
| [***** bit 2!!](https://modarchive.org/index.php?request=view_by_moduleid&query=174247) | Aug 2013 | XM |  |  |  |  | 9 | Not suitable | Title |
| [Her Kiss](https://modarchive.org/index.php?request=view_by_moduleid&query=174293) | Sep 2013 | XM | 2:55 | 17.3 | 26.0 | 90 / 104 | none | Measured |  |
| [Bionic Girl](https://modarchive.org/index.php?request=view_by_moduleid&query=174416) | Oct 2013 | XM | 2:29 | 23.6 | 25.8 | 83 / 104 | none | Measured |  |
| [Pokemon: Gym](https://modarchive.org/index.php?request=view_by_moduleid&query=174461) | Nov 2013 | MOD |  |  |  |  | 4 | Not open | Mod Archive Distribution license; a cover by its title |
| [The Digital Dragon](https://modarchive.org/index.php?request=view_by_moduleid&query=174511) | Dec 2013 | XM | 3:06 | 16.0 | 35.9 | 62 / 97 | none | Measured |  |
| [Lost in her eyes](https://modarchive.org/index.php?request=view_by_moduleid&query=174531) | Dec 2013 | XM | 1:52 | 16.8 | 18.9 | 90 / 104 | none | Measured |  |
| [A Winter Kiss](https://modarchive.org/index.php?request=view_by_moduleid&query=174546) | Dec 2013 | XM | 3:11 | 16.9 | 35.1 | 62 / 104 | none | Measured | Samples by Ogge, Seablue and Zabutom, and Drozerix |
| [Cabin Fever!](https://modarchive.org/index.php?request=view_by_moduleid&query=174833) | Mar 2014 | XM | 2:00 | 17.6 | 31.8 | 90 / 104 | 10 | Pack | M4 music pack |
| [Computer ****!](https://modarchive.org/index.php?request=view_by_moduleid&query=175021) | May 2014 | XM |  |  |  |  | 9 | Not suitable | Title |
| [Poppy Flower Girls](https://modarchive.org/index.php?request=view_by_moduleid&query=175325) | Jun 2014 | XM | 2:34 | 18.7 | 49.8 | 62 / 97 | 9 | Measured |  |
| [Mecanum Overdrive](https://modarchive.org/index.php?request=view_by_moduleid&query=175349) | Jun 2014 | XM | 3:18 | 17.3 | 27.6 | 83 / 104 | 10 | Measured |  |
| [Bubble Machine](https://modarchive.org/index.php?request=view_by_moduleid&query=176020) | Sep 2014 | XM | 1:49 | 16.0 | 66.5 | 62 / 90 | 9 | Measured |  |
| [Drozerix VS LHS #2](https://modarchive.org/index.php?request=view_by_moduleid&query=176125) | Nov 2014 | XM |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [Chemical 16](https://modarchive.org/index.php?request=view_by_moduleid&query=177684) | Oct 2015 | XM | 1:35 | 16.3 | 27.3 | 90 / 104 | none | Measured |  |
| [Lost Without (Her)](https://modarchive.org/index.php?request=view_by_moduleid&query=177708) | Oct 2015 | XM | 2:14 | 23.2 | 34.5 | 62 / 104 | 9 | Measured |  |
| [Spectrum](https://modarchive.org/index.php?request=view_by_moduleid&query=177960) | Dec 2015 | XM | 3:35 | 8.5 | 14.7 | 76 / 90 | none | Measured | Written with Peak (patterns split between them), so not Drozerix alone; text says "(c)", page says Public Domain |
| [Reloaded insanity](https://modarchive.org/index.php?request=view_by_moduleid&query=177968) | Dec 2015 | XM | 5:01 | 16.5 | 22.6 | 90 / 104 | 7 | Measured |  |
| [Neon Techno](https://modarchive.org/index.php?request=view_by_moduleid&query=178172) | Mar 2016 | MOD | 3:32 | 8.3 | 19.7 | 76 / 90 | none | Level 1 pick | Genre tag Electronic - Techno; text is only the title banner |
| [Bit Loader](https://modarchive.org/index.php?request=view_by_moduleid&query=178415) | Apr 2016 | XM | 1:25 | 17.6 | 20.7 | 90 / 104 | none | Measured |  |
| [Dream Candy](https://modarchive.org/index.php?request=view_by_moduleid&query=178565) | Jun 2016 | XM | 3:52 | 23.5 | 76.8 | 62 / 104 | 8 | Measured |  |
| [Crush](https://modarchive.org/index.php?request=view_by_moduleid&query=179581) | Jan 2017 | XM | 2:05 | 24.0 | 54.0 | 62 / 97 | 10 | Bundled | Impossible |
| [Digital Rendezvous](https://modarchive.org/index.php?request=view_by_moduleid&query=180821) | Sep 2017 | XM | 2:44 | 18.4 | 47.8 | 62 / 90 | 10 | Ruled out | A comment asks if it is a cover of, or inspired by, Ghidorah; unanswered. Worth a closer look if it can be cleared |
| [Leisurely Voice](https://modarchive.org/index.php?request=view_by_moduleid&query=183837) | Sep 2018 | XM | 4:09 | 23.6 | 29.2 | 62 / 104 | 9 | Measured |  |
| [*****_bit](https://modarchive.org/index.php?request=view_by_moduleid&query=185091) | Mar 2019 | XM |  |  |  |  | none | Not suitable | Title |
| [Playful Girl](https://modarchive.org/index.php?request=view_by_moduleid&query=185337) | May 2019 | XM | 1:58 | 16.0 | 59.7 | 62 / 97 | none | Measured |  |
| [Building Energy](https://modarchive.org/index.php?request=view_by_moduleid&query=185456) | Jun 2019 | XM | 1:29 | 23.6 | 30.7 | 62 / 104 | none | Measured |  |
| [Chica-pop!](https://modarchive.org/index.php?request=view_by_moduleid&query=189433) | Jun 2020 | XM | 3:03 | 16.8 | 27.8 | 76 / 104 | 10 | Pack | M4 music pack |
| [War Path](https://modarchive.org/index.php?request=view_by_moduleid&query=190185) | Aug 2020 | XM | 2:46 | 14.4 | 19.9 | 69 / 104 | none | Measured |  |
| [Master Select](https://modarchive.org/index.php?request=view_by_moduleid&query=190186) | Aug 2020 | XM | 1:34 | 17.1 | 17.5 | 76 / 104 | none | Measured |  |
| [Peachy Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=191437) | Apr 2021 | XM | 2:12 | 9.9 | 33.9 | 62 / 83 | none | Level 1 pick | A chiptune by its title; its text dates it 2020-12-31 |
| [Slayers of High Toro](https://modarchive.org/index.php?request=view_by_moduleid&query=191997) | May 2021 | MOD |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [14-The High Ground](https://modarchive.org/index.php?request=view_by_moduleid&query=191998) | May 2021 | MOD |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [Voyage](https://modarchive.org/index.php?request=view_by_moduleid&query=191999) | May 2021 | MOD |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [Of Swords & Glory](https://modarchive.org/index.php?request=view_by_moduleid&query=192000) | May 2021 | MOD |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [Conquest!](https://modarchive.org/index.php?request=view_by_moduleid&query=192001) | May 2021 | MOD |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [What Did They Do 2U?](https://modarchive.org/index.php?request=view_by_moduleid&query=192270) | Jul 2021 | XM | 1:35 | 18.2 | 26.1 | 76 / 104 | none | Measured |  |
| [This is how we do it](https://modarchive.org/index.php?request=view_by_moduleid&query=192352) | Jul 2021 | XM |  |  |  |  | 10 | Not open | Mod Archive Distribution license |
| [Cyber Spider](https://modarchive.org/index.php?request=view_by_moduleid&query=192354) | Jul 2021 | XM | 1:03 | 18.6 | 26.3 | 69 / 104 | 8 | Measured |  |
| [Forgone Inamorata](https://modarchive.org/index.php?request=view_by_moduleid&query=196371) | Mar 2022 | XM | 1:08 | 17.1 | 17.4 | 76 / 104 | none | Measured |  |
| [Sleepy Snow](https://modarchive.org/index.php?request=view_by_moduleid&query=196372) | Mar 2022 | XM | 1:27 | 4.1 | 5.8 | 62 / 83 | 9 | Measured | Calm and sparse (comments: "pretty and calming"); 6 KB |
| [May is 4 Her](https://modarchive.org/index.php?request=view_by_moduleid&query=197296) | May 2022 | MOD | 2:05 | 12.5 | 14.3 | 90 / 104 | 9 | Measured |  |
| [The Hawk's Claw](https://modarchive.org/index.php?request=view_by_moduleid&query=197917) | Aug 2022 | MOD | 4:03 | 13.9 | 15.9 | 76 / 104 | none | Measured | Samples from Drozerix's Slayers of High Toro soundtrack |
| [Alone](https://modarchive.org/index.php?request=view_by_moduleid&query=199968) | Feb 2023 | XM | 0:58 | 16.7 | 12.8 | 76 / 104 | 6 | Measured | One-hour compo; samples provided by Bravoman |
| [Bakin' Blueberry Pie](https://modarchive.org/index.php?request=view_by_moduleid&query=200041) | Feb 2023 | XM | 1:12 | 15.1 | 26.2 | 76 / 104 | 8 | Measured |  |
| [Fluxchip](https://modarchive.org/index.php?request=view_by_moduleid&query=200310) | Mar 2023 | XM | 1:09 | 18.7 | 17.4 | 76 / 104 | 8 | Measured |  |
| [AI Renaissance](https://modarchive.org/index.php?request=view_by_moduleid&query=200847) | May 2023 | MOD | 3:56 | 15.8 | 28.3 | 83 / 104 | none | Measured |  |
| [Stardust Jam](https://modarchive.org/index.php?request=view_by_moduleid&query=201039) | Jun 2023 | MOD | 5:54 | 8.5 | 13.9 | 69 / 90 | 5 | Measured | 5:54 long; a text-to-speech voice (comment: "the tiktok TTS") |
| [My Dearest](https://modarchive.org/index.php?request=view_by_moduleid&query=205731) | Apr 2024 | XM | 1:24 | 13.7 | 24.5 | 62 / 90 | none | Measured |  |
| [Keygen Wraith](https://modarchive.org/index.php?request=view_by_moduleid&query=207854) | Sep 2024 | XM | 1:33 | 13.7 | 23.7 | 69 / 97 | none | Measured |  |
| [Assembly!](https://modarchive.org/index.php?request=view_by_moduleid&query=209551) | Mar 2025 | XM | 1:49 | 16.7 | 18.8 | 90 / 104 | none | Measured |  |
| [Perfect Pale](https://modarchive.org/index.php?request=view_by_moduleid&query=209624) | Apr 2025 | IT |  |  |  |  | none | Not open | Mod Archive Distribution license |
| [Silicon Dancer](https://modarchive.org/index.php?request=view_by_moduleid&query=209692) | Apr 2025 | MOD | 3:45 | 8.3 | 11.8 | 76 / 97 | 8 | Dropped | Funkier than the rest (Brad, 2026-11-10) |
| [Air Ride](https://modarchive.org/index.php?request=view_by_moduleid&query=213325) | Apr 2026 | MOD | 2:45 | 9.4 | 8.0 | 76 / 104 | none | Measured | Sung lyrics in the sample names, like Silicon Dancer |
| [Bouncy Beach Babes](https://modarchive.org/index.php?request=view_by_moduleid&query=215254) | Sep 2026 | XM | 2:54 | 16.5 | 47.8 | 69 / 97 | 8 | Measured |  |

CHiP_OVERTURE and Augmented_Emotions credit "M0n50n", and 4_RNDD! "Drozerix/M0N50N"; all
three are on Drozerix's Mod Archive account, so it reads as an earlier name of theirs.

## Dropped

JAM's songs, bundled or measured, left on 2026-11-10 when Brad kept the music to Drozerix.
Numen in Da Chip and FastLane were levels 1 and 2. Silicon Dancer was tried as the new
level 1 the same day: Public Domain, and its sample names hold Drozerix's own lyrics ("Voice
is my own. Samples from my mm8 and some old FL sample"), but Brad found it funkier than the
others. As a 4-channel MOD it also showed that Amiga resampler emulation made analysis 15
times slower, which is why it is now off (`GEN_VERSION` 8). Klopoty z Czasem is hip-hop
with few notes.

| Song | Artist | Length | Rows/s | Notes/s | Gap | Rating |
|---|---|---|---|---|---|---|
| [Numen in Da Chip](https://modarchive.org/index.php?request=view_by_moduleid&query=169046) | JAM | 1:48 | 8.3 | 18.9 | 48 / 76 | none |
| [FastLane](https://modarchive.org/index.php?request=view_by_moduleid&query=208417) | JAM | 1:49 | 10.0 | 15.5 | 69 / 83 | none |
| [City Patrol](https://modarchive.org/index.php?request=view_by_moduleid&query=206532) | JAM | 1:48 | 8.3 | 17.1 | 55 / 76 | none |
| [8-bit Castle](https://modarchive.org/index.php?request=view_by_moduleid&query=195782) | JAM | 2:11 | 8.3 | 16.1 | 48 / 83 | none |
| [Klopoty z Czasem](https://modarchive.org/index.php?request=view_by_moduleid&query=176492) | JAM | 2:12 | 12.3 | 10.3 | 76 / 90 | 9 |
| [Haunted Occult Mans](https://modarchive.org/index.php?request=view_by_moduleid&query=177399) | JAM | 4:25 | 5.6 | 7.0 | 48 / 76 | 9 |
| [XLR8](https://modarchive.org/index.php?request=view_by_moduleid&query=205968) | JAM | 2:53 | 8.3 | 12.4 | 48 / 83 | none |
| [Highway Encounter](https://modarchive.org/index.php?request=view_by_moduleid&query=211660) | JAM | 3:04 | 8.3 | 12.2 | 48 / 76 | none |
| [Chasing the UFO](https://modarchive.org/index.php?request=view_by_moduleid&query=176493) | JAM | 1:12 | 8.9 | 19.7 | 48 / 83 | none |
| [NeuroTransfer](https://modarchive.org/index.php?request=view_by_moduleid&query=169083) | JAM | 3:33 | 11.8 | 31.0 | 48 / 69 | none |

## Ruled out

| Song | Artist | Why |
|---|---|---|
| [Night Cruiser](https://modarchive.org/index.php?request=view_by_moduleid&query=208304) | JAM | Public Domain, but its sample names credit a commercial sample CD: "(c) 1998 MAZ, Sample-CD 'no.1 instruments'". |
| Ievan Polkka, IevanPolkkaRMX, PacManOnWax | JAM | Covers by their titles; licenses not checked. |
| Wires on Fire, Maxavision, intersection | JAM | CC BY-NC (Attribution Non-commercial). |

## Where to look next

- **Drozerix** is fully catalogued above as of 2026-11-10. New uploads appear on
  [the artist's page](https://modarchive.org/index.php?request=view_artist_modules&query=84702).
- **A new level 1:** the picks above, for Brad to hear.
