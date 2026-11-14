// The results (game/results.ts): the breakdown's parts (that they add up to the sim's score
// over real runs is checked in analysis/test/golden.test.ts), and a personal
// best is kept per song and difficulty, survives being read back (a reload), and is never
// set by a run with a cheat.

import { createSimState } from '@game/core';
import { describe, expect, it } from 'vitest';
import { RESULT_WIDTH, bestKey, loadBest, recordBest, replayHint, resultRows, scoreBreakdown } from '../src/game/results.ts';

function memory(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
}

describe('score breakdown', () => {
  it('splits kills, the beat bonus and the lives bonus', () => {
    const state = createSimState();
    state.enemyPoints = Uint16Array.of(200, 400, 0, 1200);
    state.enemyOnBeat = Uint8Array.of(0, 1, 0, 1);
    state.kills = 4;
    state.survivalBonus = 3000;
    state.score = 4800;
    expect(scoreBreakdown(state)).toEqual({ kills: 4, killPoints: 1000, beatBonus: 800, livesBonus: 3000, score: 4800 });
  });

  it('lines the numbers up at the right', () => {
    const rows = resultRows({ kills: 12, killPoints: 2400, beatBonus: 600, livesBonus: 0, score: 3000 }, { previous: 5000, isNew: false });
    expect(rows).toEqual(['Kills 12        2400', 'Beat bonus       600', 'Score           3000', 'Best            5000']);
    for (const r of rows) expect(r.length).toBe(RESULT_WIDTH);
  });
});

describe('personal best', () => {
  it('keeps the best per song and difficulty, read back as after a reload', () => {
    const s = memory();
    const key = bestKey('crush', 'hard');
    expect(recordBest(s, key, 5000, false)).toEqual({ previous: null, isNew: true });
    expect(recordBest(s, key, 4000, false)).toEqual({ previous: 5000, isNew: false });
    expect(recordBest(s, key, 7000, false)).toEqual({ previous: 5000, isNew: true });
    expect(loadBest(s, key)).toBe(7000);
    expect(loadBest(s, bestKey('crush', 'normal'))).toBeNull();
  });

  it('never takes a best from a run with a cheat, or a score of 0', () => {
    const s = memory();
    const key = bestKey('crush', 'hard');
    expect(recordBest(s, key, 9000, true).isNew).toBe(false);
    expect(recordBest(s, key, 0, false).isNew).toBe(false);
    expect(loadBest(s, key)).toBeNull();
  });

  it('ignores broken or blocked storage', () => {
    const s = memory();
    s.setItem('pattern-break.bests', '{nope');
    expect(loadBest(s, 'a:b')).toBeNull();
    s.setItem('pattern-break.bests', JSON.stringify({ 'a:b': 'x', 'c:d': 50 }));
    expect(loadBest(s, 'a:b')).toBeNull();
    expect(loadBest(s, 'c:d')).toBe(50);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(recordBest(blocked, 'a:b', 10, false)).toEqual({ previous: null, isNew: true });
  });
});

describe('replay hint', () => {
  it("names the keys, or a gamepad's buttons", () => {
    expect(replayHint(false)).toBe('R Replay  S Save');
    expect(replayHint(true)).toBe('Y Replay  X Save');
  });
});
