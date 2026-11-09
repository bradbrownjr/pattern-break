// A deterministic byte form of Level, for golden hashes. Little-endian, no padding:
// magic 'PBLV', u32 format version, u32 genVersion, u8 difficulty id, u32 totalSamples,
// u32 barCount, u8 barPitch, barCount x u32 barStartSample, barCount x u8 each of ceiling, floor,
// ceilingPeak, floorPeak, u32 tickCount, (tickCount + 1) x i32 scroll.

import { Difficulty, type Level } from './types.ts';

export const LEVEL_FORMAT_VERSION = 2;

export function serializeLevel(level: Level): Uint8Array {
  const n = level.barCount;
  const size = 4 + 4 + 4 + 1 + 4 + 4 + 1 + n * 4 + n * 4 + 4 + level.scroll.length * 4;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let p = 0;
  const u8 = (v: number): void => {
    view.setUint8(p, v);
    p += 1;
  };
  const u32 = (v: number): void => {
    view.setUint32(p, v, true);
    p += 4;
  };
  for (const b of [0x50, 0x42, 0x4c, 0x56]) u8(b);
  u32(LEVEL_FORMAT_VERSION);
  u32(level.genVersion);
  u8(Difficulty[level.difficulty].id);
  u32(level.totalSamples);
  u32(n);
  u8(level.barPitch);
  for (let i = 0; i < n; i++) u32(level.barStartSample[i]!);
  for (const a of [level.ceiling, level.floor, level.ceilingPeak, level.floorPeak]) {
    for (let i = 0; i < n; i++) u8(a[i]!);
  }
  u32(level.tickCount);
  for (let t = 0; t < level.scroll.length; t++) {
    view.setInt32(p, level.scroll[t]!, true);
    p += 4;
  }
  return out;
}
