import { describe, expect, it } from 'vitest';
import manifest from '../../../music/manifest.json';
import { CreditsRoll, RESUME_MS, ROLL_PX_PER_S, ROW, creditRows, endingRows, isLink, type CreditRow } from '../src/game/credits.ts';
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

describe('CreditsRoll', () => {
  const rows: CreditRow[] = [
    { heading: 'A' },
    { label: 'one', value: '', detail: '', url: 'u1' },
    { label: 'two', value: '', detail: '', url: 'u2' },
    { text: '' },
    { heading: 'B' },
    { label: 'three', value: '', detail: '', url: 'u3' },
  ];
  const VIEW = 3 * ROW;

  it('starts below the view and rolls up at its speed', () => {
    const roll = new CreditsRoll(rows, VIEW, true);
    expect(roll.offset).toBe(-VIEW);
    roll.tick(1000);
    expect(roll.offset).toBe(-VIEW + ROLL_PX_PER_S);
  });

  it('loops on the title menu once the last row has gone', () => {
    const roll = new CreditsRoll(rows, VIEW, true);
    roll.tick(((VIEW + roll.contentHeight) * 1000) / ROLL_PX_PER_S);
    expect(roll.offset).toBe(-VIEW);
    expect(roll.ended).toBe(false);
    expect(roll.apply('back')).toEqual({ type: 'back' });
  });

  it('stops on a row at a press, moves between links, opens one, and rolls on after a pause', () => {
    const roll = new CreditsRoll(rows, VIEW, true);
    roll.offset = 0;
    // The view's middle is at 16.5 px: row 1 ("one", 11 to 22) is the nearest link.
    expect(roll.apply('down')).toEqual({ type: 'moved' });
    expect(roll.cursor).toBe(1);
    roll.tick(1000);
    expect(roll.offset).toBe(0);
    roll.apply('down');
    roll.apply('down');
    expect(roll.cursor).toBe(5);
    // Row 5 ends at 66 px, below the 33 px view: the roll scrolls just enough to show it.
    expect(roll.offset).toBe(66 - VIEW);
    expect(roll.apply('down')).toBeNull();
    expect(roll.apply('confirm')).toEqual({ type: 'open', url: 'u3' });
    roll.tick(RESUME_MS - 1);
    expect(roll.cursor).toBe(5);
    roll.tick(1);
    expect(roll.cursor).toBeNull();
    const at = roll.offset;
    roll.tick(1000);
    expect(roll.offset).toBe(at + ROLL_PX_PER_S);
  });

  it('a first confirm only stops the roll; it opens nothing', () => {
    const roll = new CreditsRoll(rows, VIEW, true);
    roll.offset = 0;
    expect(roll.apply('confirm')).toEqual({ type: 'moved' });
    expect(roll.cursor).toBe(1);
  });

  it('ends the ending on The End in the middle of the view, and Esc skips there', () => {
    const songs = SONGS.slice(0, 2);
    const ending = endingRows(songs, 'Normal', 5000);
    expect(ending[0]).toEqual({ text: 'Thank you for playing', color: expect.any(Number), size: 2 });
    expect(ending).toContainEqual({ text: 'Normal  Total 5000', color: expect.any(Number) });
    expect(ending.at(-1)).toMatchObject({ text: 'The End', size: 2 });
    expect(ending.filter(isLink)).toHaveLength(creditRows(songs).filter(isLink).length);

    const roll = new CreditsRoll(ending, 100, false);
    roll.tick(10 * 60 * 1000);
    expect(roll.ended).toBe(true);
    const last = ending.length - 1;
    expect(roll.offset + 50).toBe(roll.rowTops[last]! + ROW);
    expect(roll.apply('down')).toBeNull();
    expect(roll.apply('confirm')).toEqual({ type: 'back' });

    const skipped = new CreditsRoll(ending, 100, false);
    expect(skipped.apply('back')).toEqual({ type: 'skipped' });
    expect(skipped.ended).toBe(true);
    expect(skipped.offset).toBe(roll.offset);
  });
});
