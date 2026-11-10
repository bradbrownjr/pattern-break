// The song library and level cache (src/game/library.ts) against each browser's real
// IndexedDB (the `browser` project in vitest.config.ts). Each test opens its own database
// and deletes it afterwards.

import { GEN_VERSION } from '@game/core';
import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { levelKey, openLibrary, type Library, type StoredSong } from '../../src/game/library.ts';

const opened: { name: string; library: Library | null }[] = [];
let counter = 0;

async function freshLibrary(): Promise<{ name: string; library: Library }> {
  const name = `pattern-break-test-${Date.now()}-${counter++}`;
  const library = await openLibrary(name);
  opened.push({ name, library });
  if (!library) throw new Error('IndexedDB did not open');
  return { name, library };
}

afterEach(async () => {
  // Close every connection first: deleting a database waits while one is still open.
  const done = opened.splice(0);
  for (const { library } of done) library?.close();
  for (const name of new Set(done.map((d) => d.name))) await deleteDB(name);
});

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function song(sha256: string, added: number, title = 'Song'): StoredSong {
  return { sha256, fileName: `${title}.xm`, title, bytes: new Uint8Array([1, 2, 3]).buffer, added };
}

describe('level cache', () => {
  it('returns a stored level for the same song and tempo only', async () => {
    const { library } = await freshLibrary();
    await library.putLevel(HASH_A, 1000, new Uint8Array([9, 8, 7]));
    expect(await library.level(HASH_A, 1000)).toEqual(new Uint8Array([9, 8, 7]));
    expect(await library.level(HASH_A, 900)).toBeNull();
    expect(await library.level(HASH_B, 1000)).toBeNull();
  });

  it('stores exactly the bytes of a view into a larger buffer', async () => {
    const { library } = await freshLibrary();
    const whole = new Uint8Array([0, 1, 2, 3, 4, 5]);
    await library.putLevel(HASH_A, 1000, whole.subarray(2, 5));
    expect(await library.level(HASH_A, 1000)).toEqual(new Uint8Array([2, 3, 4]));
  });

  it('drops levels from another GEN_VERSION when the library opens', async () => {
    const { name, library } = await freshLibrary();
    await library.putLevel(HASH_A, 1000, new Uint8Array([1]));
    library.close();
    // A level left by an older build, written as that build would have.
    const raw = await openDB(name, 1);
    const stale = levelKey(HASH_A, 900, GEN_VERSION - 1);
    await raw.put('levels', { key: stale, sha256: HASH_A, tempoPermille: 900, genVersion: GEN_VERSION - 1, levelData: new ArrayBuffer(1) });
    raw.close();

    const reopened = await openLibrary(name);
    opened.push({ name, library: reopened });
    const check = await openDB(name, 1);
    const keys = await check.getAllKeys('levels');
    check.close();
    expect(keys).toEqual([levelKey(HASH_A, 1000)]);
    expect(await reopened!.level(HASH_A, 1000)).toEqual(new Uint8Array([1]));
  });
});

describe('imported songs', () => {
  it('lists songs oldest first and replaces one with the same hash', async () => {
    const { library } = await freshLibrary();
    await library.putSong(song(HASH_B, 20, 'Second'));
    await library.putSong(song(HASH_A, 10, 'First'));
    expect((await library.songs()).map((s) => s.title)).toEqual(['First', 'Second']);
    await library.putSong(song(HASH_A, 10, 'First again'));
    expect((await library.songs()).map((s) => s.title)).toEqual(['First again', 'Second']);
    expect(new Uint8Array((await library.song(HASH_A))!.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('deletes a song together with its cached levels, leaving the others', async () => {
    const { library } = await freshLibrary();
    await library.putSong(song(HASH_A, 1));
    await library.putSong(song(HASH_B, 2));
    await library.putLevel(HASH_A, 900, new Uint8Array([1]));
    await library.putLevel(HASH_A, 1000, new Uint8Array([2]));
    await library.putLevel(HASH_B, 1000, new Uint8Array([3]));
    await library.deleteSong(HASH_A);
    expect(await library.song(HASH_A)).toBeNull();
    expect(await library.level(HASH_A, 900)).toBeNull();
    expect(await library.level(HASH_A, 1000)).toBeNull();
    expect(await library.song(HASH_B)).not.toBeNull();
    expect(await library.level(HASH_B, 1000)).toEqual(new Uint8Array([3]));
  });
});
