// Level: what generateLevel() builds from LevelData for one difficulty. The renderer
// draws it and the sim collides with it. docs/DEVELOPMENT.md, "Level and sim", has the
// coordinate conventions.

/** Per-difficulty level generation settings. */
export const Difficulty = {
  easy: { id: 0, minGapPx: 96, solidPeaks: false },
  normal: { id: 1, minGapPx: 72, solidPeaks: false },
  hard: { id: 2, minGapPx: 56, solidPeaks: true },
} as const;
export type DifficultyName = keyof typeof Difficulty;

/** Bars a peak stays at its level before it starts to fall one segment per bar. */
export const PEAK_HOLD_BARS = 6;

export interface Level {
  genVersion: number;
  difficulty: DifficultyName;
  /** Song length in samples (LevelData totalSamples). */
  totalSamples: number;
  /** One bar per played row. */
  barCount: number;
  /**
   * barStartSample[i] is row i's start (LevelData rows.timeSamples). Bar i lasts until
   * barStartSample[i + 1], and the last bar until totalSamples.
   */
  barStartSample: Uint32Array;
  /** Lit ceiling segments per bar, 0..12, hanging from y = 0. Fairness-clamped. */
  ceiling: Uint8Array;
  /** Lit floor segments per bar, 0..12, rising from y = 216. Fairness-clamped. */
  floor: Uint8Array;
  /**
   * Peak-hold level per bar, 0..12. When it is above the bar's level, segment
   * (peak - 1) shows a peak dot; solid on hard only. Never below the bar's level.
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
