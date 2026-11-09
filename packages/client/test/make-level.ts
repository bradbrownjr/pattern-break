// A hand-made Level for client tests, built by the rules in docs/DEVELOPMENT.md, "Level and
// sim", so tests don't need libopenmpt.

import {
  PLAYHEAD_X,
  Q8,
  SAMPLES_PER_TICK,
  emptyEnemyList,
  noNotes,
  playheadAtSample,
  type DifficultyName,
  type EnemyList,
  type Level,
} from '@game/core';

export interface LevelSpec {
  /** Lit ceiling and floor segments per bar; peaks default to the levels. */
  ceiling: number[];
  floor: number[];
  ceilingPeak?: number[];
  floorPeak?: number[];
  /** Samples per row. Default 4800 (0.1 s). */
  rowSamples?: number;
  difficulty?: DifficultyName;
  /** Default none. */
  enemies?: EnemyList;
}

export function makeLevel(spec: LevelSpec): Level {
  const barCount = spec.ceiling.length;
  const rowSamples = spec.rowSamples ?? 4800;
  const barStartSample = new Uint32Array(barCount);
  for (let i = 0; i < barCount; i++) barStartSample[i] = i * rowSamples;
  const totalSamples = barCount * rowSamples;
  const tickCount = Math.ceil(totalSamples / SAMPLES_PER_TICK);
  const scroll = new Int32Array(tickCount + 1);
  for (let t = 0; t <= tickCount; t++) {
    scroll[t] = playheadAtSample(barStartSample, totalSamples, t * SAMPLES_PER_TICK) - PLAYHEAD_X * Q8;
  }
  return {
    genVersion: 0,
    difficulty: spec.difficulty ?? 'normal',
    totalSamples,
    barCount,
    barStartSample,
    ceiling: Uint8Array.from(spec.ceiling),
    floor: Uint8Array.from(spec.floor),
    ceilingPeak: Uint8Array.from(spec.ceilingPeak ?? spec.ceiling),
    floorPeak: Uint8Array.from(spec.floorPeak ?? spec.floor),
    tickCount,
    scroll,
    enemies: spec.enemies ?? emptyEnemyList(),
    ...noNotes(),
  };
}
