// Checks music/manifest.json, the list of bundled songs (song files made in a music tracker)
// and their credits (docs/PLAN.md, "Bundled music"). Fails when a song file isn't listed, a
// listed file is missing, a hash doesn't match, a field is empty, or a license isn't on the
// allowlist. CC BY-SA fails until the entry records who reviewed it and when.
// Usage: node tools/validate-manifest.ts

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const MUSIC = new URL('../music/', import.meta.url);
const SONG_FILE = /\.(?:mod|xm|s3m|it|mptm)$/i;
const FIELDS = ['file', 'title', 'author', 'authorUrl', 'sourceUrl', 'license', 'licenseUrl', 'sha256'] as const;
const ALLOWED = /^(?:Public Domain|CC0(?: 1\.0)?|CC BY(?: [1-4]\.0)?)$/;
const NEEDS_REVIEW = /^CC BY-SA(?: [1-4]\.0)?$/;

const errors: string[] = [];
const manifest: unknown = JSON.parse(readFileSync(new URL('manifest.json', MUSIC), 'utf8'));
if (!Array.isArray(manifest)) throw new Error('music/manifest.json must be an array');

const listed = new Set<string>();
for (const [i, raw] of manifest.entries()) {
  const entry = raw as Record<string, unknown>;
  const name = typeof entry['file'] === 'string' ? entry['file'] : `entry ${i}`;
  for (const field of FIELDS) {
    const value = entry[field];
    if (typeof value !== 'string' || value.trim() === '') errors.push(`${name}: "${field}" is missing or empty`);
  }
  for (const field of ['authorUrl', 'sourceUrl', 'licenseUrl'] as const) {
    const value = entry[field];
    if (typeof value === 'string' && !value.startsWith('https://')) errors.push(`${name}: "${field}" must be an https URL`);
  }
  const license = String(entry['license'] ?? '');
  if (NEEDS_REVIEW.test(license)) {
    if (typeof entry['reviewed'] !== 'string' || entry['reviewed'].trim() === '') {
      errors.push(`${name}: ${license} needs Brad's review; record it as "reviewed": "<who>, <date>"`);
    }
  } else if (!ALLOWED.test(license)) {
    errors.push(`${name}: license "${license}" is not on the allowlist (Public Domain, CC0, CC BY)`);
  }
  if (typeof entry['file'] !== 'string') continue;
  if (listed.has(name)) errors.push(`${name}: listed twice`);
  listed.add(name);
  let bytes: Buffer;
  try {
    bytes = readFileSync(new URL(name, MUSIC));
  } catch {
    errors.push(`${name}: listed but not in music/`);
    continue;
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== entry['sha256']) errors.push(`${name}: sha256 is ${hash}, the manifest says ${String(entry['sha256'])}`);
}

for (const file of readdirSync(MUSIC)) {
  if (SONG_FILE.test(file) && !listed.has(file)) errors.push(`${file}: in music/ but not in manifest.json`);
}

// music/arcade.json names the arcade run's songs by file name without the extension.
const arcade: unknown = JSON.parse(readFileSync(new URL('arcade.json', MUSIC), 'utf8'));
const ids = new Set([...listed].map((file) => file.replace(/\.[^.]+$/, '')));
for (const list of ['levels', 'impossible'] as const) {
  const value = (arcade as Record<string, unknown>)[list];
  if (!Array.isArray(value) || value.length === 0) errors.push(`arcade.json: "${list}" must be a list of song ids`);
  else for (const id of value) if (!ids.has(String(id))) errors.push(`arcade.json: "${list}" names ${String(id)}, which isn't in the manifest`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`music/manifest.json: ${e}`);
  process.exit(1);
}
console.log(`music/manifest.json: ${listed.size} songs, all listed, hashed and licensed`);
