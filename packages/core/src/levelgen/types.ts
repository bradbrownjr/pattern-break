// Level: what generateLevel() builds from LevelData for one difficulty. The renderer
// draws it and the sim collides with it. docs/DEVELOPMENT.md, "Level and sim", has the
// coordinate conventions.

/**
 * Per-difficulty settings (2026-11-09). Difficulty sets the song's speed and how tight the
 * cave is; the beat and the winding are the same on every difficulty.
 * - `tempoPermille`: the song plays at this tempo, in thousandths (libopenmpt's tempo
 *   factor, which keeps the pitch). Analysis renders at the same tempo, so each difficulty
 *   has its own LevelData.
 * - `baseGapPx`: the gap with no hits. `minGapPx`: the gap never closes below this. Both
 *   grew 14 px, one segment a side, after level 1 played too tight (Brad, 2026-11-10).
 */
export const Difficulty = {
  easy: { id: 0, tempoPermille: 900, baseGapPx: 118, minGapPx: 66 },
  normal: { id: 1, tempoPermille: 1000, baseGapPx: 104, minGapPx: 58 },
  hard: { id: 2, tempoPermille: 1150, baseGapPx: 90, minGapPx: 50 },
  /**
   * The secret difficulty (Brad, 2026-11-10): hard's cave and enemies at the song's own
   * tempo. Its song, Crush, is fast enough as written.
   */
  impossible: { id: 3, tempoPermille: 1000, baseGapPx: 90, minGapPx: 50 },
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
 * - `turretShots`: shots each turret may fire (2026-11-13: until then a turret fired on
 *   every drum note it could, about 3.6 shots each on level 1, most of that level's fire).
 * - `bulletSpeedQ8`, `maxBullets`: enemy bullet speed, and how many can be in flight.
 * - `shipShots`: shots each ship may fire. `shipSpeedQ8`: how fast ships cross the screen.
 */
const HARD_TUNING = {
  turretSpacingTicks: 168,
  tankSpacingTicks: 336,
  formationSpacingTicks: 168,
  formationSize: 4,
  fireIntervalTicks: 48,
  turretShots: 4,
  bulletSpeedQ8: 352,
  maxBullets: 12,
  shipShots: 2,
  shipSpeedQ8: 352,
} as const;

export const EnemyTuning = {
  easy: {
    turretSpacingTicks: 360,
    tankSpacingTicks: 720,
    formationSpacingTicks: 360,
    formationSize: 2,
    fireIntervalTicks: 120,
    turretShots: 1,
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
    turretShots: 3,
    bulletSpeedQ8: 288,
    maxBullets: 8,
    shipShots: 1,
    shipSpeedQ8: 288,
  },
  hard: HARD_TUNING,
  impossible: HARD_TUNING,
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
  /** Ship: the index of its formation, in the order formations start. Others: -1. */
  formation: Int32Array;
  /** Ships in each formation; shooting all of them down drops a power-up capsule. */
  formationSize: Uint8Array;
}

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
