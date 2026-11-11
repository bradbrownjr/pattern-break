import { describe, expect, it } from 'vitest';
import { ProfileForm, fieldText, saveError } from '../src/game/profile.ts';
import { PLAYER_COLOURS } from '../src/render/palette.ts';
import { ScoresMenu, entryText, playerColour } from '../src/game/scores.ts';
import type { BoardView } from '../src/game/net.ts';

const BOARDS = [
  { name: 'arcade', label: 'Arcade' },
  { name: 'a'.repeat(64), label: 'Neon Techno' },
];

const VIEW: BoardView = {
  top: [
    { rank: 1, nickname: 'KC1', link: 'https://modarchive.org/', score: 900, levels: 8, finished: true, mark: 7 },
    { rank: 2, nickname: 'AMY', link: null, score: 500, levels: 3, finished: false, mark: 0xffffffff },
  ],
  you: null,
  players: 2,
};

describe('ScoresMenu', () => {
  it('changes the board and the difficulty with left and right, wrapping', () => {
    const m = new ScoresMenu(BOARDS, ['easy', 'normal', 'hard'], 'normal');
    expect(m.difficultyName).toBe('normal');
    expect(m.apply('left')).toEqual({ type: 'changed' });
    expect(m.choice.label).toBe('Neon Techno');
    m.apply('down');
    m.apply('right');
    m.apply('right');
    expect(m.difficultyName).toBe('easy');
  });

  it('starts on the title menu difficulty, or the first when that one is hidden', () => {
    expect(new ScoresMenu(BOARDS, ['easy', 'normal', 'hard'], 'impossible').difficultyName).toBe('easy');
  });

  it('opens the name entry from Name, and a player link from their row', () => {
    const m = new ScoresMenu(BOARDS, ['normal'], 'normal');
    m.setState({ kind: 'board', view: VIEW });
    m.cursor = 2;
    expect(m.apply('confirm')).toEqual({ type: 'name' });
    m.apply('down');
    expect(m.apply('confirm')).toEqual({ type: 'open', url: 'https://modarchive.org/' });
    m.apply('down');
    expect(m.apply('confirm')).toBeNull();
    expect(m.apply('back')).toEqual({ type: 'back' });
  });

  it('keeps the cursor on a row that exists when the board shrinks', () => {
    const m = new ScoresMenu(BOARDS, ['normal'], 'normal');
    m.setState({ kind: 'board', view: VIEW });
    m.cursor = 4;
    m.setState({ kind: 'loading' });
    expect(m.row).toEqual({ kind: 'name' });
  });

  it('shows the levels an arcade run reached in their own column, so scores stay aligned', () => {
    expect(entryText(VIEW.top[1]!, true)).toEqual({ rank: '2', name: 'AMY', levels: 'L3', score: '500' });
    expect(entryText(VIEW.top[0]!, true).levels).toBe('');
    expect(entryText(VIEW.top[1]!, false).levels).toBe('');
  });

  it("colours a row by the player's mark, any 32-bit mark", () => {
    expect(playerColour(7)).toBe(PLAYER_COLOURS[7]);
    expect(playerColour(0xffffffff)).toBe(PLAYER_COLOURS[0xffffffff % 12]);
    expect(PLAYER_COLOURS).toContain(playerColour(123456789));
  });
});

describe('ProfileForm', () => {
  it('types into the field under the cursor, up to its length', () => {
    const f = new ProfileForm();
    expect(f.type('KC1JMH-BRADLEY')).toBe(true);
    expect(f.nickname).toBe('KC1JMH-BRADL');
    expect(f.type('X')).toBe(false);
    f.erase();
    expect(f.nickname).toBe('KC1JMH-BRAD');
    f.apply('down');
    f.type('https://example.org/é');
    expect(f.link).toBe('https://example.org/');
  });

  it('checks the name and link before saving', () => {
    const f = new ProfileForm(' KC1', 'ftp://x');
    f.cursor = 2;
    expect(f.apply('confirm')).toBeNull();
    expect(f.error).toBe('Bad name');
    f.nickname = 'KC1';
    expect(f.apply('confirm')).toBeNull();
    expect(f.error).toBe('Bad link');
    f.link = '';
    expect(f.apply('confirm')).toBe('save');
  });

  it('moves to the next row on Enter in a field', () => {
    const f = new ProfileForm('KC1');
    expect(f.apply('confirm')).toBe('moved');
    expect(f.row).toBe('link');
  });

  it("shows a long link's end, with a cursor when selected", () => {
    const long = `https://example.org/${'x'.repeat(40)}`;
    expect(fieldText(long, false, true)).toHaveLength(35);
    expect(fieldText('KC1', true, true)).toBe('KC1_');
    expect(fieldText('KC1', true, false)).toBe('KC1 ');
  });

  it("puts the server's answers in arcade terse words", () => {
    expect(saveError('nickname taken')).toBe('Name taken');
    expect(saveError('offline')).toBe('Offline');
    expect(saveError('something new')).toBe('Not saved');
  });
});
