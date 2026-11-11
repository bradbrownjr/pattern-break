import { describe, expect, it } from 'vitest';
import { ProfileForm, fieldText, saveError } from '../src/game/profile.ts';
import { ScoresMenu, entryText } from '../src/game/scores.ts';
import type { BoardView } from '../src/game/net.ts';

const BOARDS = [
  { name: 'arcade', label: 'Arcade' },
  { name: 'a'.repeat(64), label: 'Neon Techno' },
];

const VIEW: BoardView = {
  top: [
    { rank: 1, nickname: 'KC1', link: 'https://modarchive.org/', score: 900, levels: 8, finished: true },
    { rank: 2, nickname: 'AMY', link: null, score: 500, levels: 3, finished: false },
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

  it('shows the levels an arcade run reached when it ended in a game over', () => {
    expect(entryText(VIEW.top[1]!, true)).toEqual({ rank: '2', name: 'AMY', score: '500 L3' });
    expect(entryText(VIEW.top[0]!, true).score).toBe('900');
    expect(entryText(VIEW.top[1]!, false).score).toBe('500');
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
