import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/levelgen/generate.ts';
import { Difficulty, type DifficultyName, type Level } from '../src/levelgen/types.ts';
import { autopilotInputs } from '../src/sim/autopilot.ts';
import {
  InputBit,
  SHIP_DIAGONAL_SPEED_Q8,
  SHIP_MAX_X,
  SHIP_MIN_X,
  SHIP_SPEED_Q8,
  SHIP_START_X,
  SHIP_START_Y,
} from '../src/sim/constants.ts';
import {
  createSimState,
  resetSimState,
  runInputLog,
  serializeSimState,
  shipCollides,
  tick,
} from '../src/sim/sim.ts';
import { lcg, randomSong, syntheticLevelData } from './level-fixtures.ts';

const Q = 256;

/** A hand-made level: bars at world x 0, 10, 20, ...; scroll[t] = scrollPx * 256 for every t. */
function handLevel(
  difficulty: DifficultyName,
  bars: Array<[ceiling: number, floor: number, ceilingPeak?: number, floorPeak?: number]>,
  scrollPx = 0,
  tickCount = 100,
): Level {
  const n = bars.length;
  return {
    genVersion: 0,
    difficulty,
    totalSamples: tickCount * 400,
    barCount: n,
    barStartSample: Uint32Array.from(bars, (_, i) => i * 400),
    ceiling: Uint8Array.from(bars, (b) => b[0]),
    floor: Uint8Array.from(bars, (b) => b[1]),
    ceilingPeak: Uint8Array.from(bars, (b) => b[2] ?? b[0]),
    floorPeak: Uint8Array.from(bars, (b) => b[3] ?? b[1]),
    tickCount,
    scroll: new Int32Array(tickCount + 1).fill(scrollPx * Q),
  };
}

describe('ship movement', () => {
  const open = handLevel('easy', []);

  it('moves 1.5 px per tick straight and 272/256 px per axis diagonally', () => {
    const s = createSimState();
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q]);
    tick(open, s, InputBit.up);
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q - SHIP_SPEED_Q8]);
    tick(open, s, InputBit.right | InputBit.down);
    expect([s.shipX, s.shipY]).toEqual([
      SHIP_START_X * Q + SHIP_DIAGONAL_SPEED_Q8,
      SHIP_START_Y * Q - SHIP_SPEED_Q8 + SHIP_DIAGONAL_SPEED_Q8,
    ]);
    expect(SHIP_SPEED_Q8).toBe(384);
  });

  it('cancels opposite directions and ignores the other buttons', () => {
    const s = createSimState();
    tick(open, s, InputBit.up | InputBit.down | InputBit.left | InputBit.right | InputBit.fire | InputBit.bomb | InputBit.buy);
    expect([s.shipX, s.shipY]).toEqual([SHIP_START_X * Q, SHIP_START_Y * Q]);
    expect(s.tick).toBe(1);
  });

  it('keeps the ship on screen and inside its horizontal band', () => {
    const s = createSimState();
    for (let i = 0; i < 99; i++) tick(open, s, InputBit.up | InputBit.left);
    expect([s.shipX, s.shipY]).toEqual([SHIP_MIN_X * Q, 3 * Q]);
    resetSimState(s);
    for (let i = 0; i < 99; i++) tick(open, s, InputBit.down | InputBit.right);
    expect([s.shipX, s.shipY]).toEqual([SHIP_MAX_X * Q, 213 * Q]);
  });
});

