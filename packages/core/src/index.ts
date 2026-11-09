export { GEN_VERSION, SIM_VERSION, TICK_HZ, ANALYSIS_SAMPLE_RATE } from './version.ts';
export * from './analysis-constants.ts';
export { encodeUtf8, decodeUtf8 } from './utf8.ts';
export { fftInPlace } from './spectrum/fft.ts';
export { SpectrumAnalyzer, ledLevel, quantizeVu } from './spectrum/analyzer.ts';
export { LEVEL_DATA_FORMAT_VERSION } from './level-data/types.ts';
export type {
  LevelData,
  LevelDataFrames,
  LevelDataMeta,
  LevelDataNotes,
  LevelDataParams,
  LevelDataRows,
} from './level-data/types.ts';
export { serializeLevelData, deserializeLevelData } from './level-data/serialize.ts';
export * from './playfield.ts';
export { Difficulty, EnemyKind, EnemyTuning, PEAK_HOLD_BARS, ShipMotion, Terrain } from './levelgen/types.ts';
export type { DifficultyName, EnemyList, Level } from './levelgen/types.ts';
export { ENEMY_GRACE_TICKS, emptyEnemyList, placeEnemies, withoutEnemies } from './levelgen/enemies.ts';
export {
  generateLevel,
  findDrums,
  gapShiftLimitPx,
  maxCombinedSegments,
  playheadAtSample,
  MIN_GAP_OVERLAP_PX,
} from './levelgen/generate.ts';
export { barPathViolation, findPathViolation, solidWalls } from './levelgen/path-check.ts';
export { serializeLevel, LEVEL_FORMAT_VERSION } from './levelgen/serialize.ts';
export * from './sim/constants.ts';
export {
  BULLET_SLOTS,
  EnemyStatus,
  boxHitsTerrain,
  createSimState,
  resetSimState,
  runInputLog,
  serializeSimState,
  shipCollides,
  tick,
} from './sim/sim.ts';
export type { SimState } from './sim/sim.ts';
export { autopilotInputs } from './sim/autopilot.ts';
