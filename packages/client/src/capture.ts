// Capture mode: the screenshot pipeline (tools/screenshots) opens the page with query
// parameters that pin everything time-varying, then waits for the page to say it is done.
// The contract is in docs/DEVELOPMENT.md, "Screenshots".

export interface CaptureParams {
  /** Which screen to show, for example `play`. */
  scene: string;
  /** Song id from the bundled manifest, or null when the scene needs none. */
  song: string | null;
  /** Song clock in seconds. The clock is pinned here; it does not advance. */
  t: number;
  difficulty: string;
  /** Seed for cosmetic randomness (particles, shake). */
  seed: number;
  /** Play scenes: the ship blown up where it is, this many ms ago, or null. */
  boom: number | null;
}

declare global {
  interface Window {
    __pbCaptureReady?: boolean;
  }
}

/** Parses the capture parameters, or returns null when the page is not in capture mode. */
export function readCaptureParams(search: string = window.location.search): CaptureParams | null {
  const q = new URLSearchParams(search);
  if (q.get('capture') !== '1') return null;
  const t = Number(q.get('t') ?? '0');
  const seed = Number(q.get('seed') ?? '1');
  const boom = q.get('boom') === null ? Number.NaN : Number(q.get('boom'));
  return {
    scene: q.get('scene') ?? 'play',
    song: q.get('song'),
    t: Number.isFinite(t) ? t : 0,
    difficulty: q.get('difficulty') ?? 'normal',
    seed: Number.isInteger(seed) ? seed : 1,
    boom: Number.isFinite(boom) ? boom : null,
  };
}

/** Tells the screenshot script the frame on screen is final. Call it once, after the last draw. */
export function markCaptureReady(): void {
  window.__pbCaptureReady = true;
}
