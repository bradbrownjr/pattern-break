// Level: what generateLevel() builds from LevelData for one difficulty. The renderer
// draws it and the sim collides with it. docs/DEVELOPMENT.md, "Level and sim", has the
// coordinate conventions.

/**
 * Per-difficulty settings (2026-11-09). Difficulty sets the song's speed and how tight the
 * cave is; the beat and the winding are the same on every difficulty.
 * - `tempoPermille`: the song plays at this tempo, in thousandths (libopenmpt's tempo
 *   factor, which keeps the pitch). Analysis renders at the same tempo, so each difficulty
 *   has its own LevelData.
 * - `baseGapPx`: the gap with no hits. `minGapPx`: the gap never closes below this.
 * - `solidPeaks` makes peak dots solid and visible; it is off on every difficulty
 *   (2026-11-08). Peaks are still computed, so a display option or solid peaks on hard can
 *   return (docs/ROADMAP.md, "Open decisions").
 */
export const Difficulty = {
  easy: { id: 0, tempoPermille: 900, baseGapPx: 104, minGapPx: 52, solidPeaks: false },
  normal: { id: 1, tempoPermille: 1000, baseGapPx: 90, minGapPx: 44, solidPeaks: false },
  hard: { id: 2, tempoPermille: 1150, baseGapPx: 76, minGapPx: 36, solidPeaks: false },
} as const;
export type DifficultyName = keyof typeof Difficulty;

/**
 * How the walls follow the music (docs/PLAN.md, "Level generation"):
 * - **Hits:** a row's hit strength is the sum, over the song's channels, of how far each
 *   channel's volume meter jumps in the row. Every `hitPerSegment` of it squeezes the cave
 *   by one segment (7 px) from the base gap, up to the minimum gap. The squeeze falls back
 *   by at most `releaseSegments` per bar.
 * - **Winding:** the gap's centre follows the melody: the highest note started in the row
 *   by an instrument that is not a drum, held until the next one. Each semitone above
 *   `pivotNote` raises the centre `pxPerSemitone` px. A drum is an instrument whose three
 *   commonest pitches make up at least `drumPitchPercent` of its notes.
 * - Each side keeps at least `minSideSegments`, so the walls never vanish.
 */
export const Terrain = {
  hitPerSegment: 64,
  releaseSegments: 6,
  pivotNote: 72,
  pxPerSemitone: 3,
  drumPitchPercent: 95,
  minSideSegments: 2,
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
  /**
   * barStartSample[i] is row i's start (LevelData rows.timeSamples). Bar i lasts until
   * barStartSample[i + 1], and the last bar until totalSamples.
   */
  barStartSample: Uint32Array;
  /** Lit ceiling segments per bar, hanging from y = 0. Fairness-clamped. */
  ceiling: Uint8Array;
  /** Lit floor segments per bar, rising from y = 216. Fairness-clamped. */
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
