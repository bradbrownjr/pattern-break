import { InputBit, SAMPLES_PER_TICK, createSimState, runInputLog, serializeSimState } from '@game/core';
import { describe, expect, it } from 'vitest';
import { DisplayClock, InputLog, catchUp, targetTick } from '../src/game/loop.ts';
import { makeLevel } from './make-level.ts';

// 60 bars, open except a wall of floor segments from bar 30 on that reaches the centre line.
const level = makeLevel({
  ceiling: Array.from({ length: 60 }, () => 2),
  floor: Array.from({ length: 60 }, (_, i) => (i >= 30 ? 12 : 2)),
});

describe('targetTick', () => {
  it('is floor(samples / 400)', () => {
    expect(targetTick(0, 100)).toBe(0);
    expect(targetTick(399, 100)).toBe(0);
    expect(targetTick(400, 100)).toBe(1);
    expect(targetTick(12_345, 100)).toBe(30);
  });

  it('is 0 before the song starts and tickCount after it ends', () => {
    expect(targetTick(-1200, 100)).toBe(0);
    expect(targetTick(Number.NaN, 100)).toBe(0);
    expect(targetTick(1_000_000, 100)).toBe(100);
  });
});

describe('catchUp', () => {
  it('runs every tick up to the target in order, one input each, and records them', () => {
    const state = createSimState();
    const log = new InputLog(level.tickCount);
    const asked: number[] = [];
    const ran = catchUp(level, state, 7, (t) => {
      asked.push(t);
      return InputBit.down;
    }, log);
    expect(ran).toBe(7);
    expect(state.tick).toBe(7);
    expect(asked).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(log.toArray()).toEqual(new Uint16Array(7).fill(InputBit.down));
    // A later frame continues from where the last one stopped.
    expect(catchUp(level, state, 10, () => 0, log)).toBe(3);
    expect(log.length).toBe(10);
    expect(catchUp(level, state, 10, () => 0, log)).toBe(0);
  });

  it('gives the same state as runInputLog over the same inputs, however the frames split it', () => {
    const inputs = new Uint16Array(level.tickCount);
    for (let t = 0; t < inputs.length; t++) inputs[t] = Math.floor(t / 40) % 2 === 0 ? InputBit.down : InputBit.up;
    const expected = serializeSimState(runInputLog(level, inputs));

    const state = createSimState();
    const log = new InputLog(level.tickCount);
    // Uneven frames, as a real clock gives: 1 to 5 ticks each.
    let target = 0;
    for (let f = 0; !state.dead && !state.finished; f++) {
      target = Math.min(level.tickCount, target + 1 + (f % 5));
      catchUp(level, state, target, (t) => inputs[t]!, log);
    }
    expect(serializeSimState(state)).toEqual(expected);
    expect(log.toArray()).toEqual(inputs.slice(0, state.tick));
  });

  it('stops at a crash and does not ask for more input', () => {
    const state = createSimState();
    // Straight down from the start hits the floor wall's level-2 segments soon.
    catchUp(level, state, level.tickCount, () => InputBit.down, null);
    expect(state.dead).toBe(true);
    expect(state.tick).toBe(state.deathTick);
    let asked = 0;
    expect(catchUp(level, state, level.tickCount, () => ++asked, null)).toBe(0);
    expect(asked).toBe(0);
  });
});

describe('InputLog', () => {
  it('ignores input past its capacity', () => {
    const log = new InputLog(2);
    log.push(1);
    log.push(2);
    log.push(3);
    expect(log.toArray()).toEqual(Uint16Array.from([1, 2]));
    log.reset();
    expect(log.length).toBe(0);
  });
});

describe('DisplayClock', () => {
  it('starts at the clock reading', () => {
    const clock = new DisplayClock();
    expect(clock.update(0, 4000, 10)).toBe(4000);
  });

  it('predicts from frame time when the clock stands still for a frame', () => {
    const clock = new DisplayClock();
    clock.update(0, 48_000, 120);
    // 1000/60 ms later the clock has not moved: the display still advances, by less than a frame.
    const next = clock.update(1000 / 60, 48_000, 120);
    expect(next).toBeGreaterThan(48_000);
    expect(next).toBeLessThanOrEqual(48_000 + 800);
  });

  it('snaps when the clock jumps', () => {
    const clock = new DisplayClock();
    clock.update(0, 0, 0);
    expect(clock.update(16, 96_000, 240)).toBe(96_000);
  });

  it('stays within the lead and lag window around the sim tick', () => {
    const clock = new DisplayClock();
    clock.update(0, 48_000, 120);
    const lead = clock.update(16, 48_000 + 2000, 100);
    expect(lead).toBe((100 + DisplayClock.LEAD_TICKS) * SAMPLES_PER_TICK);
    clock.reset();
    clock.update(0, 0, 0);
    expect(clock.update(16, 0, 50)).toBe((50 - DisplayClock.LAG_TICKS) * SAMPLES_PER_TICK);
  });
});
