import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../src/audio/effects.ts';
import { COCKPIT_AT, ColourFlood, FLOOD_ROWS, HANGAR_CUES, HOLD_AT, PLAY_AT, introTime } from '../src/game/hangar.ts';

describe('hangar intro', () => {
  it('plays its sounds in time order, all before Play starts the run', () => {
    const times = HANGAR_CUES.map((c) => c.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(Math.max(...times)).toBeLessThan(PLAY_AT);
    for (const c of HANGAR_CUES) {
      expect(EFFECTS[c.effect]).toBeDefined();
      expect(Math.abs(c.pan)).toBeLessThanOrEqual(1);
    }
  });

  it('holds over Play until the level is loaded, then stops at Play', () => {
    expect(COCKPIT_AT).toBeLessThan(HOLD_AT);
    expect(HOLD_AT).toBeLessThan(PLAY_AT);
    expect(introTime(1000, false)).toBe(1000);
    expect(introTime(60_000, false)).toBe(HOLD_AT);
    expect(introTime(HOLD_AT + 50, true)).toBe(HOLD_AT + 50);
    expect(introTime(60_000, true)).toBe(PLAY_AT);
  });
});

describe('ColourFlood', () => {
  it('adds a step of colour per row from the start of the song, full after FLOOD_ROWS rows', () => {
    const level = { barStartSample: Uint32Array.from({ length: 40 }, (_, i) => i * 1000) };
    expect(ColourFlood.amount(level, 0)).toBe(1 / FLOOD_ROWS);
    expect(ColourFlood.amount(level, 999)).toBe(1 / FLOOD_ROWS);
    expect(ColourFlood.amount(level, 1000)).toBe(2 / FLOOD_ROWS);
    expect(ColourFlood.amount(level, (FLOOD_ROWS - 1) * 1000)).toBe(1);
    expect(ColourFlood.amount(level, 1e9)).toBe(1);
  });

  it('is full colour on a song shorter than the flood', () => {
    const level = { barStartSample: Uint32Array.from([0, 1000, 2000]) };
    expect(ColourFlood.amount(level, 5000)).toBe(3 / FLOOD_ROWS);
  });
});
