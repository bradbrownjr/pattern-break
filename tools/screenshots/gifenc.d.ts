// Types for the parts of gifenc 1.0.3 (MIT, pure JavaScript) that gif.ts uses. The package
// ships no types of its own.

declare module 'gifenc' {
  export type Palette = number[][];
  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface WriteFrameOptions {
    palette?: Palette;
    /** Frame delay in milliseconds; GIF stores hundredths of a second. */
    delay?: number;
    /** -1 plays once, 0 loops forever, n > 0 loops n times. First frame only. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): Encoder;
  export function quantize(rgba: Uint8Array, maxColors: number, options?: { format?: PaletteFormat }): Palette;
  export function applyPalette(rgba: Uint8Array, palette: Palette, format?: PaletteFormat): Uint8Array;

  const gifenc: {
    GIFEncoder: typeof GIFEncoder;
    quantize: typeof quantize;
    applyPalette: typeof applyPalette;
  };
  export default gifenc;
}
