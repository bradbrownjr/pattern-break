// Remappable controls (docs/DEVELOPMENT.md, "Keys"): which keys and pad inputs do each
// action, kept in this browser's localStorage. Each action has up to three slots, so the
// defaults fit (Z, J and Space all fire). Keys are KeyboardEvent.code values, the physical
// key (https://www.w3.org/TR/uievents-code/). Pad inputs are strings: `b3` is button 3,
// `a1-` and `a1+` are axis 1 leaning negative or positive, and `h9@-1.000` is axis 9 used as
// a hat switch, at that value (gamepad.ts). Holds no display objects, so tests run in Node.

export const SLOTS = 3;

/** The actions the keyboard can remap, in the Keys screen's order. */
export const KEY_ACTIONS = ['up', 'down', 'left', 'right', 'fire', 'bomb', 'missile', 'nuke', 'boost', 'pause'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];
/** The pad adds Cancel (Select: back in menus, quit from pause) and Replay (Y). */
export const PAD_ACTIONS = [...KEY_ACTIONS, 'cancel', 'replay'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

/** One action's slots; null is empty. */
export type Slots = (string | null)[];
export type KeyBindings = Record<KeyAction, Slots>;
export type PadBindings = Record<PadAction, Slots>;

export interface Bindings {
  keys: KeyBindings;
  /**
   * Pad layouts by profile (padProfile() in gamepad.ts): `standard` for every pad with the
   * Gamepad API's standard mapping, `id:` and the pad's id for each other pad.
   */
  pads: Record<string, PadBindings>;
}

export const STANDARD_PROFILE = 'standard';

const slots = (...inputs: string[]): Slots => [...inputs, ...Array<null>(SLOTS - inputs.length).fill(null)];

/** Today's two layouts: arrows with Z, X, C, V and Shift; WASD with J, K, L, ; and '. */
export const DEFAULT_KEYS: Readonly<KeyBindings> = {
  up: slots('ArrowUp', 'KeyW'),
  down: slots('ArrowDown', 'KeyS'),
  left: slots('ArrowLeft', 'KeyA'),
  right: slots('ArrowRight', 'KeyD'),
  fire: slots('KeyZ', 'KeyJ', 'Space'),
  bomb: slots('KeyX', 'KeyK'),
  missile: slots('KeyC', 'KeyL'),
  nuke: slots('KeyV', 'Semicolon'),
  boost: slots('ShiftLeft', 'Quote', 'ShiftRight'),
  pause: slots('Escape'),
};

/**
 * The standard mapping's layout (https://w3c.github.io/gamepad/#remapping): buttons 0 to 3
 * are A, B, X, Y; 4 and 5 the bumpers, 6 and 7 the triggers; 8 Select, 9 Start; 12 to 15 the
 * D-pad. Axes 0 and 1 are the left stick, negative left and up.
 */
export const DEFAULT_PAD: Readonly<PadBindings> = {
  up: slots('b12', 'a1-'),
  down: slots('b13', 'a1+'),
  left: slots('b14', 'a0-'),
  right: slots('b15', 'a0+'),
  fire: slots('b0', 'b7'),
  bomb: slots('b1'),
  missile: slots('b5'),
  nuke: slots('b2'),
  boost: slots('b4', 'b6'),
  pause: slots('b9'),
  cancel: slots('b8'),
  replay: slots('b3'),
};

/** A pad without the standard mapping does nothing until its inputs are set. */
export function emptyPad(): PadBindings {
  return Object.fromEntries(PAD_ACTIONS.map((a) => [a, slots()])) as PadBindings;
}

function copy<T extends string>(b: Readonly<Record<T, Slots>>): Record<T, Slots> {
  return Object.fromEntries(Object.entries<Slots>(b).map(([a, s]) => [a, [...s]])) as Record<T, Slots>;
}

export function defaultBindings(): Bindings {
  return { keys: copy(DEFAULT_KEYS), pads: { [STANDARD_PROFILE]: copy(DEFAULT_PAD) } };
}

/** A profile's layout: what's saved, else the standard defaults or nothing. */
export function padLayout(bindings: Bindings, profile: string): PadBindings {
  return bindings.pads[profile] ?? (profile === STANDARD_PROFILE ? copy(DEFAULT_PAD) : emptyPad());
}

// Keys that can't be bound -------------------------------------------------------------------

/**
 * Esc always pauses and backs out (the Pause row's first slot, locked); Enter always
 * confirms and Backspace backs out, so a menu is never out of reach; Delete clears a slot.
 * Tab, the Windows or Command keys, the menu key and F1 to F12 belong to the browser and
 * the system.
 */
export function isReservedKey(code: string): boolean {
  return (
    /^F\d+$/.test(code) ||
    ['Escape', 'Enter', 'NumpadEnter', 'Backspace', 'Delete', 'Tab', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu'].includes(code)
  );
}

/** The Pause row's first slot is Esc, always. */
export function isLockedSlot(action: PadAction, slot: number, device: 'keyboard' | 'pad'): boolean {
  return device === 'keyboard' && action === 'pause' && slot === 0;
}

// Changing a slot ------------------------------------------------------------------------------

/**
 * Puts `input` in `action`'s `slot` (null clears it). An input already used elsewhere
 * swaps: its old slot takes what `slot` held, so nothing is lost. Returns a new layout.
 */
export function assign<L extends Record<string, Slots>>(layout: Readonly<L>, action: keyof L & string, slot: number, input: string | null): L {
  const next: Record<string, Slots> = copy(layout);
  const old = next[action]![slot] ?? null;
  if (input !== null) {
    for (const slots of Object.values(next)) {
      const i = slots.indexOf(input);
      if (i >= 0) slots[i] = old;
    }
  }
  next[action]![slot] = input;
  return next as L;
}

/** The first direction with no key, or null. Without one, menus can't be moved through. */
export function directionWithoutKey(keys: Readonly<KeyBindings>): KeyAction | null {
  return DIRECTIONS.find((d) => keys[d].every((k) => k === null)) ?? null;
}

// Storage ----------------------------------------------------------------------------------------

const STORAGE_KEY = 'pattern-break.bindings';
const CODE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
export const PAD_INPUT = /^(b\d{1,2}|a\d{1,2}[+-]|h\d{1,2}@-?[01]\.\d{3})$/;
/** At most this many pad layouts are kept. */
const MAX_PROFILES = 16;

/** `raw`'s slots for each action, keeping valid inputs that no earlier slot has used. */
function readLayout<T extends string>(actions: readonly T[], raw: unknown, valid: (s: string) => boolean): Record<T, Slots> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const out = {} as Record<T, Slots>;
  for (const a of actions) {
    const list = Array.isArray(o[a]) ? (o[a] as unknown[]) : [];
    out[a] = Array.from({ length: SLOTS }, (_, i) => {
      const v = list[i];
      if (typeof v !== 'string' || !valid(v) || seen.has(v)) return null;
      seen.add(v);
      return v;
    });
  }
  return out;
}

function readKeys(raw: unknown): KeyBindings {
  const keys = readLayout(KEY_ACTIONS, raw, (c) => CODE.test(c) && !isReservedKey(c));
  if (!keys) return copy(DEFAULT_KEYS);
  keys.pause[0] = 'Escape';
  return directionWithoutKey(keys) ? copy(DEFAULT_KEYS) : keys;
}

/** Reads the bindings from `storage`; anything missing or invalid is the default. */
export function loadBindings(storage: Pick<Storage, 'getItem'> | null): Bindings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const o = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const bindings: Bindings = { keys: readKeys(o['keys']), pads: {} };
    const pads = typeof o['pads'] === 'object' && o['pads'] !== null ? (o['pads'] as Record<string, unknown>) : {};
    for (const [profile, layout] of Object.entries(pads).slice(0, MAX_PROFILES)) {
      const read = readLayout(PAD_ACTIONS, layout, (s) => PAD_INPUT.test(s));
      if (read && profile.length <= 200) bindings.pads[profile] = read;
    }
    bindings.pads[STANDARD_PROFILE] ??= copy(DEFAULT_PAD);
    return bindings;
  } catch {
    return defaultBindings();
  }
}

