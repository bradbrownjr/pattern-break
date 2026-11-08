import { describe, expect, it } from 'vitest';
import { MENU_SOUNDS, midiToHz } from '../src/audio/sfx.ts';

describe('menu sounds', () => {
  it('converts MIDI notes to Hz with A4 = 440', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
    expect(midiToHz(60)).toBeCloseTo(261.626, 3);
  });

  it('keeps every sound short and in a chip-like range', () => {
    for (const [name, notes] of Object.entries(MENU_SOUNDS)) {
      const ms = notes.reduce((sum, [, length]) => sum + length, 0);
      expect(ms, name).toBeLessThanOrEqual(500);
      for (const [note] of notes) expect(note, name).toBeGreaterThanOrEqual(48);
    }
  });
});
