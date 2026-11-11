// Where the server finds song files (song files made in a music tracker) by SHA-256: the
// bundled ones in music/, listed in music/manifest.json, and the ones players uploaded,
// stored as data/songs/<hash>. Uploaded songs are kept only to check runs; they are never
// served (docs/PLAN.md, "Server").

import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BundledEntry {
  file: string;
  title: string;
  author: string;
  license: string;
  sourceUrl: string | null;
  sha256: string;
}

/** Plain data, so it can be handed to the check worker. */
export interface SongStore {
  musicDir: string;
  uploadDir: string;
  /** Bundled songs by hash. */
  bundled: Record<string, BundledEntry>;
  /** The arcade's songs by hash, in order (music/arcade.json names them by file). */
  arcade: { levels: string[]; impossible: string[] };
}

export const HASH = /^[0-9a-f]{64}$/;

/** Reads music/manifest.json and music/arcade.json. */
export function openSongStore(musicDir: string, dataDir: string): SongStore {
  const manifest = JSON.parse(readFileSync(join(musicDir, 'manifest.json'), 'utf8')) as BundledEntry[];
  const order = JSON.parse(readFileSync(join(musicDir, 'arcade.json'), 'utf8')) as {
    levels: string[];
    impossible: string[];
  };
  const bundled: Record<string, BundledEntry> = {};
  const byId = new Map<string, string>();
  for (const entry of manifest) {
    bundled[entry.sha256] = entry;
    byId.set(entry.file.replace(/\.[^.]+$/, ''), entry.sha256);
  }
  const hashes = (ids: string[]): string[] =>
    ids.map((id) => {
      const hash = byId.get(id);
      if (!hash) throw new Error(`music/arcade.json names ${id}, which isn't in music/manifest.json`);
      return hash;
    });
  return {
    musicDir,
    uploadDir: join(dataDir, 'songs'),
    bundled,
    arcade: { levels: hashes(order.levels), impossible: hashes(order.impossible) },
  };
}

export function songReader(store: SongStore): (hash: string) => Promise<Uint8Array | null> {
  return async (hash) => {
    if (!HASH.test(hash)) return null;
    const entry = store.bundled[hash];
    const path = entry ? join(store.musicDir, entry.file) : join(store.uploadDir, hash);
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      return null;
    }
  };
}

/** Whether the server has the song's file. */
export async function hasSong(store: SongStore, hash: string): Promise<boolean> {
  if (store.bundled[hash]) return true;
  if (!HASH.test(hash)) return false;
  return stat(join(store.uploadDir, hash)).then(
    (info) => info.isFile(),
    () => false,
  );
}

/** Stores an uploaded song under its hash; the caller has checked the hash. */
export async function storeSong(store: SongStore, hash: string, bytes: Uint8Array): Promise<void> {
  if (!HASH.test(hash)) throw new Error('storeSong: not a hash');
  await mkdir(store.uploadDir, { recursive: true });
  const file = join(store.uploadDir, hash);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}
