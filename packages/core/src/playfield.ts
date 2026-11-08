// Playfield geometry and timing shared by the level generator, the simulation and the
// renderer. Pixel values are whole pixels; the sim works in Q24.8 (value * 256).
// docs/DEVELOPMENT.md, "Level and sim", describes the coordinate conventions.

import { SAMPLE_RATE } from './analysis-constants.ts';
import { TICK_HZ } from './version.ts';

/** Fixed-point scale: positions are stored as px * Q8. */
export const Q8 = 256;

export const PLAYFIELD_WIDTH = 384;
export const PLAYFIELD_HEIGHT = 216;

/** World x distance between consecutive LED bars, one bar per played row. */
export const BAR_PITCH = 10;
/** Lit (and solid) width of a bar, from its left edge; the remaining 2 px are open. */
export const BAR_LIT_WIDTH = 8;

/** Vertical distance between LED segments. */
export const SEGMENT_PITCH = 7;
/** Lit (and solid) height of a segment; the remaining 1 px is open. */
export const SEGMENT_LIT_HEIGHT = 6;

/**
 * Screen x where a bar's left edge sits at the instant its row starts playing. The ship
 * starts here too.
 */
export const PLAYHEAD_X = 64;

/** Song samples per sim tick: 400 at 48 kHz and 120 Hz. */
export const SAMPLES_PER_TICK = SAMPLE_RATE / TICK_HZ;
