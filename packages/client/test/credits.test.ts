import { describe, expect, it } from 'vitest';
import manifest from '../../../music/manifest.json';
import { CREDITS_VISIBLE_ROWS, CreditsMenu, creditRows, creditsTop, type CreditRow } from '../src/game/credits.ts';
import { SONGS, TEST_SONG, importedSong } from '../src/game/songs.ts';

describe('credit rows', () => {
  it('credit every bundled song, in order, with its page on The Mod Archive', () => {
    const rows = creditRows(SONGS);
    const songs = rows.slice(1, 1 + manifest.length);
    expect(rows[0]).toEqual({ heading: 'Music' });
    expect(songs.map((r) => ('url' in r ? r.url : ''))).toEqual(manifest.map((m) => m.sourceUrl));
    expect(songs.map((r) => ('label' in r ? `${r.label} ${r.value}` : ''))).toEqual(manifest.map((m) => `${m.title} ${m.author}`));
    expect(songs.every((r) => 'detail' in r && r.detail === 'Public Domain  modarchive.org')).toBe(true);
  });

  it('leave out the test song and imported songs, which have no page', () => {
    const imported = importedSong({ sha256: 'a'.repeat(64), fileName: 'x.xm', title: 'X', artist: '', bytes: new ArrayBuffer(1), added: 0 });
    const rows = creditRows([TEST_SONG, ...SONGS, imported]);
    expect(rows.filter((r) => 'url' in r && r.url.startsWith('https://modarchive.org'))).toHaveLength(manifest.length);
    URL.revokeObjectURL(imported.url);
  });

  it('link each library to a license text the build serves', () => {
    const code = creditRows([]).filter((r): r is Extract<CreditRow, { url: string }> => 'url' in r && !r.url.startsWith('https:'));
    expect(code.map((r) => `${r.label} ${r.url}`)).toEqual([
      'libopenmpt licenses/libopenmpt.txt',
      'PixiJS licenses/third-party.txt',
      'idb licenses/third-party.txt',
      'Workbox licenses/workbox.txt',
    ]);
  });
});

describe('CreditsMenu', () => {
  const rows: CreditRow[] = [
    { heading: 'A' },
    { label: 'one', value: '', detail: '', url: 'u1' },
    { label: 'two', value: '', detail: '', url: 'u2' },
    { heading: 'B' },
    { label: 'three', value: '', detail: '', url: 'u3' },
  ];

  it('moves over the links only, wrapping, and opens the one under the cursor', () => {
    const m = new CreditsMenu(rows);
    expect(m.cursor).toBe(1);
    m.apply('down');
    m.apply('down');
    expect(m.cursor).toBe(4);
    expect(m.apply('confirm')).toEqual({ type: 'open', url: 'u3' });
    m.apply('down');
    expect(m.cursor).toBe(1);
    expect(m.apply('up')).toEqual({ type: 'moved' });
    expect(m.cursor).toBe(4);
    expect(m.apply('back')).toEqual({ type: 'back' });
    m.reset();
    expect(m.cursor).toBe(1);
  });

  it('scrolls as little as it can, showing the heading above a section\'s first link', () => {
    const long = creditRows(SONGS);
    const visible = CREDITS_VISIBLE_ROWS;
    expect(long.length).toBeGreaterThan(visible);
    const last = long.length - 1;
    expect(creditsTop(0, last, long, visible)).toBe(long.length - visible);
    expect(creditsTop(long.length - visible, 1, long, visible)).toBe(0);
    // Back up to the first song: the Music heading above it comes into view too.
    expect(creditsTop(5, 1, long, visible)).toBe(0);
    expect(creditsTop(5, 2, long, visible)).toBe(2);
  });
});
