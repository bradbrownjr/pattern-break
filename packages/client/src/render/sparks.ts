// Sparks off the LED tips on note hits (docs/PLAN.md, "Visual spec"): when a row with a note
// starting on it reaches the playhead, a few sparks fly off its bar's ceiling and floor tips
// into the passage, white-hot turning to the tip's colour, and fall. Drawn as a function of song time from the
// song's note rows, so a replay or capture shows the same sparks; nothing is kept per frame.

import { BAR_LIT_WIDTH, BAR_PITCH, SAMPLE_RATE, SEGMENT_LIT_HEIGHT, type Level } from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import type { SongLook } from './copper.ts';
import { BACKGROUND, WHITE, mix } from './palette.ts';
import { hash32 } from './random.ts';
import { ceilingSegmentY, floorSegmentY, segmentColorIndex } from './terrain-layout.ts';

export const SPARK_MS = 360;
export const SPARKS_PER_TIP = 5;
/** Sprites in the pool; the newest sparks are drawn first, so a busy song loses the oldest. */
export const SPARK_SLOTS = 96;
const GRAVITY = 320;
/** Speed, px/s, and spread either side of straight out from the wall, radians. */
const SPEED_MIN = 45;
const SPEED_MAX = 115;
const SPREAD = 1.1;

export class TipSparks {
  readonly container = new Container();
  #sparks: Sprite[] = [];
  #level: Level | null = null;
  #look: SongLook | null = null;

  constructor() {
    for (let i = 0; i < SPARK_SLOTS; i++) {
      const s = new Sprite(Texture.WHITE);
      s.visible = false;
      this.#sparks.push(s);
      this.container.addChild(s);
    }
  }

  setSong(level: Level | null, look: SongLook | null): void {
    this.#level = level;
    this.#look = look;
    if (!level || !look) for (const s of this.#sparks) s.visible = false;
  }

  /**
   * Draws the sparks at song sample `samples`, with the screen's left edge at world x
   * `scrollPx` and the walls lit in `lit` (TerrainView.lit).
   */
  draw(samples: number, scrollPx: number, lit: readonly number[]): void {
    const level = this.#level;
    const look = this.#look;
    if (!level || !look) return;
    const rows = look.noteRows;
    const offset = Math.round(scrollPx);
    // The latest note row started by now.
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (level.barStartSample[rows[mid]!]! <= samples) lo = mid + 1;
      else hi = mid;
    }
    let used = 0;
    for (let j = lo - 1; j >= 0 && used < SPARK_SLOTS; j--) {
      const bar = rows[j]!;
      const ms = ((samples - level.barStartSample[bar]!) * 1000) / SAMPLE_RATE;
      if (ms >= SPARK_MS) break;
      const x = bar * BAR_PITCH - offset + BAR_LIT_WIDTH / 2;
      const c = level.ceiling[bar]!;
      const f = level.floor[bar]!;
      if (c > 0) used = this.#tip(used, bar, 0, x, ceilingSegmentY(c - 1) + SEGMENT_LIT_HEIGHT, 1, lit[segmentColorIndex(c - 1)]!, ms);
      if (f > 0) used = this.#tip(used, bar, 1, x, floorSegmentY(f - 1), -1, lit[segmentColorIndex(f - 1)]!, ms);
    }
    for (let i = used; i < SPARK_SLOTS; i++) this.#sparks[i]!.visible = false;
  }

  /** Places one tip's sparks `ms` after its note, from slot `used`; returns the next free slot. */
  #tip(used: number, bar: number, side: number, x: number, y: number, dir: number, color: number, ms: number): number {
    const t = ms / 1000;
    for (let k = 0; k < SPARKS_PER_TIP && used < SPARK_SLOTS; k++) {
      const h = hash32(bar, side * SPARKS_PER_TIP + k);
      const life = SPARK_MS * (0.55 + ((h & 0xff) / 255) * 0.45);
      if (ms >= life) continue;
      const angle = (((h >>> 8) & 0xff) / 255 - 0.5) * 2 * SPREAD;
      const speed = SPEED_MIN + (((h >>> 16) & 0xff) / 255) * (SPEED_MAX - SPEED_MIN);
      const s = this.#sparks[used++]!;
      s.visible = true;
      s.x = Math.round(x + Math.sin(angle) * speed * t);
      s.y = Math.round(y + dir * Math.cos(angle) * speed * t + 0.5 * GRAVITY * t * t);
      // White-hot at first, then the tip's colour, fading out.
      const age = ms / life;
      const hot = age < 0.3 ? mix(color, WHITE, Math.round(256 * (1 - age / 0.3))) : color;
      s.tint = mix(BACKGROUND, hot, Math.round(256 * Math.min(1, (1 - age) * 1.6)));
      s.width = h >>> 31 ? 2 : 1;
    }
    return used;
  }
}
