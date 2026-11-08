// Timing of the screen flash on death. "Reduce flashing" (docs/PLAN.md, "Visual spec") is
// on by default and M1 has no settings screen, so the flash is always the reduced one: one
// short pulse at no more than a quarter of full white.

export const FLASH_MAX_ALPHA = 0.25;
export const FLASH_MS = 220;

/** The flash's opacity `elapsedMs` after it started: a linear fade from FLASH_MAX_ALPHA. */
export function flashAlpha(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= FLASH_MS) return 0;
  return FLASH_MAX_ALPHA * (1 - elapsedMs / FLASH_MS);
}
