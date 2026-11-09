// The LED terrain: a ceiling and a floor bar per row of the song, drawn as segmented LED
// meters (docs/DEVELOPMENT.md, "Level and sim"). Every sprite is made once; draw() only
// moves and recolours them.

import { Difficulty, SEGMENT_LIT_HEIGHT, Terrain, type Level } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { LED_LIT, LED_PEAK, ROCK } from './palette.ts';
import {
  MAX_VISIBLE_BARS,
  SEGMENTS_PER_SIDE,
  SEGMENT_HIDDEN,
  SEGMENT_LIT,
  SEGMENT_ROCK,
  barLitWidth,
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

  set width(w: number) {
    for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
      this.ceiling[k]!.width = w;
      this.floor[k]!.width = w;
    }
  }
}

function segment(parent: Container, y: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.height = SEGMENT_LIT_HEIGHT;
  s.y = y;
  parent.addChild(s);
  return s;
}

/** The colour of segment k in `state`; meter colours count from the top of the rock. */
function colorFor(state: number, k: number): number {
  if (state === SEGMENT_ROCK) return ROCK[k]!;
  if (state === SEGMENT_LIT) return LED_LIT[k - Terrain.rockSegments]!;
  return LED_PEAK;
}

/** Shows segment `s` at x in `state`, or hides it. */
function place(s: Sprite, x: number, state: number, k: number): void {
  if (state === SEGMENT_HIDDEN) {
    s.visible = false;
    return;
  }
  s.visible = true;
  s.x = x;
  s.tint = colorFor(state, k);
}

export class TerrainView {
  readonly container = new Container();
  #columns: BarColumn[] = [];
  #level: Level | null = null;
  #showPeaks = false;
  #range: BarRange = { first: 0, end: 0 };

  constructor() {
    for (let i = 0; i < MAX_VISIBLE_BARS; i++) this.#columns.push(new BarColumn(this.container));
    for (const c of this.#columns) c.visible = false;
  }

  setLevel(level: Level | null): void {
    this.#level = level;
    // Peak dots are drawn only where they are solid: a dot the ship could fly through
    // would look like terrain.
    this.#showPeaks = level !== null && Difficulty[level.difficulty].solidPeaks;
    if (!level) for (const c of this.#columns) c.visible = false;
    else for (const c of this.#columns) c.width = barLitWidth(level);
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
      const x = i * level.barPitch - offset;
      const c = level.ceiling[i]!;
      const f = level.floor[i]!;
      // A peak equal to the level draws no dot.
      const cp = this.#showPeaks ? level.ceilingPeak[i]! : c;
      const fp = this.#showPeaks ? level.floorPeak[i]! : f;
      for (let k = 0; k < SEGMENTS_PER_SIDE; k++) {
        place(column.ceiling[k]!, x, segmentState(c, cp, k), k);
        place(column.floor[k]!, x, segmentState(f, fp, k), k);
      }
    }
    for (; n < this.#columns.length; n++) this.#columns[n]!.visible = false;
  }
}
