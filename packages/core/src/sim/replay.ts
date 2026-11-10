// Replays (docs/PLAN.md, "Simulation", "Replay format"): everything needed to run a game
// again and get the same score, which is what the server will check in M5. The song is
// named by the SHA-256 of its file, so the level can be rebuilt from the same bytes.
//
// Binary form, little-endian, no padding: magic 'PBRP', u32 format version, u32
// genVersion, u32 simVersion, 32 bytes moduleHash, u8 difficulty id, u8 cheats (Cheat
// flags; format 2 on), i32 score, u32 tick
// count, u32 run count, then each run of equal input bits as u16 bits and its length in
// ticks as an unsigned LEB128 varint (1 to 5 bytes, at least 1). The runs' lengths add up
// to the tick count. decodeReplay throws on anything else.

import { Difficulty, type DifficultyName } from '../levelgen/types.ts';
import { Cheat } from './constants.ts';

export const REPLAY_FORMAT_VERSION = 2;
const MAGIC = [0x50, 0x42, 0x52, 0x50];
const HEADER_BYTES = 4 + 4 + 4 + 4 + 32 + 1 + 1 + 4 + 4 + 4;

export interface Replay {
  /** SHA-256 of the song file, 64 lowercase hex digits. */
  moduleHash: string;
  difficulty: DifficultyName;
  /** Cheat flags the run had (0 for none); a replay with any is kept off the boards. */
  cheats: number;
  genVersion: number;
  simVersion: number;
  /** The score the recorded run ended with, the lives bonus included. */
  score: number;
  /** The input bits of each tick, from tick 0 until the run ended. */
  inputs: Uint16Array;
}

const HEX = '0123456789abcdef';

function hashBytes(hash: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('replay: moduleHash must be 64 lowercase hex digits');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = HEX.indexOf(hash[2 * i]!) * 16 + HEX.indexOf(hash[2 * i + 1]!);
  return out;
}

function hashHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 15]!;
  return s;
}

function difficultyById(id: number): DifficultyName | null {
  for (const name of Object.keys(Difficulty) as DifficultyName[]) if (Difficulty[name].id === id) return name;
  return null;
}

/** The runs of equal input bits: values and lengths. */
function runs(inputs: Uint16Array): { bits: number[]; lengths: number[] } {
  const bits: number[] = [];
  const lengths: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i]!;
    if (bits.length > 0 && bits[bits.length - 1] === v) lengths[lengths.length - 1]!++;
    else {
      bits.push(v);
      lengths.push(1);
    }
  }
  return { bits, lengths };
}

function varintSize(v: number): number {
  let n = 1;
  while (v >= 128) {
    v = Math.floor(v / 128);
    n++;
  }
  return n;
}

export function encodeReplay(replay: Replay): Uint8Array<ArrayBuffer> {
  const hash = hashBytes(replay.moduleHash);
  const { bits, lengths } = runs(replay.inputs);
  let size = HEADER_BYTES;
  for (let r = 0; r < bits.length; r++) size += 2 + varintSize(lengths[r]!);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let p = 0;
  for (const b of MAGIC) out[p++] = b;
  view.setUint32(p, REPLAY_FORMAT_VERSION, true);
  view.setUint32(p + 4, replay.genVersion, true);
  view.setUint32(p + 8, replay.simVersion, true);
  p += 12;
  out.set(hash, p);
  p += 32;
  out[p++] = Difficulty[replay.difficulty].id;
  out[p++] = replay.cheats;
  view.setInt32(p, replay.score, true);
  view.setUint32(p + 4, replay.inputs.length, true);
  view.setUint32(p + 8, bits.length, true);
  p += 12;
  for (let r = 0; r < bits.length; r++) {
    view.setUint16(p, bits[r]!, true);
    p += 2;
    let v = lengths[r]!;
    while (v >= 128) {
      out[p++] = (v % 128) | 128;
      v = Math.floor(v / 128);
    }
    out[p++] = v;
  }
  return out;
}

export function decodeReplay(bytes: Uint8Array): Replay {
  const fail = (why: string): never => {
    throw new Error(`replay: ${why}`);
  };
  if (bytes.length < HEADER_BYTES) fail('truncated header');
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) fail('not a replay (bad magic)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint32(4, true);
  if (format !== REPLAY_FORMAT_VERSION) fail(`format ${format}, expected ${REPLAY_FORMAT_VERSION}`);
  const genVersion = view.getUint32(8, true);
  const simVersion = view.getUint32(12, true);
  const moduleHash = hashHex(bytes.subarray(16, 48));
  const difficulty = difficultyById(bytes[48]!);
  if (difficulty === null) return fail(`unknown difficulty id ${bytes[48]}`);
  const cheats = bytes[49]!;
  if ((cheats & ~(Cheat.infiniteLives | Cheat.god)) !== 0) fail(`unknown cheat flags ${cheats}`);
  const score = view.getInt32(50, true);
  const tickCount = view.getUint32(54, true);
  const runCount = view.getUint32(58, true);
  if (runCount > tickCount) fail('more runs than ticks');
  const inputs = new Uint16Array(tickCount);
  let p = HEADER_BYTES;
  let t = 0;
  for (let r = 0; r < runCount; r++) {
    if (p + 3 > bytes.length) fail('truncated runs');
    const v = view.getUint16(p, true);
    p += 2;
    let length = 0;
    let scale = 1;
    for (let k = 0; ; k++) {
      if (k === 5 || p >= bytes.length) fail('bad run length');
      const b = bytes[p++]!;
      length += (b & 127) * scale;
      scale *= 128;
      if (b < 128) break;
    }
    if (length === 0 || t + length > tickCount) fail('run lengths do not add up to the tick count');
    inputs.fill(v, t, t + length);
    t += length;
  }
  if (t !== tickCount) fail('run lengths do not add up to the tick count');
  if (p !== bytes.length) fail('trailing bytes');
  return { moduleHash, difficulty, cheats, genVersion, simVersion, score, inputs };
}
