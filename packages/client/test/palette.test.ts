// The colour-blind LED colours (render/palette.ts, LED_CIVIDIS): every segment brighter than
// the one before it, edge to tip, so the walls' depth reads from brightness alone, which
// every kind of colour vision sees. The neon green to red doesn't: its greens are brighter
// than its reds.

import { describe, expect, it } from 'vitest';
import { BACKGROUND, LED_CIVIDIS, LED_LIT } from '../src/render/palette.ts';

/** WCAG 2.2 relative luminance of a 0xRRGGBB colour. */
function luminance(c: number): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
}

describe('LED colours', () => {
  it('brighten edge to tip on Colour-blind, and stand clear of the background', () => {
    expect(LED_CIVIDIS).toHaveLength(LED_LIT.length);
    for (let k = 1; k < LED_CIVIDIS.length; k++) expect(luminance(LED_CIVIDIS[k]!)).toBeGreaterThan(luminance(LED_CIVIDIS[k - 1]!));
    // WCAG contrast ratio of the edge segment against the background.
    const ratio = (luminance(LED_CIVIDIS[0]!) + 0.05) / (luminance(BACKGROUND) + 0.05);
    expect(ratio).toBeGreaterThan(1.5);
  });

  it('do not on Neon, which is why the setting exists', () => {
    expect(luminance(LED_LIT[LED_LIT.length - 1]!)).toBeLessThan(luminance(LED_LIT[0]!));
  });
});
