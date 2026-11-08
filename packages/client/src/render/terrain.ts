// The LED terrain: a ceiling and a floor bar per row of the song, drawn as segmented LED
// meters (docs/DEVELOPMENT.md, "Level and sim"). Every sprite is made once; draw() only
// moves and recolours them.

import { BAR_LIT_WIDTH, BAR_PITCH, SEGMENT_LIT_HEIGHT, type Level } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { LED_DIM, LED_LIT, LED_PEAK } from './palette.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENTS_PER_SIDE,
  SEGMENT_LIT,
  SEGMENT_PEAK,
  ceilingSegmentY,
  floorSegmentY,
  segmentState,
  visibleBars,
  type BarRange,
} from './terrain-layout.ts';

class BarColumn {
  readonly ceiling: Sprite[] = [];
  readonly floor: Sprite[] = [];

  constructor(parent: Container) {
    for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
      this.ceiling.push(segment(parent, ceilingSegmentY(k)));
      this.floor.push(segment(parent, floorSegmentY(k)));
    }
  }

  set visible(v: boolean) {
    for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
      this.ceiling[k]!.visible = v;
      this.floor[k]!.visible = v;
    }
  }
}

function segment(parent: Container, y: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.width = BAR_LIT_WIDTH;
  s.height = SEGMENT_LIT_HEIGHT;
  s.y = y;
  parent.addChild(s);
  return s;
}

function colorFor(state: number, k: number): number {
  if (state === SEGMENT_LIT) return LED_LIT[k]!;
  if (state === SEGMENT_PEAK) return LED_PEAK;
  return LED_DIM[k]!;
}

export class TerrainView {
  readonly container = new Container();
  #columns: BarColumn[] = [];
  #level: Level | null = null;
  #range: BarRange = { first: 0, end: 0 };

  constructor() {
    for (let i = 0; i < MAX_VISIBLE_BARS; i++) this.#columns.push(new BarColumn(this.container));
    for (const c of this.#columns) c.visible = false;
  }

  setLevel(level: Level | null): void {
    this.#level = level;
    if (!level) for (const c of this.#columns) c.visible = false;
  }

  /** Draws the bars on screen with the screen's left edge at world x `scrollPx`. */
  draw(scrollPx: number): void {
    const level = this.#level;
    if (!level) return;
    // One rounding for the whole frame, so bars never shift relative to each other.
    const offset = Math.round(scrollPx);
    const { first, end } = visibleBars(level, offset, this.#range);
    let n = 0;
    for (let i = first; i < end && n < this.#columns.length; i++, n++) {
      const column = this.#columns[n]!;
      const x = i * BAR_PITCH - offset;
      const c = level.ceiling[i]!;
      const cp = level.ceilingPeak[i]!;
      const f = level.floor[i]!;
      const fp = level.floorPeak[i]!;
      for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
        const top = column.ceiling[k]!;
        top.visible = true;
        top.x = x;
        top.tint = colorFor(segmentState(c, cp, k), k);
        const bottom = column.floor[k]!;
        bottom.visible = true;
        bottom.x = x;
        bottom.tint = colorFor(segmentState(f, fp, k), k);
      }
    }
    for (; n < this.#columns.length; n++) this.#columns[n]!.visible = false;
  }
}
