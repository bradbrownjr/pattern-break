// Sparks off the LED tips (render/sparks.ts): from the tips of a bar whose row has a note,
// once that row starts, for SPARK_MS; none from a bar with no lit tip.

import { BAR_LIT_WIDTH, BAR_PITCH, SAMPLE_RATE, SEGMENT_LIT_HEIGHT } from '@game/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { SongLook } from '../src/render/copper.ts';
import { LED_LIT } from '../src/render/palette.ts';
import { SPARKS_PER_TIP, SPARK_MS, TipSparks } from '../src/render/sparks.ts';
import { ceilingSegmentY, floorSegmentY } from '../src/render/terrain-layout.ts';
import { makeLevel } from './make-level.ts';

const ROW = 4800;

function setUp(ceiling: number[], floor: number[], noteRows: number[]): TipSparks {
  const level = makeLevel({ ceiling, floor, rowSamples: ROW });
  const look: SongLook = { bass: new Uint8Array(1), ledLevels: 12, downbeats: new Uint32Array(0), noteRows: Uint32Array.from(noteRows) };
  const sparks = new TipSparks();
  sparks.setSong(level, look);
  return sparks;
}

const shown = (s: TipSparks): Sprite[] => (s.container.children as Sprite[]).filter((c) => c.visible);
const at = (ms: number): number => (ms * SAMPLE_RATE) / 1000;

describe('tip sparks', () => {
  it('fly from both tips of a note row from its start until SPARK_MS', () => {
    const sparks = setUp([3, 4, 5, 2], [2, 6, 3, 4], [2]);
    sparks.draw(2 * ROW - 1, 0, LED_LIT);
    expect(shown(sparks)).toHaveLength(0);
    sparks.draw(2 * ROW, 0, LED_LIT);
    const first = shown(sparks);
    expect(first).toHaveLength(2 * SPARKS_PER_TIP);
    const x = 2 * BAR_PITCH + BAR_LIT_WIDTH / 2;
    // Bar 2: 5 ceiling segments, 3 floor segments.
    expect(new Set(first.map((s) => s.y))).toEqual(new Set([ceilingSegmentY(4) + SEGMENT_LIT_HEIGHT, floorSegmentY(2)]));
    for (const s of first) expect(s.x).toBe(x);
    sparks.draw(2 * ROW + at(SPARK_MS), 0, LED_LIT);
    expect(shown(sparks)).toHaveLength(0);
  });

  it('starts on the tips and moves into the passage', () => {
    const sparks = setUp([5], [5], [0]);
    sparks.draw(0, 0, LED_LIT);
    const ceilingTip = ceilingSegmentY(4);
    const floorTip = floorSegmentY(4);
    const y0 = shown(sparks).map((s) => s.y);
    expect(y0.every((y) => y > ceilingTip && y <= floorTip)).toBe(true);
    sparks.draw(at(60), 0, LED_LIT);
    const later = shown(sparks).map((s) => s.y);
    expect(later.every((y) => y > ceilingTip + 1 && y < floorTip)).toBe(true);
  });

  it('flies from no tip where a side is unlit, and follows the scroll', () => {
    const sparks = setUp([0, 3], [4, 0], [0, 1]);
    sparks.draw(0, 0, LED_LIT);
    expect(shown(sparks)).toHaveLength(SPARKS_PER_TIP);
    sparks.draw(ROW, 7, LED_LIT);
    const xs = shown(sparks).map((s) => s.x);
    expect(xs).toContain(BAR_PITCH + BAR_LIT_WIDTH / 2 - 7);
  });
});
