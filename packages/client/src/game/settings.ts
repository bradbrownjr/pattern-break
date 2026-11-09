// The player's settings, kept in this browser's localStorage. Storage can be missing or
// blocked (a private window, cleared site data), so reading falls back to the defaults and
// a failed write is ignored.

/** Volume levels: 0 is off, 5 is full. */
export const VOLUME_LEVELS = 5;

export interface Settings {
  music: number;
  effects: number;
}

export const DEFAULT_SETTINGS: Settings = { music: 5, effects: 4 };

const KEY = 'pattern-break.settings';

/** A level's gain: each step down halves it (about 6 dB), and 0 is silent. */
export function volumeGain(level: number): number {
  return level <= 0 ? 0 : 2 ** (Math.min(level, VOLUME_LEVELS) - VOLUME_LEVELS);
}

function level(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= VOLUME_LEVELS ? v : fallback;
}

/** Reads the settings from `storage`, with defaults for anything missing or out of range. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const o = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return { music: level(o['music'], DEFAULT_SETTINGS.music), effects: level(o['effects'], DEFAULT_SETTINGS.effects) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is blocked or full: the settings last until the page closes.
  }
}

/** localStorage, or null where reading it throws. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
