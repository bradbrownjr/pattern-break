// Node tests for the renderer's pure parts: the font, terrain geometry, flash cap, colours.

import { BAR_OPEN_WIDTH, Difficulty, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, Q8, SAMPLES_PER_TICK, Terrain, type DifficultyName } from '@game/core';
import { describe, expect, it } from 'vitest';
import { FLASH_MAX_ALPHA, FLASH_MS, flashAlpha } from '../src/render/flash.ts';
import { ATLAS_HEIGHT, ATLAS_WIDTH, FIRST_CHAR, LAST_CHAR, buildAtlasPixels, glyphIndex, glyphRows, textWidth } from '../src/render/font.ts';
import { BACKGROUND, LED_DIM, LED_LIT, mix } from '../src/render/palette.ts';
import { seededRandom } from '../src/render/random.ts';
import { shipPixels } from '../src/render/ship.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENT_HIDDEN,
  SEGMENT_LIT,
  SEGMENT_PEAK,
  SEGMENT_ROCK,
  ceilingSegmentY,
  floorSegmentY,
  scrollPxAt,
  segmentState,
  visibleBars,
} from '../src/render/terrain-layout.ts';
import { makeLevel } from './make-level.ts';

describe('pixel font', () => {
  it('has a glyph for every printable ASCII character', () => {
    for (let c = FIRST_CHAR; c <= LAST_CHAR; c++) {
      const rows = glyphRows(String.fromCharCode(c));
      expect(rows).toHaveLength(9);
      for (const r of rows) expect(r).toBeLessThan(32);
    }
  });

  it('draws characters it lacks as ?', () => {
    expect(glyphIndex('é'.charCodeAt(0))).toBe(glyphIndex('?'.charCodeAt(0)));
    expect(glyphIndex(10)).toBe(glyphIndex('?'.charCodeAt(0)));
  });

  it('builds an atlas with only white or clear pixels', () => {
    const px = buildAtlasPixels();
    expect(px.length).toBe(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
    for (const v of px) expect(v === 0 || v === 255).toBe(true);
  });

  it('measures text without a trailing gap', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(5);
    expect(textWidth('Pattern Break')).toBe(77);
  });
});

describe('terrain layout', () => {
  const level = makeLevel({ ceiling: Array.from({ length: 200 }, () => 3), floor: Array.from({ length: 200 }, () => 4) });

  it('reads the scroll table on whole ticks and interpolates between them', () => {
    for (const t of [0, 1, 37, 500]) expect(scrollPxAt(level, t * SAMPLES_PER_TICK)).toBe(level.scroll[t]! / Q8);
    const a = level.scroll[100]! / Q8;
    const b = level.scroll[101]! / Q8;
    expect(scrollPxAt(level, 100 * SAMPLES_PER_TICK + 200)).toBeCloseTo((a + b) / 2, 9);
    expect(scrollPxAt(level, -5000)).toBe(level.scroll[0]! / Q8);
    expect(scrollPxAt(level, 1e9)).toBe(level.scroll[level.tickCount]! / Q8);
  });

  it.each(Object.keys(Difficulty) as DifficultyName[])('lists exactly the bars with a lit pixel on screen (%s)', (d) => {
    const lv = makeLevel({ ceiling: Array.from({ length: 200 }, () => 6), floor: Array.from({ length: 200 }, () => 6), difficulty: d });
    const pitch = Difficulty[d].barPitch;
    for (let scroll = -70; scroll < 2000; scroll += 3) {
      const { first, end } = visibleBars(lv, scroll);
      expect(end - first).toBeLessThanOrEqual(MAX_VISIBLE_BARS);
      for (let i = 0; i < lv.barCount; i++) {
        const x = i * pitch - scroll;
        const onScreen = x + pitch - BAR_OPEN_WIDTH > 0 && x < PLAYFIELD_WIDTH;
        expect(i >= first && i < end).toBe(onScreen);
      }
    }
  });

  it('marks rock, lit segments and the peak dot, and hides unlit segments', () => {
    const r = Terrain.rockSegments;
    expect(segmentState(r, r, 0)).toBe(SEGMENT_ROCK);
    expect(segmentState(r, r, r - 1)).toBe(SEGMENT_ROCK);
    expect(segmentState(r + 3, r + 3, r)).toBe(SEGMENT_LIT);
    expect(segmentState(r + 3, r + 3, r + 2)).toBe(SEGMENT_LIT);
    expect(segmentState(r + 3, r + 3, r + 3)).toBe(SEGMENT_HIDDEN);
    expect(segmentState(r + 3, r + 7, r + 6)).toBe(SEGMENT_PEAK);
    expect(segmentState(r + 3, r + 7, r + 5)).toBe(SEGMENT_HIDDEN);
  });

  it('mirrors floor segments onto ceiling segments', () => {
    expect(ceilingSegmentY(0)).toBe(0);
    expect(ceilingSegmentY(2)).toBe(14);
    expect(floorSegmentY(0)).toBe(PLAYFIELD_HEIGHT - 6);
    for (let k = 0; k < 12; k++) expect(floorSegmentY(k) + 6).toBe(PLAYFIELD_HEIGHT - ceilingSegmentY(k));
  });
});

describe('cosmetics', () => {
  it('caps the death flash at a quarter of white and ends it', () => {
    let max = 0;
    for (let ms = -10; ms < 1000; ms++) max = Math.max(max, flashAlpha(ms));
    expect(max).toBe(FLASH_MAX_ALPHA);
    expect(FLASH_MAX_ALPHA).toBeLessThanOrEqual(0.25);
    expect(flashAlpha(FLASH_MS)).toBe(0);
  });

  it('gives the same random sequence for the same seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it('dims unlit segments towards the background', () => {
    expect(mix(BACKGROUND, 0xffffff, 0)).toBe(BACKGROUND);
    expect(mix(0x000000, 0xffffff, 256)).toBe(0xffffff);
    expect(LED_DIM).toHaveLength(LED_LIT.length);
    for (let k = 0; k < LED_LIT.length; k++) expect(LED_DIM[k]).not.toBe(LED_LIT[k]);
  });

  it('draws a 16x8 ship', () => {
    const px = shipPixels();
    expect(px.length).toBe(16 * 8 * 4);
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(40);
  });
});
