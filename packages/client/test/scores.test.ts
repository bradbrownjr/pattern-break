import { describe, expect, it } from 'vitest';
import { PLAYER_COLOURS } from '../src/render/palette.ts';
import { ScoresMenu, entryText, playerColour } from '../src/game/scores.ts';
import type { BoardView } from '../src/game/net.ts';

const BOARDS = [
  { name: 'arcade', label: 'Arcade' },
  { name: 'a'.repeat(64), label: 'Neon Techno' },
];

const VIEW: BoardView = {
  top: [
    { rank: 1, nickname: 'KC1', score: 900, levels: 8, finished: true, mark: 7 },
    { rank: 2, nickname: 'AMY', score: 500, levels: 3, finished: false, mark: 0xffffffff },
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

  it('moves between the board and the difficulty only, and Enter changes the row', () => {
    const m = new ScoresMenu(BOARDS, ['easy', 'normal'], 'normal');
    m.setState({ kind: 'board', view: VIEW });
    expect(m.row).toBe('board');
    m.apply('down');
    expect(m.row).toBe('difficulty');
    m.apply('down');
    expect(m.row).toBe('board');
    expect(m.apply('confirm')).toEqual({ type: 'changed' });
    expect(m.choice.label).toBe('Neon Techno');
    expect(m.apply('back')).toEqual({ type: 'back' });
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
