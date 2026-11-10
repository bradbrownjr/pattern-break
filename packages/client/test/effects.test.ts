import { duration, peak, renderMix } from '@game/chipfx';
import { describe, expect, it } from 'vitest';
import { EFFECTS, effectLayers, isPitched, type Effect } from '../src/audio/effects.ts';

const NAMES = Object.keys(EFFECTS) as Effect[];
const RATE = 48_000;

describe('effects', () => {
  it('each renders without clipping, and the short ones stay short', () => {
    for (const name of NAMES) {
      const samples = renderMix(effectLayers(name), RATE);
      const seconds = Math.max(...effectLayers(name).map(duration));
      expect(samples.length, name).toBe(Math.ceil(seconds * RATE));
      expect(peak(samples), name).toBeGreaterThan(0.05);
      expect(peak(samples), name).toBeLessThan(1);
      // Only the booms, and the hangar intro's tape hiss, canopy and siren, last longer than half a second.
      if (!['bomb', 'missileBlast', 'nuke', 'lifeLost', 'hiss', 'canopy', 'siren'].includes(name)) {
        expect(seconds, name).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('gives noise variants different samples', () => {
    for (const name of NAMES) {
      if ((EFFECTS[name].variants ?? 1) < 2) continue;
      expect(renderMix(effectLayers(name, 1)), name).not.toEqual(renderMix(effectLayers(name, 0)));
    }
  });

  it("moves pitched effects with the song's pitch and keeps them in tune", () => {
    for (const name of NAMES.filter(isPitched)) {
      expect(EFFECTS[name].jitter ?? 0, name).toBe(0);
      const c = effectLayers(name, 0, 0)[0]!.freq;
      const g = effectLayers(name, 0, 7)[0]!.freq;
      expect(g / c, name).toBeCloseTo(2 ** (7 / 12), 9);
    }
  });
});
