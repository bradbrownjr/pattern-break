// Level: what generateLevel() builds from LevelData for one difficulty. The renderer
// draws it and the sim collides with it. docs/DEVELOPMENT.md, "Level and sim", has the
// coordinate conventions.

/**
 * Per-difficulty settings. The walls are the same on every difficulty; difficulty sets the
 * scroll speed (2026-11-09). `barPitch` is the world x distance between bars in px, so a
 * bar crosses the screen faster on a harder difficulty and less of the song is in view.
 * Each bar is lit for `barPitch - BAR_OPEN_WIDTH` px. `solidPeaks` makes peak dots solid
 * and visible; it is off on every difficulty (2026-11-08). Peaks are still computed, so a
 * display option or solid peaks on hard can return (docs/ROADMAP.md, "Open decisions").
 */
export const Difficulty = {
  easy: { id: 0, barPitch: 8, solidPeaks: false },
  normal: { id: 1, barPitch: 10, solidPeaks: false },
  hard: { id: 2, barPitch: 13, solidPeaks: false },
} as const;
export type DifficultyName = keyof typeof Difficulty;

/**
 * How the walls are built (docs/PLAN.md, "Level generation"). The floor follows the bass
 * and the ceiling the highs, each read from both stereo channels. Every side has
 * `rockSegments` that are always solid, the cave wall, and a meter of up to
 * `meterSegments` on top of them: `gain * (LED level - threshold)` segments, clamped,
 * falling by at most `decaySegments` per bar so hits slam in and ease back.
 */
export const Terrain = {
  /** The open gap between ceiling and floor never closes below this. */
  minGapPx: 40,
  rockSegments: 5,
  meterSegments: 12,
  decaySegments: 3,
  /** Bands 0 to 4: about 40 to 260 Hz (kick and bass). */
  floor: { firstBand: 0, lastBand: 4, threshold: 7, gain: 3 },
  /** Bands 11 to 15: about 2.5 to 16 kHz (snare snap and hats). */
  ceiling: { firstBand: 11, lastBand: 15, threshold: 5, gain: 3 },
} as const;

/** Bars a peak stays at its level before it starts to fall one segment per bar. */
export const PEAK_HOLD_BARS = 6;

export interface Level {
  genVersion: number;
  difficulty: DifficultyName;
  /** Song length in samples (LevelData totalSamples). */
  totalSamples: number;
  /** One bar per played row. */
  barCount: number;
  /** World x distance between bars, in px: the difficulty's `barPitch`. */
  barPitch: number;
  /**
   * barStartSample[i] is row i's start (LevelData rows.timeSamples). Bar i lasts until
   * barStartSample[i + 1], and the last bar until totalSamples.
   */
  barStartSample: Uint32Array;
  /**
   * Solid ceiling segments per bar, hanging from y = 0: Terrain.rockSegments of rock, then
   * the meter. Fairness-clamped, never below the rock.
   */
  ceiling: Uint8Array;
  /** Solid floor segments per bar, rising from y = 216, as for the ceiling. */
  floor: Uint8Array;
  /**
   * Peak-hold level per bar, in the same segments. When it is above the bar's level, segment
   * (peak - 1) is a peak dot, drawn and solid only where `solidPeaks` is set. Never below
   * the bar's level.
   */
  ceilingPeak: Uint8Array;
  floorPeak: Uint8Array;
  /** Sim ticks in the song: ceil(totalSamples / SAMPLES_PER_TICK). */
  tickCount: number;
  /**
   * scroll[t], for t in 0..tickCount, is the world x of the screen's left edge in Q8 at
   * sim tick t (song sample t * SAMPLES_PER_TICK). See scrollAtSample() for the formula.
   */
  scroll: Int32Array;
}
