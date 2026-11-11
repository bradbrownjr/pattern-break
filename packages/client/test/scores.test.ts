import { describe, expect, it } from 'vitest';
import { PAD_CHARS, ProfileForm, fieldView, profileHint, saveError } from '../src/game/profile.ts';
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
    const f = new ProfileForm('Bé', 'ftp://x');
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

  it('trims spaces from the ends of the name on save', () => {
    const f = new ProfileForm(' KC1 ');
    f.cursor = 2;
    expect(f.apply('confirm')).toBe('save');
    expect(f.nickname).toBe('KC1');
  });

  it("shows a long link's end, or the part with the cursor in it", () => {
    const long = `https://example.org/${'x'.repeat(40)}`;
    expect(fieldView(long, long.length)).toEqual({ text: long.slice(-35), cursor: 35 });
    expect(fieldView(long, 3)).toEqual({ text: long.slice(3, 38), cursor: 0 });
    expect(fieldView('KC1', 1)).toEqual({ text: 'KC1', cursor: 1 });
  });

  it('cycles letters arcade style on a gamepad, capitals first', () => {
    expect(PAD_CHARS).toHaveLength(95);
    expect(new Set(PAD_CHARS).size).toBe(95);
    expect(PAD_CHARS.slice(0, 3)).toBe('ABC');
    const f = new ProfileForm();
    expect(f.at).toBe(0);
    expect(f.applyPad('up')).toBe('changed');
    expect(f.nickname).toBe('A');
    f.applyPad('up');
    f.applyPad('up');
    expect(f.nickname).toBe('C');
    f.applyPad('down');
    expect(f.nickname).toBe('B');
    expect(f.applyPad('right')).toBe('moved');
    expect(f.at).toBe(1);
    expect(f.applyPad('right')).toBeNull();
    f.applyPad('down');
    expect(f.nickname).toBe(`B${PAD_CHARS.at(-1)}`);
    f.applyPad('up');
    expect(f.nickname).toBe('BA');
    expect(f.applyPad('left')).toBe('moved');
    f.applyPad('up');
    expect(f.nickname).toBe('CA');
    expect(f.applyPad('left')).toBeNull();
  });

  it('erases with Y and stops at the length on a gamepad', () => {
    const f = new ProfileForm('KC1JMH');
    expect(f.at).toBe(6);
    expect(f.applyPad('erase')).toBe('changed');
    expect(f.nickname).toBe('KC1JM');
    f.applyPad('left');
    f.applyPad('left');
    expect(f.applyPad('erase')).toBe('changed');
    expect(f.nickname).toBe('KC1M');
    expect(f.at).toBe(3);
    const full = new ProfileForm('ABCDEFGHIJKL');
    expect(full.at).toBe(11);
    expect(full.applyPad('right')).toBeNull();
    full.applyPad('up');
    expect(full.nickname).toBe('ABCDEFGHIJKM');
  });

  it('sets a name and saves with a gamepad alone', () => {
    const f = new ProfileForm();
    for (const c of 'KC1') {
      const steps = PAD_CHARS.indexOf(c) + 1;
      for (let i = 0; i < steps; i++) f.applyPad('up');
      f.applyPad('right');
    }
    expect(f.nickname).toBe('KC1');
    expect(f.applyPad('confirm')).toBe('moved');
    expect(f.row).toBe('link');
    expect(f.applyPad('confirm')).toBe('moved');
    expect(f.row).toBe('save');
    expect(f.applyPad('down')).toBe('moved');
    expect(f.row).toBe('nickname');
    expect(f.at).toBe(3);
    f.cursor = 2;
    expect(f.applyPad('confirm')).toBe('save');
    expect(f.applyPad('back')).toBe('back');
  });

  it('takes the whole field from the phone keyboard', () => {
    const f = new ProfileForm('KC');
    expect(f.replace('KC1JMH and more')).toBe(true);
    expect(f.nickname).toBe('KC1JMH and m');
    expect(f.replace('KC1JMH and m')).toBe(false);
    expect(f.replace('Brád')).toBe(true);
    expect(f.nickname).toBe('Brd');
    f.cursor = 2;
    expect(f.replace('x')).toBe(false);
  });

  it('shows the buttons of whichever was pressed last', () => {
    expect(profileHint('nickname', false)).toBe('Type  Enter Next  Esc Back');
    expect(profileHint('nickname', true)).toBe('Up Down Letter  Y Erase  A Next');
    expect(profileHint('save', true)).toBe('A Save  B Back');
  });

  it("puts the server's answers in arcade terse words", () => {
    expect(saveError('nickname taken')).toBe('Name taken');
    expect(saveError('offline')).toBe('Offline');
    expect(saveError('something new')).toBe('Not saved');
  });
});
