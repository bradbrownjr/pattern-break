// Screen shake: the playfield (the starfield, the cave and everything in it, not the HUD)
// jumps by whole pixels for a moment when the ship crashes. The Shake setting turns it off.
// A function of the time since the crash and a seed, so a replay or a capture shakes the
// same way.

/** How long a shake lasts and how far it moves the picture at first, in px. */
export const SHAKE_MS = 300;
export const SHAKE_PX = 3;
/** The picture moves to a new offset this often. */
const SHAKE_STEP_MS = 30;

/** A small integer hash: the same `seed` and `step` always give the same bits. */
function hash(seed: number, step: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * The playfield's offset `elapsedMs` after a crash, in whole px, written to `out`: a new
 * random offset every SHAKE_STEP_MS, shrinking to nothing at SHAKE_MS. Zero when `on` is
 * false or outside the shake.
 */
export function shakeOffset(on: boolean, elapsedMs: number, seed: number, out: { x: number; y: number }): void {
  out.x = 0;
  out.y = 0;
  if (!on || !(elapsedMs >= 0) || elapsedMs >= SHAKE_MS) return;
  const reach = Math.ceil(SHAKE_PX * (1 - elapsedMs / SHAKE_MS));
  const h = hash(seed, Math.floor(elapsedMs / SHAKE_STEP_MS));
  const span = reach * 2 + 1;
  out.x = (h % span) - reach;
  out.y = ((h >>> 16) % span) - reach;
}
