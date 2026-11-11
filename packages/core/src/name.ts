// The name a run is posted under (docs/PLAN.md, "Server", "Names"), shared by the client's
// name entry and the server's check so both apply one rule. A name is 1 to 8 capitals,
// digits, spaces and a few marks, as on an arcade's high score table, with no space at
// either end. No underscore: the name entry shows empty places as underscores.
//
// The rough filter for obvious vulgarities. A plain list of words matched anywhere blocks
// innocent words that contain one, the "Scunthorpe problem" (Wikipedia, "Scunthorpe
// problem": broad rules "may result in false positives affecting many innocent phrases").
// So a root that sits inside common words (ASS in CLASS and CUTLASS, TIT in TITLE) counts
// only as a whole word, and only a root that rarely does (FUCK) counts anywhere. Each
// pattern runs on two readings of the name: with look-alike digits read as letters (A55 as
// ASS) and marks as spaces, and the same with runs of single letters joined, so A.S.S and
// F U C K fail too. Whole words are never joined, or PUSH IT would read as PUSHIT. The
// innocent names in packages/core/test/name.test.ts are the check against false matches.

export const NAME_MAX = 8;

/** The characters a name may hold, in the order a gamepad's up cycles through them. */
export const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-!?';

const NAME = /^[A-Z0-9.\-!?](?:[A-Z0-9 .\-!?]{0,6}[A-Z0-9.\-!?])?$/;

/** Roots that count anywhere in a name. */
const ANYWHERE = new RegExp(
  [
    'F+U+C+K',
    'SH+I+T',
    '(?<!S)C+U+N+T',
    'N+I+G+G',
    'NIGLET',
    'F+A+G+O+T',
    'F+A+G+G',
    'WH+O+R+E',
    'P+U+S+S+Y',
    'B+I+T+C+H',
    'SLUT',
    'DILDO',
    'PENIS',
    'VAGINA',
    'RAPIST',
    'JIZZ',
    'PORN',
    'TWAT',
    'PISS',
    'HITLER',
    'KKK',
    'BOLLOCK',
    'WANKER',
    'ASS(?:HOLE|HAT|WIPE|CLOWN|FACE|LICK)',
    '(?:DUMB|JACK|FAT|LAME|BAD|KICK)ASS',
    'DICK(?:HEAD|FACE|S\\b)',
    'COCK(?:SUCK|HEAD|S\\b)',
    'CUMSHOT',
    'MOTHERF',
  ].join('|'),
);

/** Roots that count only as a whole word: they sit inside too many innocent ones. */
const WORD = new RegExp(
  `(?:^| )(?:${[
    'ASS(?:ES)?',
    'ARSE',
    'TITS?',
    'TITTY',
    'TITTIES',
    'FAGS?',
    'DICK',
    'COCK',
    'CUM',
    'SEXY?',
    'ANAL',
    'ANUS',
    'RAPED?',
    'RAPES',
    'HOMO',
    'BOOBS?',
    'WANK',
    'NAZIS?',
    'SPERM',
  ].join('|')})(?= |$)`,
);

const LOOKALIKES: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '3': 'E',
  '4': 'A',
  '5': 'S',
  '7': 'T',
  '8': 'B',
  '9': 'G',
  '!': 'I',
};

/**
 * The two readings the filter checks: look-alikes as letters and marks as spaces
 * ("A55-MAN" as "ASS MAN"), and that with runs of single letters joined ("A S S" as "ASS").
 */
export function nameReadings(name: string): { spaced: string; joined: string } {
  let spaced = '';
  for (const c of name.toUpperCase()) spaced += LOOKALIKES[c] ?? (c >= 'A' && c <= 'Z' ? c : ' ');
  const words: string[] = [];
  let letters = '';
  for (const word of spaced.split(' ')) {
    if (word.length === 1) {
      letters += word;
      continue;
    }
    if (letters) words.push(letters);
    letters = '';
    if (word) words.push(word);
  }
  if (letters) words.push(letters);
  return { spaced, joined: words.join(' ') };
}

/** True when the filter finds an obvious vulgarity in `name`. */
export function isVulgar(name: string): boolean {
  const { spaced, joined } = nameReadings(name);
  return ANYWHERE.test(spaced) || ANYWHERE.test(joined) || WORD.test(spaced) || WORD.test(joined);
}

/** What's wrong with `name`: 'empty', 'bad' (characters or length), 'vulgar', or null. */
export function nameProblem(name: string): 'empty' | 'bad' | 'vulgar' | null {
  if (name.trim() === '') return 'empty';
  if (!NAME.test(name)) return 'bad';
  return isVulgar(name) ? 'vulgar' : null;
}

/** `text` in capitals, kept to NAME_CHARS, at most NAME_MAX long: what typing it gives. */
export function cleanName(text: string): string {
  let out = '';
  for (const c of text.toUpperCase()) if (NAME_CHARS.includes(c)) out += c;
  return out.slice(0, NAME_MAX);
}
