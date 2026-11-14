// The player's song library and level cache, in this browser's IndexedDB (docs/PLAN.md,
// "Client UI"; docs/DEVELOPMENT.md, "Library"). Four stores:
//
// - `songs`: imported song files (songs made in a music tracker), keyed by the SHA-256 of
//   their bytes, the hash replays already name a song by.
// - `levels`: serialized LevelData, keyed by song hash, tempo and GEN_VERSION, so a song is
//   analyzed once per difficulty tempo. Entries from another GEN_VERSION are useless and
//   are deleted when the library opens.
// - `identity`: the leaderboard device key (net.ts), one entry. The private key is a
//   non-extractable CryptoKey: it signs, but no script can read it out.
// - `pending`: finished runs waiting to be sent to the leaderboard (net.ts).
//
// IndexedDB can be missing or blocked (a private window, cleared or blocked site data), so
// openLibrary() resolves to null there and the game runs without a cache.

import { GEN_VERSION } from '@game/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StoredSong {
  /** SHA-256 of `bytes`, lower-case hex. */
  sha256: string;
  /** The file's name when imported, for the list and for export. */
  fileName: string;
  /** The song's own title, or the file name when it has none. */
  title: string;
  /** The artist the song names, or ''. */
  artist: string;
  bytes: ArrayBuffer;
  /** When it was imported, in ms since the epoch. */
  added: number;
  /** Its length in seconds; songs imported before 2026-11-11 learn it the first time they play. */
  seconds?: number;
}

export interface CachedLevel {
  key: string;
  sha256: string;
  tempoPermille: number;
  genVersion: number;
  /** serializeLevelData() of the analysis. */
  levelData: ArrayBuffer;
}

/** The leaderboard key pair: `publicKey` is the raw 32-byte key as base64url. */
export interface StoredIdentity {
  id: 'device';
  publicKey: string;
  privateKey: CryptoKey;
}

/** What a posted run is: a song from Levels, an arcade run, or one arcade level. */
export type RunKind = 'song' | 'arcade' | 'level';

/**
 * A finished run waiting to be sent: a song run's replay, an arcade run's level replays, or
 * one cleared arcade level's replay.
 */
export interface PendingRun {
  id?: number;
  kind: RunKind;
  /** The name it's posted under; none on a run queued before names went with runs. */
  name?: string;
  replays: ArrayBuffer[];
  /** When it finished, in ms since the epoch. */
  at: number;
}

interface LibrarySchema extends DBSchema {
  songs: { key: string; value: StoredSong };
  levels: { key: string; value: CachedLevel; indexes: { sha256: string } };
  identity: { key: string; value: StoredIdentity };
  pending: { key: number; value: PendingRun };
}

export const DB_NAME = 'pattern-break';
const DB_VERSION = 2;

/**
 * SHA-256 of `bytes` as lower-case hex, or null where the page can't hash: WebCrypto's
 * `crypto.subtle` exists only in secure contexts (HTTPS or localhost).
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Asks the browser to keep this site's data when the device runs short of space, so
 * imported songs aren't deleted with the rest of a site's "best-effort" data. Firefox asks
 * the player; Chromium and Safari decide from how the site has been used, without asking
 * (MDN, "Storage quotas and eviction criteria"). Does nothing once granted. Resolves to
 * whether the data is now kept.
 */
export async function keepStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist || !storage.persisted) return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

/** The level cache's key for a song at a tempo, under a GEN_VERSION. */
export function levelKey(sha256: string, tempoPermille: number, genVersion: number = GEN_VERSION): string {
  return `${sha256}:${tempoPermille}:${genVersion}`;
}

/** An ArrayBuffer holding exactly `bytes`, copied unless `bytes` already spans its buffer. */
function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer;
  return whole ? (bytes.buffer as ArrayBuffer) : bytes.slice().buffer;
}

export class Library {
  readonly #db: IDBPDatabase<LibrarySchema>;

  constructor(db: IDBPDatabase<LibrarySchema>) {
    this.#db = db;
  }

  /** A song's cached LevelData at a tempo for this GEN_VERSION, or null. */
  async level(sha256: string, tempoPermille: number): Promise<Uint8Array | null> {
    const entry = await this.#db.get('levels', levelKey(sha256, tempoPermille));
    return entry ? new Uint8Array(entry.levelData) : null;
  }

  async putLevel(sha256: string, tempoPermille: number, levelData: Uint8Array): Promise<void> {
    await this.#db.put('levels', {
      key: levelKey(sha256, tempoPermille),
      sha256,
      tempoPermille,
      genVersion: GEN_VERSION,
      levelData: ownBuffer(levelData),
    });
  }

  /** Deletes cached levels from any other GEN_VERSION; returns how many went. */
  async pruneLevels(): Promise<number> {
    const tx = this.#db.transaction('levels', 'readwrite');
    let removed = 0;
    for await (const cursor of tx.store) {
      if (cursor.value.genVersion !== GEN_VERSION) {
        await cursor.delete();
        removed++;
      }
    }
    await tx.done;
    return removed;
  }

  /** Every imported song, oldest first. */
  async songs(): Promise<StoredSong[]> {
    const all = await this.#db.getAll('songs');
    return all.sort((a, b) => a.added - b.added);
  }

  async song(sha256: string): Promise<StoredSong | null> {
    return (await this.#db.get('songs', sha256)) ?? null;
  }

  /** Stores an imported song; one with the same hash is replaced. */
  async putSong(song: StoredSong): Promise<void> {
    await this.#db.put('songs', song);
  }

  /** Removes an imported song and its cached levels. */
  async deleteSong(sha256: string): Promise<void> {
    const tx = this.#db.transaction(['songs', 'levels'], 'readwrite');
    const levels = tx.objectStore('levels');
    const keys = await levels.index('sha256').getAllKeys(sha256);
    await Promise.all([tx.objectStore('songs').delete(sha256), ...keys.map((k) => levels.delete(k)), tx.done]);
  }

  async identity(): Promise<StoredIdentity | null> {
    return (await this.#db.get('identity', 'device')) ?? null;
  }

  async putIdentity(identity: StoredIdentity): Promise<void> {
    await this.#db.put('identity', identity);
  }

  /** Runs waiting to be sent, oldest first. */
  async pendingRuns(): Promise<PendingRun[]> {
    return this.#db.getAll('pending');
  }

  /** Queues a run; resolves to its id in the queue. */
  async addPending(run: PendingRun): Promise<number> {
    return this.#db.add('pending', run);
  }

  async deletePending(id: number): Promise<void> {
    await this.#db.delete('pending', id);
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Opens the library and drops levels from older GEN_VERSIONs, or resolves to null where
 * IndexedDB is unavailable or fails to open.
 */
export async function openLibrary(name: string = DB_NAME): Promise<Library | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    let opened: IDBPDatabase<LibrarySchema> | null = null;
    const db = await openDB<LibrarySchema>(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('songs', { keyPath: 'sha256' });
          db.createObjectStore('levels', { keyPath: 'key' }).createIndex('sha256', 'sha256');
        }
        if (oldVersion < 2) {
          db.createObjectStore('identity', { keyPath: 'id' });
          db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        }
      },
      // A newer build in another tab wants to upgrade the database: let it, rather than
      // leave it waiting. This tab's library stops working until it reloads.
      blocking() {
        opened?.close();
      },
    });
    opened = db;
    const library = new Library(db);
    await library.pruneLevels();
    return library;
  } catch (err) {
    console.warn('song library unavailable:', err);
    return null;
  }
}
