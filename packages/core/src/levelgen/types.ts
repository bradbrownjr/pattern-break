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

/**
 * Enemies (docs/PLAN.md, "Enemies"). Each kind comes from one part of the song: drums
 * place turrets on the wall tips, the bass sends tanks along the floor, and every other
 * instrument sends ships. Enemies fire on their own instrument's notes, so every shot lands
 * on the music.
 */
export const EnemyKind = { turret: 0, tank: 1, ship: 2 } as const;
export type EnemyKind = (typeof EnemyKind)[keyof typeof EnemyKind];

/** How a ship moves, from the effect on the note that sent it. */
export const ShipMotion = { straight: 0, weave: 1, climb: 2, dive: 3, hop: 4 } as const;
export type ShipMotion = (typeof ShipMotion)[keyof typeof ShipMotion];

/**
 * Per-difficulty enemy settings. Ticks are 1/120 s; speeds are Q8 px per tick.
 * - `turretSpacingTicks`, `tankSpacingTicks`, `formationSpacingTicks`: the least time
 *   between two turrets, two tanks, or the starts of two ship formations.
 * - `formationSize`: ships in a formation, one per note of the phrase that sends it.
 * - `fireIntervalTicks`: the least time between two shots of one enemy.
 * - `bulletSpeedQ8`, `maxBullets`: enemy bullet speed, and how many can be in flight.
 * - `shipShots`: shots each ship may fire. `shipSpeedQ8`: how fast ships cross the screen.
 */
export const EnemyTuning = {
  easy: {
    turretSpacingTicks: 360,
    tankSpacingTicks: 720,
    formationSpacingTicks: 360,
    formationSize: 2,
    fireIntervalTicks: 120,
    bulletSpeedQ8: 224,
    maxBullets: 4,
    shipShots: 0,
    shipSpeedQ8: 224,
  },
  normal: {
    turretSpacingTicks: 240,
    tankSpacingTicks: 480,
    formationSpacingTicks: 240,
    formationSize: 3,
    fireIntervalTicks: 72,
    bulletSpeedQ8: 288,
    maxBullets: 8,
    shipShots: 1,
    shipSpeedQ8: 288,
  },
  hard: {
    turretSpacingTicks: 168,
    tankSpacingTicks: 336,
    formationSpacingTicks: 168,
    formationSize: 4,
    fireIntervalTicks: 48,
    bulletSpeedQ8: 352,
    maxBullets: 12,
    shipShots: 2,
    shipSpeedQ8: 352,
  },
} as const;

/**
 * The enemies of a level, one entry per enemy in spawn order, as parallel arrays.
 * Positions are Q8. The sim moves them; nothing here depends on how the player flies.
 */
export interface EnemyList {
  count: number;
  kind: Uint8Array;
  /** The instrument that sent it; it fires on that instrument's notes. */
  instrument: Uint8Array;
  /** The tick it appears: a turret as it scrolls in, a tank or ship on its note. */
  spawnTick: Uint32Array;
  /** World x of its centre at spawnTick. */
  x: Int32Array;
  /**
   * Turret: the centre y, fixed. Ship: its height above (negative) or below the cave's
   * centre line, from the note's pitch. Tank: 0; it rides the floor.
   */
  y: Int32Array;
  /** Turret: 0 on the floor, 1 on the ceiling. Others: 0. */
  side: Uint8Array;
  /** Ship: a ShipMotion. Others: 0. */
  motion: Uint8Array;
  /** Enemy i fires at the ticks fireTick[fireStart[i]] to fireTick[fireStart[i + 1] - 1]. */
  fireStart: Uint32Array;
  fireTick: Uint32Array;
}

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
  enemies: EnemyList;
  /**
   * Each instrument's note ticks, for the on-beat bonus: instrument i's notes are at
   * noteTick[noteStart[i]] to noteTick[noteStart[i + 1] - 1], in order. noteStart has 257
   * entries.
   */
  noteStart: Uint32Array;
  noteTick: Uint32Array;
}
