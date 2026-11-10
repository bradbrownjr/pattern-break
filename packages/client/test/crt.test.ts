// The CRT setting's overlay (render/crt.ts): scanlines only where a game pixel has room for
// one, the vignette always.

import { describe, expect, it } from 'vitest';
import { SCANLINE_SHARE, overlayBackground } from '../src/render/crt.ts';

describe('CRT overlay', () => {
  it('draws a scanline across the bottom of each game pixel row from 2 device pixels up', () => {
    const css = overlayBackground(3, 3);
    expect(css).toContain('repeating-linear-gradient');
    expect(css).toContain(`${3 * (1 - SCANLINE_SHARE)}px`);
    expect(css).toContain('3px)');
    expect(css).toContain('radial-gradient');
  });

  it('keeps only the vignette at 1 device pixel per game pixel', () => {
    const css = overlayBackground(1, 1);
    expect(css).not.toContain('repeating-linear-gradient');
    expect(css).toContain('radial-gradient');
  });
});
