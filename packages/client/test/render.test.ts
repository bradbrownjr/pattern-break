// Node tests for the renderer's pure parts: the font, terrain geometry, the flash's fade,
// colours, and the jukebox list's fit. The flash caps are in flashing.test.ts.

import { BAR_LIT_WIDTH, BAR_PITCH, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, Q8, SAMPLES_PER_TICK } from '@game/core';
import { describe, expect, it } from 'vitest';
import { JUKEBOX_LIMITS, JUKEBOX_VISIBLE_ROWS, jukeboxRow, jukeboxRowY, jukeboxTop } from '../src/game/screens.ts';
import { SONGS } from '../src/game/songs.ts';
import { FLASH_MS, flashAlpha } from '../src/render/flash.ts';
import { ATLAS_HEIGHT, ATLAS_WIDTH, FIRST_CHAR, LAST_CHAR, buildAtlasPixels, glyphIndex, glyphRows, textWidth } from '../src/render/font.ts';
import { BACKGROUND, LED_DIM, LED_LIT, mix } from '../src/render/palette.ts';
import { seededRandom } from '../src/render/random.ts';
import { shipPixels } from '../src/render/ship.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENTS_PER_SIDE,
  SEGMENT_HIDDEN,
  SEGMENT_LIT,
  SEGMENT_PEAK,
  ceilingSegmentY,
  floorSegmentY,
  scrollPxAt,
  segmentColorIndex,
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

  it('lists exactly the bars with a lit pixel on screen', () => {
    for (let scroll = -70; scroll < 2000; scroll += 3) {
      const { first, end } = visibleBars(level, scroll);
      expect(end - first).toBeLessThanOrEqual(MAX_VISIBLE_BARS);
      for (let i = 0; i < level.barCount; i++) {
        const x = i * BAR_PITCH - scroll;
        const onScreen = x + BAR_LIT_WIDTH > 0 && x < PLAYFIELD_WIDTH;
        expect(i >= first && i < end).toBe(onScreen);
      }
    }
  });

  it('marks lit segments and the peak dot, and hides unlit segments', () => {
    expect(segmentState(3, 3, 0)).toBe(SEGMENT_LIT);
    expect(segmentState(3, 3, 2)).toBe(SEGMENT_LIT);
    expect(segmentState(3, 3, 3)).toBe(SEGMENT_HIDDEN);
    expect(segmentState(3, 7, 6)).toBe(SEGMENT_PEAK);
    expect(segmentState(3, 7, 5)).toBe(SEGMENT_HIDDEN);
    expect(segmentState(0, 1, 0)).toBe(SEGMENT_PEAK);
  });

  it('colours segments green at the edge to red 12 in, and red beyond', () => {
    expect(segmentColorIndex(0)).toBe(0);
    expect(segmentColorIndex(11)).toBe(11);
    expect(segmentColorIndex(SEGMENTS_PER_SIDE - 1)).toBe(11);
    // Hard's 50 px minimum gap allows 23 segments between the two sides.
    expect(SEGMENTS_PER_SIDE).toBe(23);
  });

  it('mirrors floor segments onto ceiling segments', () => {
    expect(ceilingSegmentY(0)).toBe(0);
    expect(ceilingSegmentY(2)).toBe(14);
    expect(floorSegmentY(0)).toBe(PLAYFIELD_HEIGHT - 6);
    for (let k = 0; k < 12; k++) expect(floorSegmentY(k) + 6).toBe(PLAYFIELD_HEIGHT - ceilingSegmentY(k));
  });
});

describe('cosmetics', () => {
  it('fades a flash from its peak to nothing', () => {
    let max = 0;
    for (let ms = -10; ms < 1000; ms++) max = Math.max(max, flashAlpha(ms, 0.25));
    expect(max).toBe(0.25);
    expect(flashAlpha(-1, 0.25)).toBe(0);
    expect(flashAlpha(FLASH_MS, 0.25)).toBe(0);
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

describe('jukebox list', () => {
  it('ends above the spectrum with as many rows as it shows at once', () => {
    const rows = JUKEBOX_VISIBLE_ROWS;
    expect(jukeboxRowY(rows - 1, rows) + JUKEBOX_LIMITS.textHeight).toBeLessThan(JUKEBOX_LIMITS.spectrumTop);
    expect(jukeboxRow(rows)).toBe(10);
    // Short lists keep the 11 px rows.
    expect(jukeboxRow(10)).toBe(11);
  });

  it('scrolls as little as it can to keep the cursor in view', () => {
    const rows = SONGS.length + 3; // the songs, Import, Import folder and Back
    expect(jukeboxTop(0, 5, rows)).toBe(0);
    expect(jukeboxTop(0, rows - 1, rows)).toBe(rows - JUKEBOX_VISIBLE_ROWS);
    expect(jukeboxTop(rows - JUKEBOX_VISIBLE_ROWS, 0, rows)).toBe(0);
    expect(jukeboxTop(2, 4, rows)).toBe(2);
    // A list that fits never scrolls.
    expect(jukeboxTop(3, 5, 8)).toBe(0);
  });
});
