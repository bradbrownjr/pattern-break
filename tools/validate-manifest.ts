// Checks music/manifest.json, the list of bundled songs (song files made in a music tracker)
// and their credits (docs/PLAN.md, "Bundled music"), and the test songs' manifest in
// packages/analysis/fixtures/test-songs the same way. Fails when a song file isn't listed, a
// listed file is missing, a hash doesn't match, a field is empty, or a license isn't on the
// allowlist. CC BY-SA fails until the entry records who reviewed it and when.
// Usage: node tools/validate-manifest.ts

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const MUSIC = new URL('../music/', import.meta.url);
const TEST_SONGS = new URL('../packages/analysis/fixtures/test-songs/', import.meta.url);
const SONG_FILE = /\.(?:mod|xm|s3m|it|mptm)$/i;
const FIELDS = ['file', 'title', 'author', 'authorUrl', 'sourceUrl', 'license', 'licenseUrl', 'sha256'] as const;
const ALLOWED = /^(?:Public Domain|CC0(?: 1\.0)?|CC BY(?: [1-4]\.0)?)$/;
const NEEDS_REVIEW = /^CC BY-SA(?: [1-4]\.0)?$/;

const errors: string[] = [];

/** Checks `manifest.json` in `folder` (shown as `label`) and returns the files it lists. */
function checkFolder(folder: URL, label: string): Set<string> {
  const listed = new Set<string>();
  const manifest: unknown = JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8'));
  if (!Array.isArray(manifest)) {
    errors.push(`${label}manifest.json: must be an array`);
    return listed;
  }
  for (const [i, raw] of manifest.entries()) {
    const entry = raw as Record<string, unknown>;
    const name = typeof entry['file'] === 'string' ? entry['file'] : `entry ${i}`;
    const fail = (message: string) => errors.push(`${label}manifest.json: ${name}: ${message}`);
    for (const field of FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string' || value.trim() === '') fail(`"${field}" is missing or empty`);
    }
    for (const field of ['authorUrl', 'sourceUrl', 'licenseUrl'] as const) {
      const value = entry[field];
      if (typeof value === 'string' && !value.startsWith('https://')) fail(`"${field}" must be an https URL`);
    }
    const license = String(entry['license'] ?? '');
    if (NEEDS_REVIEW.test(license)) {
      if (typeof entry['reviewed'] !== 'string' || entry['reviewed'].trim() === '') {
        fail(`${license} needs Brad's review; record it as "reviewed": "<who>, <date>"`);
      }
    } else if (!ALLOWED.test(license)) {
      fail(`license "${license}" is not on the allowlist (Public Domain, CC0, CC BY)`);
    }
    if (typeof entry['file'] !== 'string') continue;
    if (listed.has(name)) fail('listed twice');
    listed.add(name);
    let bytes: Buffer;
    try {
      bytes = readFileSync(new URL(name, folder));
    } catch {
      fail(`listed but not in ${label}`);
      continue;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry['sha256']) fail(`sha256 is ${hash}, the manifest says ${String(entry['sha256'])}`);
  }
  for (const file of readdirSync(folder)) {
    if (SONG_FILE.test(file) && !listed.has(file)) errors.push(`${label}${file}: not in manifest.json`);
  }
  return listed;
}

const listed = checkFolder(MUSIC, 'music/');
const tests = checkFolder(TEST_SONGS, 'packages/analysis/fixtures/test-songs/');

// music/arcade.json names the arcade run's songs by file name without the extension.
const arcade: unknown = JSON.parse(readFileSync(new URL('arcade.json', MUSIC), 'utf8'));
const ids = new Set([...listed].map((file) => file.replace(/\.[^.]+$/, '')));
for (const list of ['levels', 'impossible'] as const) {
  const value = (arcade as Record<string, unknown>)[list];
  if (!Array.isArray(value) || value.length === 0) errors.push(`music/arcade.json: "${list}" must be a list of song ids`);
  else for (const id of value) if (!ids.has(String(id))) errors.push(`music/arcade.json: "${list}" names ${String(id)}, which isn't in the manifest`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`${listed.size} bundled songs and ${tests.size} test songs, all listed, hashed and licensed`);
