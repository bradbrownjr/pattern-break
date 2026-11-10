import { describe, expect, it } from 'vitest';
import { PadBit } from '../src/game/gamepad.ts';
import { TitleMenu } from '../src/game/menu.ts';
import { CodeListener, KONAMI_CODE, keyToken, padToken } from '../src/game/secrets.ts';

describe('the Konami code', () => {
  it('completes on up, up, down, down, left, right, left, right, B, A', () => {
    const c = new CodeListener();
    const results = KONAMI_CODE.map((t) => c.push(t));
    expect(results).toEqual([...Array<boolean>(9).fill(false), true]);
    // And again from the start.
    expect(KONAMI_CODE.map((t) => c.push(t)).at(-1)).toBe(true);
  });

  it('survives an extra up at the start, and starts over on a wrong press or another key', () => {
    const c = new CodeListener();
    expect(['up', ...KONAMI_CODE].map((t) => c.push(t as never)).at(-1)).toBe(true);
    for (const t of KONAMI_CODE.slice(0, 5)) c.push(t);
    c.push(null);
    expect(KONAMI_CODE.slice(5).map((t) => c.push(t)).some(Boolean)).toBe(false);
  });

  it('reads the arrows and B and A keys, and a pad', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA', 'KeyW'].map(keyToken)).toEqual([
      'up',
      'down',
      'left',
      'right',
      'b',
      'a',
      null,
    ]);
    expect([PadBit.up, PadBit.b, PadBit.a, PadBit.start].map(padToken)).toEqual(['up', 'b', 'a', null]);
  });
});

describe('Impossible', () => {
  /** A menu with the cursor on Difficulty, at `from`. */
  const menu = (from: 'easy' | 'normal' = 'normal'): TitleMenu => {
    const m = new TitleMenu(3, 0, from);
    m.cursor = 2;
    return m;
  };

  it('shows after the third pass through easy, normal and hard, then stays a choice', () => {
    const m = menu();
    const seen: string[] = [];
    for (let k = 0; k < 10; k++) {
      m.apply('right');
      seen.push(m.difficulty);
    }
    // From normal: hard is not a full pass; then three passes, and Impossible.
    expect(seen).toEqual(['hard', 'easy', 'normal', 'hard', 'easy', 'normal', 'hard', 'easy', 'normal', 'hard']);
    expect(m.impossibleFound).toBe(false);
    expect(m.apply('right')).toBe('impossible');
    expect([m.difficulty, m.impossibleFound]).toEqual(['impossible', true]);
    expect(m.apply('right')).toBe('changed');
    expect(m.difficulty).toBe('easy');
    m.apply('left');
    expect(m.difficulty).toBe('impossible');
  });

  it('confirm steps forward too, and a step back starts the count again', () => {
    const m = menu('easy');
    // Two passes by confirm, then a step back from easy to hard.
    for (let k = 0; k < 6; k++) m.apply('confirm');
    expect(m.difficulty).toBe('easy');
    m.apply('left');
    // Two more passes: four in all, but only two since the step back.
    for (let k = 0; k < 6; k++) m.apply('right');
    expect(m.difficulty).toBe('hard');
    expect(m.apply('right')).toBe('changed');
    expect(m.difficulty).toBe('easy');
    for (let k = 0; k < 2; k++) m.apply('right');
    expect(m.apply('right')).toBe('impossible');
  });
});
