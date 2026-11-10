import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, volumeGain } from '../src/game/settings.ts';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
}

describe('settings', () => {
  it('halves the gain per level down, and 0 is silent', () => {
    expect([0, 1, 2, 3, 4, 5].map(volumeGain)).toEqual([0, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1]);
  });

  it('saves and loads', () => {
    const s = memory();
    const saved = { music: 2, effects: 0, flashing: 'full', shake: false } as const;
    saveSettings(s, saved);
    expect(loadSettings(s)).toEqual(saved);
  });

  it('falls back to the defaults for missing, broken or out-of-range values', () => {
    const s = memory();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    s.setItem('pattern-break.settings', '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem('pattern-break.settings', JSON.stringify({ music: 9, effects: 2.5, flashing: 'none', shake: 1 }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem('pattern-break.settings', JSON.stringify({ music: 1 }));
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, music: 1 });
  });

  it('reduces flashing and shakes by default', () => {
    expect(DEFAULT_SETTINGS.flashing).toBe('reduced');
    expect(DEFAULT_SETTINGS.shake).toBe(true);
  });

  it('ignores storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });
});
