# Writing and voice

Read this before writing or changing anything a person reads: the README, these docs,
`CLAUDE.md`, code comments, commit messages, and every string the game shows a player.

It is adapted from ECTLogger's `docs/DOC-STYLE.md` and the output-style defaults in that
repo's agent instructions. The parts a script can check are enforced by
`pnpm check:docs` (`tools/check-docs.ts`), which runs in CI.

---

## 1. Voice

Write the way a developer writes to another developer, or a game writes to a player:
practical, specific, never breathless. It has to read like a person wrote it.

- **"You"** for the reader. "We" sparingly, for the project.
- **Sentence case** for headings, menu items, buttons, and labels. Proper names keep their
  real casing: libopenmpt, PixiJS, ProTracker, The Mod Archive, file extensions like `.xm`.
  The game title is set in `packages/client/src/config/brand.ts` and is written the way
  that file writes it.
- **Contractions are normal, in moderation.** About one per seventy words. Writing them all
  out reads stiff; leaning on them reads chatty.
- **No em-dashes**, anywhere: docs, source, comments, commit messages, UI text. Reach for a
  colon, a semicolon, parentheses, or a full stop. A definition list is written
  `**Term**: definition`. `check-docs` fails on the character.
- **No emoji** in code, comments, commit messages, docs, or UI text. `check-docs` fails on
  them.
- **Give the why where it isn't obvious.** A rule whose purpose a reader can't guess gets
  one plain reason, once. A reason tacked onto every sentence is filler.
- **Expand a term on first use per document**, then use it freely. Assume a developer
  knows TypeScript and the web platform. Don't assume they know tracker internals: "pattern
  break (Dxx)", "position jump (Bxx)", "VU (volume unit) meter".
- **Say what a module is.** Many players read "mod" as a game modification, not music.
  The first time a document, page, or screen mentions a module, mod, or tracker, say what it
  is: a song file made in a music tracker, a program that arranges short samples into
  patterns of notes and beats. Use the terms freely after that. In player-facing text the
  default word is "song"; the file types appear next to it where they help ("Import songs:
  MOD, XM, S3M, or IT files").
- **Be honest about limits** where the reader will hit them, not in a footnote.

### Plain wording

Say the fact once, in the plainest words that are true, and stop. Phrasing that reads as
machine written makes a reader stop trusting the rest of the page.

**Patterns to cut**, with the fix:

| Pattern | Before | After |
|---|---|---|
| Emphasis adverbs (genuinely, actually, really, truly, simply, quietly, honestly) | "the one genuinely deterministic path" | "the one deterministic path" |
| Reassurance and over-precision | "A hash that never, ever changes." | "The hash of the file's bytes." |
| A purpose clause on every sentence | "a cache, so you don't have to analyze the song again" | "Analysis results are cached." |
| Negative parallelism (not just X, X not Y, rather than) | "it checks the score, not just the input log" | "it re-runs the input log and compares the score" |
| Inflated verbs for "is" or "has" (serves as, stands as, features, boasts, offers) | "The manifest serves as the license record" | "The manifest is the license record" |
| Trailing "-ing" commentary | "..., making it easy to compare runs" | (cut, or its own sentence with a fact in it) |
| Padding to three | "fast, simple, and reliable" | the one that is true and checkable |
| Signposts (note that, keep in mind, it's worth noting, importantly) | "Note that replays are stored." | "Replays are stored." |
| Time filler (right now, currently, at this time) | "No server is running right now." | "No server is running." |

**Words that never appear** (`check-docs` fails on them): genuinely, honestly, truly,
delve, tapestry, testament, seamless, seamlessly, effortless, effortlessly, "it's worth
noting", "it's important to note", "rest assured", load-bearing.

**Words to check every time** (`check-docs` lists them and does not fail): actually,
really, simply, just, quietly, instantly, right now, exactly one, not just, so you can, so
you don't have to, whether you're, one click, serves as, stands as, key, crucial, vital,
robust, leverage, enhance, unlock, showcase, underscore, highlight (as a verb), landscape
(as an abstract noun), foster, multifaceted, pivotal, vibrant. Keep one only when removing
it changes the meaning: "leaderboard key" stays; "simply run the script" loses "simply".

One word proves nothing; people use all of these too. What gives text away is several of
them together, so read the paragraph, not the match.

Sources for the lists:

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
  WikiProject AI Cleanup's field guide.
- Kobak et al., [Delving into LLM-assisted writing in biomedical publications through excess vocabulary](https://arxiv.org/html/2406.07016v5).
- Juzek and Ward, [Why Does ChatGPT "Delve" So Much?](https://arxiv.org/abs/2412.11385).
- Liberman, [Are LLMs writing PubMed articles?](https://languagelog.ldc.upenn.edu/nll/?p=64877),
  on why a single word is weak evidence.

### Quoted text is verbatim

A module's title, an author's name, or a license string is quoted exactly as its source
writes it, punctuation included. Changing it to match house style makes it unsearchable
and, for attribution, wrong.

---

## 2. Accuracy

- **Verify every factual claim before writing it**, against the code, the file, or the
  upstream source. If you can't confirm something, leave it out and say so.
- **A confident sentence in an existing document is not evidence.** Check the code, not
  the last document that mentioned it.
- **Describe what exists.** The README, the changelog, and anything a player reads never
  describe a feature that isn't built. Unbuilt work lives in `docs/ROADMAP.md` and
  `docs/PLAN.md`.
- **Versions carry a date.** When a document names a dependency version or a release, it
  says when that was checked.

---

## 3. Where things go

| File | Reader | What it holds |
|---|---|---|
| `README.md` | Someone who just found the repo | What it is, its status, the license, links to the rest |
| `docs/PLAN.md` | Anyone building the game | Design, determinism rules, tech choices |
| `docs/ROADMAP.md` | Anyone asking what's next | Unfinished work in order, stages, open decisions |
| `docs/CHANGELOG.md` | Anyone asking what's done | Finished work, newest first |
| `docs/DEVELOPMENT.md` | Anyone changing the code | Setup, commands, layout, conventions, checks, process |
| `docs/DOC-STYLE.md` | Anyone writing | This file |
| `CLAUDE.md` | Coding agents | Working rules; points to the files above |

A topic gets one home. Other files link to it instead of repeating it.

---

## 4. Never do this

- Never use an em-dash or an emoji.
- Never ship filler phrasing (see "Plain wording").
- Never describe an unbuilt feature outside `docs/ROADMAP.md` and `docs/PLAN.md`.
- Never restyle quoted text or attribution.
- Never state a version without the date it was checked.
