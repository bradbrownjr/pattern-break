// How strong a flash is and how often one may start: the crash flash, the nuke's flash and
// the hangar's strobe (docs/PLAN.md, "Accessibility"). The Flashing setting is Reduced by
// default. Reduced keeps every flash at a quarter of full white or less and lets one start
// at most every FLASH_GAP_MS, so there are never more than three in any one second: by
// WCAG 2.2's definition, content with no more than three general flashes and no more than
// three red flashes in any one-second period is below the general flash and red flash
// thresholds (https://www.w3.org/TR/WCAG22/#dfn-general-flash-and-red-flash-thresholds).
// Full is stronger and has no gap.

export type Flashing = 'reduced' | 'full';

/** The strongest a flash may be, as the opacity of the white (or red) over the picture. */
export const FLASH_PEAK: Readonly<Record<Flashing, number>> = { reduced: 0.25, full: 0.6 };
/** With reduced flashing, the least time from one flash's start to the next one's. */
export const FLASH_GAP_MS = 334;
export const FLASH_MS = 220;

/** A flash's opacity `elapsedMs` after it started: a linear fade from `peak`. */
export function flashAlpha(elapsedMs: number, peak: number): number {
  if (elapsedMs < 0 || elapsedMs >= FLASH_MS) return 0;
  return peak * (1 - elapsedMs / FLASH_MS);
}

/**
 * Decides which flashes are shown, shared by every flash in play. Times are in ms on one
 * clock (song time); a time before the last flash means the song started over.
 */
export class FlashGate {
  flashing: Flashing = 'reduced';
  #last = -Infinity;

  get peak(): number {
    return FLASH_PEAK[this.flashing];
  }

  /** Whether a flash starting at `atMs` may be shown; if so, it counts as the last one. */
  admit(atMs: number): boolean {
    if (atMs === this.#last) return true; // the same flash asked for again
    if (this.flashing === 'reduced' && atMs >= this.#last && atMs - this.#last < FLASH_GAP_MS) return false;
    this.#last = atMs;
    return true;
  }

  reset(): void {
    this.#last = -Infinity;
  }
}
