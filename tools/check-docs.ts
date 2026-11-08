// Checks the writing rules in docs/DOC-STYLE.md that a script can check.
// Fails on: em-dashes in any text file, emoji in any text file, and the
// never-list words in Markdown. Lists the check-every-time words without failing.
// Usage: node tools/check-docs.ts

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP = new Set(['pnpm-lock.yaml']);
// The style guide lists the words, so it is exempt from the word checks (not from the others).
const WORD_EXEMPT = new Set(['docs/DOC-STYLE.md']);

const NEVER = [
  'genuinely', 'honestly', 'truly', 'delve', 'delves', 'delving', 'tapestry', 'testament',
  'seamless', 'seamlessly', 'effortless', 'effortlessly',
  "it's worth noting", "it's important to note", 'rest assured', 'load-bearing',
];

const CHECK = [
  'actually', 'really', 'simply', 'just', 'quietly', 'instantly', 'right now', 'exactly one',
  'not just', 'so you can', "so you don't have to", "whether you're", 'one click',
  'serves as', 'stands as', 'key', 'crucial', 'vital', 'robust', 'leverage', 'enhance',
  'unlock', 'showcase', 'underscore', 'highlight', 'landscape', 'foster', 'multifaceted',
  'pivotal', 'vibrant',
];

const EM_DASH = '\u2014';
const EMOJI = /\p{Emoji_Presentation}/u;

const wordRe = (w: string) => new RegExp(`(?<![\\w-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'iu');
const neverRes = NEVER.map((w) => [w, wordRe(w)] as const);
const checkRes = CHECK.map((w) => [w, wordRe(w)] as const);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && !SKIP.has(f));

const errors: string[] = [];
const notes: string[] = [];

for (const file of files) {
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch {
    continue; // deleted in the working tree
  }
  if (buf.includes(0)) continue; // binary
  const lines = buf.toString('utf8').split('\n');
  const checkWords = file.endsWith('.md') && !WORD_EXEMPT.has(file);
  let inFence = false;

  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    if (line.includes(EM_DASH)) errors.push(`${at}: em-dash (use a colon, semicolon, parentheses, or a full stop)`);
    if (EMOJI.test(line)) errors.push(`${at}: emoji`);
    if (!checkWords) return;

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const prose = line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');
    for (const [w, re] of neverRes) if (re.test(prose)) errors.push(`${at}: "${w}" is on the never list`);
    for (const [w, re] of checkRes) if (re.test(prose)) notes.push(`${at}: "${w}"`);
  });
}

if (notes.length) {
  console.log(`Words to check (keep one only if removing it changes the meaning):\n  ${notes.join('\n  ')}\n`);
}
if (errors.length) {
  console.error(`Writing rule violations:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-docs: ${files.length} files, no violations.`);
