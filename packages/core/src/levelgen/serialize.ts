// A deterministic byte form of Level, for golden hashes. Little-endian, no padding:
// magic 'PBLV', u32 format version, u32 genVersion, u8 difficulty id, u32 totalSamples,
// u32 barCount, barCount x u32 barStartSample, barCount x u8 each of ceiling, floor,
// ceilingPeak, floorPeak, u32 tickCount, (tickCount + 1) x i32 scroll, then the enemies:
// u32 count, count x (u8 kind, u8 instrument, u32 spawnTick, i32 x, i32 y, u8 side,
// u8 motion), (count + 1) x u32 fireStart, u32 fire tick count, that many u32 fireTick,
// then 257 x u32 noteStart, u32 note count, that many u32 noteTick.

import { Difficulty, type Level } from './types.ts';

export const LEVEL_FORMAT_VERSION = 3;

export function serializeLevel(level: Level): Uint8Array {
  const n = level.barCount;
  const e = level.enemies;
  const size =
    4 + 4 + 4 + 1 + 4 + 4 + n * 4 + n * 4 + 4 + level.scroll.length * 4 +
    4 + e.count * 16 + (e.count + 1) * 4 + 4 + e.fireTick.length * 4 +
    level.noteStart.length * 4 + 4 + level.noteTick.length * 4;
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
  for (let i = 0; i < n; i++) u32(level.barStartSample[i]!);
  for (const a of [level.ceiling, level.floor, level.ceilingPeak, level.floorPeak]) {
    for (let i = 0; i < n; i++) u8(a[i]!);
  }
  u32(level.tickCount);
  const i32 = (v: number): void => {
    view.setInt32(p, v, true);
    p += 4;
  };
  for (let t = 0; t < level.scroll.length; t++) i32(level.scroll[t]!);
  u32(e.count);
  for (let k = 0; k < e.count; k++) {
    u8(e.kind[k]!);
    u8(e.instrument[k]!);
    u32(e.spawnTick[k]!);
    i32(e.x[k]!);
    i32(e.y[k]!);
    u8(e.side[k]!);
    u8(e.motion[k]!);
  }
  for (let k = 0; k <= e.count; k++) u32(e.fireStart[k]!);
  u32(e.fireTick.length);
  for (let k = 0; k < e.fireTick.length; k++) u32(e.fireTick[k]!);
  for (let k = 0; k < level.noteStart.length; k++) u32(level.noteStart[k]!);
  u32(level.noteTick.length);
  for (let k = 0; k < level.noteTick.length; k++) u32(level.noteTick[k]!);
  return out;
}
