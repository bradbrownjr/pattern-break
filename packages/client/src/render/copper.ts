// Copper bars (docs/PLAN.md, "Visual spec"): horizontal bands of colour behind the
// starfield, after the Amiga's copper effects. SongLook also carries the rows with notes,
// for the sparks (sparks.ts). They sway up and down with song time, glow
// brighter with the song's bass, and pulse on each downbeat. The Flashing setting bounds
// how far their brightness swings (copperAlpha).

import { HOP_FRAMES, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, SAMPLE_RATE, type LevelData } from '@game/core';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import type { Flashing } from './flash.ts';
import { AMBER, CYAN, LIME, MAGENTA, VIOLET } from './palette.ts';

/**
 * The spectrum bands that make the bass: 0 to 3 of 16 log-spaced bands from 40 Hz to
 * 16 kHz (`BAND_COUNT`, `BAND_LOW_HZ`, `BAND_HIGH_HZ`), so 40 Hz to about 179 Hz.
 */
const BASS_BANDS = 4;
/**
 * A downbeat is a pattern row that is a multiple of this: OpenMPT's default rows per
 * measure (`DEFAULT_ROWS_PER_MEASURE` in soundlib/Snd_defs.h), four beats of four rows.
 */
export const ROWS_PER_MEASURE = 16;
/** How long a downbeat's pulse takes to fade. */
export const DOWNBEAT_MS = 250;

/** What the copper bars need from a song: its bass per analysis frame, and its downbeats. */
export interface SongLook {
  /** The loudest bass band's LED level, 0..ledLevels, per analysis frame. */
  bass: Uint8Array;
  ledLevels: number;
  /** Song samples at which each downbeat's row starts, in order. */
  downbeats: Uint32Array;
  /** The rows (and so the bars) with a note starting on them, in order. */
  noteRows: Uint32Array;
}

export function songLook(data: LevelData): SongLook {
  const { frameCount, spectrumLeft, spectrumRight } = data.frames;
  const bands = data.params.bandCount;
  const bass = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let m = 0;
    for (let b = 0; b < BASS_BANDS; b++) m = Math.max(m, spectrumLeft[f * bands + b]!, spectrumRight[f * bands + b]!);
    bass[f] = m;
  }
  const { row, timeSamples } = data.rows;
  const beats: number[] = [];
  for (let i = 0; i < row.length; i++) if (row[i]! % ROWS_PER_MEASURE === 0) beats.push(timeSamples[i]!);
  // Notes are in row order; each goes to the row that starts at its time.
  const notes = data.notes.timeSamples;
  const noteRows: number[] = [];
  let r = 0;
  for (let n = 0; n < notes.length; n++) {
    while (r + 1 < timeSamples.length && timeSamples[r + 1]! <= notes[n]!) r++;
    if (noteRows[noteRows.length - 1] !== r) noteRows.push(r);
  }
  return { bass, ledLevels: data.params.ledLevels, downbeats: Uint32Array.from(beats), noteRows: Uint32Array.from(noteRows) };
}

/**
 * The bass at song sample `samples`, 0 to 1: the latest analysis frame taken by then
 * (frame f is taken after (f + 1) * HOP_FRAMES samples).
 */
export function bassAt(look: SongLook, samples: number): number {
  const f = Math.min(look.bass.length - 1, Math.floor(samples / HOP_FRAMES) - 1);
  return f < 0 ? 0 : look.bass[f]! / look.ledLevels;
}

/** Ms since the latest downbeat at or before `samples`, or -1 before the first. */
export function sinceDownbeatMs(look: SongLook, samples: number): number {
  const d = look.downbeats;
  let lo = 0;
  let hi = d.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (d[mid]! <= samples) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? -1 : ((samples - d[lo - 1]!) * 1000) / SAMPLE_RATE;
}

