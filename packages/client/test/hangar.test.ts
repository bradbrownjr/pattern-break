import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../src/audio/effects.ts';
import { LED_LIT, LED_RED } from '../src/render/palette.ts';
import {
  COCKPIT_AT,
  ColourFlood,
  FLOOD_ROWS,
  HANGAR_CUES,
  HOLD_AT,
  LABEL_CHARS,
  PLAY_AT,
  hangarCues,
  introTime,
  strobeAlpha,
  labelText,
} from '../src/game/hangar.ts';

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

describe('labelText', () => {
  it('keeps a title that fits, and cuts a long one at the last word that fits', () => {
    expect(labelText('FastLane')).toBe('FastLane');
    expect(labelText('Numen in Da Chip')).toBe('Numen in Da');
    expect(labelText('Wrath_of_the_Djinn')).toBe('Wrath_of_the_');
    for (const t of ['Numen in Da Chip', 'Wrath_of_the_Djinn', 'Girl From Mars']) {
      expect(labelText(t).length).toBeLessThanOrEqual(LABEL_CHARS);
    }
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

describe('the alarm (Impossible)', () => {
  it('adds two siren wails before Play, in time order with the rest', () => {
    const cues = hangarCues(true);
    expect(cues.filter((c) => c.effect === 'siren').map((c) => c.at)).toEqual([150, 4150]);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.at).toBeGreaterThanOrEqual(cues[i - 1]!.at);
    expect(cues.length).toBe(HANGAR_CUES.length + 2);
    // A 3 s wail from 4150 ms ends before Play.
    expect(4150 + 3000).toBeLessThan(PLAY_AT);
    expect(hangarCues(false)).toBe(HANGAR_CUES);
  });

  it('strobes red twice a second, at most at the peak it is given', () => {
    const lit: number[] = [];
    for (let ms = 0; ms < 3000; ms++) if (strobeAlpha(ms, 0.6) > 0 && strobeAlpha(ms - 1, 0.6) === 0) lit.push(ms);
    expect(lit).toEqual([0, 160, 1000, 1160, 2000, 2160]);
    expect(Math.max(...Array.from({ length: 1000 }, (_, ms) => strobeAlpha(ms, 0.6)))).toBe(0.6);
  });
});

describe('the red walls (Impossible)', () => {
  it('run from dark at the screen edge to bright red at the tips, red in every step', () => {
    expect(LED_RED.length).toBe(LED_LIT.length);
    for (let k = 0; k < LED_RED.length; k++) {
      const c = LED_RED[k]!;
      const [r, g, b] = [c >> 16, (c >> 8) & 255, c & 255];
      expect(r, `step ${k}`).toBeGreaterThan(2 * Math.max(g, b));
      if (k > 0) expect(r).toBeGreaterThan(LED_RED[k - 1]! >> 16);
    }
  });
});
