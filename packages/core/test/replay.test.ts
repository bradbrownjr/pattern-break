// Replays (sim/replay.ts): the byte form round-trips, runs of equal input are stored once,
// and anything malformed throws.

import { describe, expect, it } from 'vitest';
import { Cheat, InputBit } from '../src/sim/constants.ts';
import { REPLAY_FORMAT_VERSION, decodeReplay, encodeReplay, type Replay } from '../src/sim/replay.ts';

const HASH = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function replay(inputs: number[]): Replay {
  return { moduleHash: HASH, difficulty: 'hard', cheats: Cheat.god, genVersion: 5, simVersion: 9, score: 123456, inputs: Uint16Array.from(inputs) };
}

describe('replay format', () => {
  it('round-trips the header and every tick', () => {
    const inputs = [0, 0, InputBit.fire, InputBit.fire | InputBit.up, InputBit.missile | InputBit.boost, 0];
    const r = replay(inputs);
    const back = decodeReplay(encodeReplay(r));
    expect({ ...back, inputs: Array.from(back.inputs) }).toEqual({ ...r, inputs });
  });

  it('stores a run of equal bits once, its length as a varint', () => {
    // 300 ticks of fire then 1 of nothing: two runs, 300 taking two varint bytes.
    const bytes = encodeReplay(replay([...Array<number>(300).fill(InputBit.fire), 0]));
    expect(bytes.length).toBe(62 + (2 + 2) + (2 + 1));
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(4, true), bytes[49], view.getUint32(54, true), view.getUint32(58, true)]).toEqual([
      REPLAY_FORMAT_VERSION,
      Cheat.god,
      301,
      2,
    ]);
    expect(decodeReplay(bytes).inputs.length).toBe(301);
  });

  it('keeps an empty log', () => {
    expect(decodeReplay(encodeReplay(replay([]))).inputs.length).toBe(0);
  });

  it('rejects a bad hash, magic, version, difficulty, cheat flags, truncation, a short run total and trailing bytes', () => {
    expect(() => encodeReplay({ ...replay([0]), moduleHash: 'ABC' })).toThrow(/moduleHash/);
    const good = encodeReplay(replay([1, 1, 2]));
    const broken = (edit: (b: Uint8Array) => Uint8Array): Uint8Array => edit(good.slice());
    expect(() => decodeReplay(broken((b) => ((b[0] = 0), b)))).toThrow(/magic/);
    expect(() => decodeReplay(broken((b) => ((b[4] = 99), b)))).toThrow(/format/);
    expect(() => decodeReplay(broken((b) => ((b[48] = 7), b)))).toThrow(/difficulty/);
    expect(() => decodeReplay(broken((b) => ((b[49] = 4), b)))).toThrow(/cheat/);
    expect(() => decodeReplay(good.subarray(0, good.length - 1))).toThrow();
    expect(() => decodeReplay(broken((b) => ((b[54] = 4), b)))).toThrow(/add up/);
    const longer = new Uint8Array(good.length + 1);
    longer.set(good);
    expect(() => decodeReplay(longer)).toThrow(/trailing/);
    expect(() => decodeReplay(good.subarray(0, 10))).toThrow(/truncated/);
  });
});