/**
 * The bars' opacity, from COPPER_BASE up by COPPER_SWING[flashing] at the most. With
 * Flashing Reduced the brightest bar (lime) goes from relative luminance 0.016 at 0.12 to
 * 0.096 at 0.36 over the background: under the 10% change that WCAG 2.2 counts as a flash
 * (definition "general flash and red flash thresholds"), so the bars never flash. The bars
 * use no red, which WCAG counts separately.
 */
export const COPPER_BASE = 0.12;
export const COPPER_SWING: Readonly<Record<Flashing, number>> = { reduced: 0.24, full: 0.48 };

/** The bars' opacity for `bass` (0 to 1) and `beatMs` since a downbeat (-1 for none). */
export function copperAlpha(flashing: Flashing, bass: number, beatMs: number): number {
  const pulse = beatMs >= 0 && beatMs < DOWNBEAT_MS ? 1 - beatMs / DOWNBEAT_MS : 0;
  const drive = Math.min(1, Math.max(0, 0.7 * bass + 0.5 * pulse));
  return COPPER_BASE + COPPER_SWING[flashing] * drive;
}

const BAR_COLORS = [VIOLET, CYAN, LIME, AMBER, MAGENTA];
/** A bar's brightness, row by row: stepped up to full and back, as copper bars are. */
const BAR_PROFILE = [0.3, 0.5, 0.68, 0.82, 0.92, 1, 1, 1, 1, 0.92, 0.82, 0.68, 0.5, 0.3];
export const BAR_HEIGHT = BAR_PROFILE.length;
/** Bar centres are this far apart; the sway moves them all, the ripple each a little. */
export const BAR_SPACING = 36;
const SWAY_PX = 20;
const SWAY_MS = 5300;
/** At most half the gap between bars, so they never overlap. */
const RIPPLE_PX = 8;
const RIPPLE_MS = 2100;

/** Each bar's top, in px, at song time `ms`. */
export function barTop(k: number, ms: number): number {
  const sway = SWAY_PX * Math.sin((2 * Math.PI * ms) / SWAY_MS);
  const ripple = RIPPLE_PX * Math.sin((2 * Math.PI * ms) / RIPPLE_MS + k * 1.3);
  const centre = PLAYFIELD_HEIGHT / 2 + (k - (BAR_COLORS.length - 1) / 2) * BAR_SPACING;
  return Math.round(centre + sway + ripple - BAR_HEIGHT / 2);
}

let barTexture: Texture | null = null;

function getBarTexture(): Texture {
  if (!barTexture) {
    const pixels = new Uint8Array(BAR_HEIGHT * 4);
    BAR_PROFILE.forEach((v, y) => {
      const g = Math.round(v * 255);
      pixels.set([g, g, g, 255], y * 4);
    });
    barTexture = new Texture({
      source: new BufferImageSource({ resource: pixels, width: 1, height: BAR_HEIGHT, scaleMode: 'nearest', label: 'copper-bar' }),
    });
  }
  return barTexture;
}

export class CopperBars {
  readonly container = new Container();
  flashing: Flashing = 'reduced';
  #bars: Sprite[] = [];
  #look: SongLook | null = null;

  constructor() {
    for (const color of BAR_COLORS) {
      const bar = new Sprite(getBarTexture());
      bar.width = PLAYFIELD_WIDTH;
      bar.height = BAR_HEIGHT;
      bar.tint = color;
      this.#bars.push(bar);
      this.container.addChild(bar);
    }
    this.container.visible = false;
  }

  /** The song the bars follow; null hides them (the menus). */
  setSong(look: SongLook | null): void {
    this.#look = look;
    this.container.visible = look !== null;
  }

  /** Draws the bars at song sample `samples`. */
  draw(samples: number): void {
    const look = this.#look;
    if (!look) return;
    const ms = (samples * 1000) / SAMPLE_RATE;
    const alpha = copperAlpha(this.flashing, bassAt(look, samples), sinceDownbeatMs(look, samples));
    for (let k = 0; k < this.#bars.length; k++) {
      const bar = this.#bars[k]!;
      bar.y = barTop(k, ms);
      bar.alpha = alpha;
    }
  }
}
