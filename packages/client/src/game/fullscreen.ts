// Full screen through the Fullscreen API (https://fullscreen.spec.whatwg.org/), on every
// device (Brad, 2026-11-12). A page may only ask from a user activation: the HTML spec's
// activation-triggering input events are a key other than Esc, a mouse's pointerdown, and
// any other pointer's pointerup. An iPhone has no such API for a page (MDN's compatibility
// data: "Only available on iPad, not on iPhone"); there, adding the game to the home screen
// is the way to lose the browser's bars.
//
// Esc is the game's pause and back key, but a browser takes it to leave full screen. Where
// the Keyboard Lock API exists (Chromium; MDN lists no Firefox or Safari), locking Escape
// gives it to the game, and the spec requires that a press longer than 2 s still leaves.

interface KeyboardLock {
  lock?(codes: string[]): Promise<void>;
}

/** True while the page fills the screen, by the API or as an installed app. */
export function isFullScreen(): boolean {
  if (document.fullscreenElement) return true;
  return typeof matchMedia === 'function' && matchMedia('(display-mode: fullscreen)').matches;
}

/** Asks for full screen; call it only from a user activation. A refusal is ignored. */
export function enterFullScreen(): void {
  if (isFullScreen() || !document.fullscreenEnabled) return;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    // Refused (no user activation, or the browser said no): stay in the page.
  });
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  keyboard?.lock?.(['Escape']).catch(() => {
    // No lock: Esc leaves full screen, as browsers do.
  });
}

export function exitFullScreen(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