describe('collision', () => {
  // One bar at world x 0..8 with 3 ceiling segments (lit y 0..6, 7..13, 14..20) and 2 floor
  // segments (lit y 210..216 and 203..209). Scroll 0, so screen x = world x.
  const level = handLevel('easy', [[3, 2]]);

  it('hits lit segments and misses the 1 px gaps and the bar edges', () => {
    // Hitbox is [x - 5, x + 5) x [y - 3, y + 3).
    const x = 4 * Q;
    expect(shipCollides(level, 0, x, 23 * Q)).toBe(false); // top at 20 px: just below segment 2
    expect(shipCollides(level, 0, x, 23 * Q - 1)).toBe(true);
    expect(shipCollides(level, 0, x, 200 * Q)).toBe(false); // bottom at 203 px: just above
    expect(shipCollides(level, 0, x, 200 * Q + 1)).toBe(true);
    // Horizontal: the bar is solid for x in [0, 8); hitbox left edge at 8 px misses.
    expect(shipCollides(level, 0, 13 * Q, 10 * Q)).toBe(false);
    expect(shipCollides(level, 0, 13 * Q - 1, 10 * Q)).toBe(true);
    // Left of the bar: the hitbox right edge at 0 px misses.
    expect(shipCollides(level, 0, -5 * Q, 10 * Q)).toBe(false);
  });

  it('a 1 px segment gap is open but too thin for the hitbox', () => {
    // A box that only touched the gap between segments 0 and 1 (y 6..7) would miss, but the
    // hitbox is 6 px tall, so any position near it overlaps a lit segment.
    for (let y = 3 * Q; y <= 20 * Q; y += 64) expect(shipCollides(level, 0, 4 * Q, y)).toBe(true);
  });

  it('uses the scroll table for world x', () => {
    const scrolled = handLevel('easy', [[3, 2]], -100);
    // World x = scroll + screen x, so the bar is at screen x 100..108.
    expect(shipCollides(scrolled, 0, 104 * Q, 10 * Q)).toBe(true);
    expect(shipCollides(scrolled, 0, 4 * Q, 10 * Q)).toBe(false);
  });

  it('peak dots are not solid on any difficulty', () => {
    // Ceiling level 1, peak 5: the dot would be segment 4, lit y 28..34.
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const l = handLevel(d, [[1, 0, 5, 0]]);
      expect(shipCollides(l, 0, 4 * Q, 31 * Q), d).toBe(false);
      expect(shipCollides(l, 0, 4 * Q, 17 * Q), d).toBe(false);
      // The level itself is still solid.
      expect(shipCollides(l, 0, 4 * Q, 6 * Q), d).toBe(true);
      expect(Difficulty[d].solidPeaks).toBe(false);
    }
  });
});

describe('tick', () => {
  it('records death and then stops', () => {
    // Scroll 0; the bar at world 60..68 is under the ship's start x (64); full floor.
    const bars: Array<[number, number]> = Array.from({ length: 7 }, (_, i) => (i === 6 ? [0, 12] : [0, 0]));
    const level = handLevel('easy', bars);
    const s = createSimState();
    let ticks = 0;
    while (!s.dead && ticks < 100) {
      tick(level, s, InputBit.down);
      ticks++;
    }
    expect(s.dead).toBe(true);
    // The floor's top segment starts at y 133, so the hitbox (bottom y + 3) hits once
    // y > 130. From y 108 at 1.5 px per tick that is tick 15 (y 130.5).
    expect(s.deathTick).toBe(15);
    const before = serializeSimState(s);
    tick(level, s, InputBit.up);
    expect(serializeSimState(s)).toEqual(before);
  });

  it('finishes at the end of the song', () => {
    const level = handLevel('easy', [], 0, 50);
    const s = runInputLog(level, new Uint8Array(80));
    expect(s.finished).toBe(true);
    expect(s.tick).toBe(50);
    expect(s.dead).toBe(false);
  });

  it('runInputLog uses the given state in place', () => {
    const level = handLevel('easy', [], 0, 50);
    const s = createSimState();
    expect(runInputLog(level, Uint8Array.from([InputBit.up, InputBit.up]), s)).toBe(s);
    expect(s.tick).toBe(2);
    expect(s.shipY).toBe(SHIP_START_Y * Q - 2 * SHIP_SPEED_Q8);
  });
});

describe('autopilot', () => {
  it.each(Object.keys(Difficulty) as DifficultyName[])('survives random loud songs (%s)', (d) => {
    for (let seed = 1; seed <= 10; seed++) {
      const level = generateLevel(syntheticLevelData(randomSong(lcg(seed * 31), 250, 8), d), d);
      const s = runInputLog(level, autopilotInputs(level));
      expect(s.dead, `seed ${seed} died at tick ${s.deathTick}`).toBe(false);
      expect(s.finished).toBe(true);
    }
  });
});
