// Seeded randomness for cosmetics only (stars, explosion particles). Capture mode seeds it
// from the `seed` parameter, so a screenshot is the same on every run. Nothing here may
// feed back into sim state.

/** mulberry32: a small 32-bit generator. Returns a function giving floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