export function saveBindings(storage: Pick<Storage, 'setItem'> | null, bindings: Bindings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Storage is blocked or full: the bindings last until the page closes.
  }
}

// Labels -----------------------------------------------------------------------------------------

const KEY_LABELS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Space: 'Space',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  CapsLock: 'Caps',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  IntlBackslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
};

/** A key's name as a US keyboard prints it; the code names the key's place, not its letter. */
export function keyLabel(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code) ?? /^Digit(\d)$/.exec(code);
  if (letter) return letter[1]!;
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `Num ${numpad[1]!}`;
  return KEY_LABELS[code] ?? code.slice(0, 10);
}

const STANDARD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'LS', 'RS', 'D Up', 'D Down', 'D Left', 'D Right', 'Home'];
const STANDARD_AXES: Record<string, string> = {
  'a0-': 'LS Left',
  'a0+': 'LS Right',
  'a1-': 'LS Up',
  'a1+': 'LS Down',
  'a2-': 'RS Left',
  'a2+': 'RS Right',
  'a3-': 'RS Up',
  'a3+': 'RS Down',
};
/** A hat's eight positions, from -1 in steps of 2/7 (gamepad.ts). */
const HAT_NAMES = ['Up', 'Up R', 'Right', 'Down R', 'Down', 'Down L', 'Left', 'Up L'];

/** A pad input's name: an Xbox pad's names on a standard pad, numbers on any other. */
export function padInputLabel(input: string, standard: boolean): string {
  const button = /^b(\d+)$/.exec(input);
  if (button) {
    const i = Number(button[1]);
    return standard ? (STANDARD_BUTTONS[i] ?? `Btn ${i}`) : `Btn ${i}`;
  }
  const hat = /^h(\d+)@(-?[01]\.\d+)$/.exec(input);
  if (hat) {
    const step = Math.round((Number(hat[2]) + 1) * 3.5);
    return `H${hat[1]!} ${HAT_NAMES[((step % 8) + 8) % 8]!}`;
  }
  if (standard && STANDARD_AXES[input]) return STANDARD_AXES[input];
  return `Axis ${input.slice(1)}`;
}
