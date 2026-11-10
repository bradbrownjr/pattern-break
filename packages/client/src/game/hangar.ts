// The hangar intro before an arcade run (Brad, 2026-11-10; docs/DEVELOPMENT.md, "Playing
// it"). In black and white: the captain walks across the hangar, climbs into the fighter,
// and pushes a cassette of level 1's song into the deck; pressing Play starts the run. As
// the run starts the canopy closes over the view (the wipe), and the level floods from
// black and white into colour with the song's first rows (ColourFlood). The hangar, the
// cockpit, the captain and the glove are generated art (art/hangar/README.md), made game-
// sized by tools/hangar-art.py; the cassette, the deck's key symbols, the canopy frame and
// the text are drawn in code. Everything on screen is a function of the time, so capture
// mode can show any moment. Cosmetic: nothing here touches the sim.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, type Level } from '@game/core';
import { Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Effect } from '../audio/effects.ts';
import { PixelText } from '../render/text.ts';
import cockpitUrl from './hangar-art/cockpit.png';
import panelUrl from './hangar-art/cockpit-panel.png';
import hangarUrl from './hangar-art/hangar.png';
import gripUrl from './hangar-art/hand-grip.png';
import pointUrl from './hangar-art/hand-point.png';
import pilotUrl from './hangar-art/pilot.png';
import seatedUrl from './hangar-art/pilot-seated.png';

const W = PLAYFIELD_WIDTH;
const H = PLAYFIELD_HEIGHT;

/** Greys, darkest first. */
const G1 = 0x1a1c22;
const G2 = 0x30333b;
const G3 = 0x4d515b;
const G4 = 0x7a7f8a;
const G5 = 0xb4b8c0;
const G6 = 0xe8eaee;

// The timeline, in ms from the start.
const WALK_END = 2600;
const CLIMB_END = 4400;
const BOARD_END = 5000;
const ZOOM_START = 2400;
/** The cut to the cockpit. */
export const COCKPIT_AT = 5200;
const CASSETTE_IN = 5400;
const INSERTED = 6200;
const HAND_OUT = 6800;
const TO_PLAY = 7200;
/** The hand waits over Play here until the level is loaded. */
export const HOLD_AT = 7900;
/** Play goes down. */
const PRESS_AT = 8000;
/** The run starts: the song plays from the tape. */
export const PLAY_AT = 8150;
/** How long the canopy takes to close over the start of the run. */
export const WIPE_MS = 1000;
/** The share of the wipe the canopy takes to come down; then the cockpit drops away. */
const CANOPY_SHARE = 0.35;
/** The top of the glare shield in cockpit.png, where the canopy frame comes to rest. */
const SHIELD_Y = 51;
/** The lowest point of the glare shield's top edge (at the sides) in cockpit.png. */
const SHIELD_LOW_Y = 65;
/** Rows of the song over which the level floods into colour. */
export const FLOOD_ROWS = 32;

/** Footsteps while walking, every 320 ms. */
const STEP_MS = 320;

/** The intro's sounds and when they play, in ms. */
export const HANGAR_CUES: readonly { at: number; effect: Effect; pan: number }[] = [
  ...Array.from({ length: Math.floor(WALK_END / STEP_MS) }, (_, i) => ({
    at: (i + 1) * STEP_MS,
    effect: 'step' as const,
    pan: ((i + 1) * STEP_MS) / WALK_END - 0.6,
  })),
  { at: 2850, effect: 'clank', pan: 0.1 },
  { at: 3300, effect: 'clank', pan: 0.12 },
  { at: 3750, effect: 'clank', pan: 0.14 },
  { at: 4200, effect: 'clank', pan: 0.16 },
  { at: 4950, effect: 'thunk', pan: 0.2 },
  { at: INSERTED, effect: 'insert', pan: 0 },
  { at: PRESS_AT, effect: 'click', pan: 0 },
  { at: PRESS_AT + 30, effect: 'hiss', pan: 0 },
];

/**
 * The intro's clock for `ms` since it started: it stops with the hand over Play until the
 * level is `ready`, and at Play once it is.
 */
export function introTime(ms: number, ready: boolean): number {
  return Math.min(ms, ready ? PLAY_AT : HOLD_AT);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 to 1 over [a, b]. */
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const ease = (p: number): number => p * p * (3 - 2 * p);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

// Where things are in hangar.png (measured on it; tools/hangar-art.py makes it).
/** The floor the captain walks on. */
const FLOOR_Y = 168;
/** Where the walk starts and the ladder's foot and top, as the captain's feet. */
const WALK_FROM_X = 56;
const LADDER_FOOT = { x: 221, y: FLOOR_Y };
const LADDER_TOP = { x: 236, y: 127 };
/** The climbing frames carry the body left of centre; this puts it on the ladder. */
const CLIMB_NUDGE_X = 4;
/** The middle of the cockpit opening, and the fuselage just below its rim. */
const SEAT_X = 255;
const RIM_Y = 128;
/** The fuselage around the cockpit, drawn again over a captain getting in. */
const RIM = new Rectangle(234, RIM_Y, 46, 28);
/** The captain stands this tall in pilot.png's frames (tools/hangar-art.py, PILOT_HEIGHT). */
const PILOT_HEIGHT = 28;
/** pilot.png's frames: four of the walk, then two of the climb. */
const WALK_FRAMES = 4;
const CLIMB_FRAME = 4;

// Where things are in cockpit.png.
/** The deck's window, and its keys left to right: rewind, play, fast forward, stop, eject. */
const KEY_LEFT = [133, 157, 182, 207, 232];
const KEY_TOP = 167;
const KEY_W = 19;
const KEY_H = 11;
const PLAY = 1;
/** The cassette: its size, and where it sits in the deck's window. */
const TAPE_W = 108;
const TAPE_H = 28;
const TAPE_AT = { x: 138, y: 125 };
/** The label holds this many characters. */
const LABEL_CHARS = 16;

// Anchors in the glove sprites (printed by tools/hangar-art.py).
/** hand-grip.png: the cassette's right end, middle, sits here between fingers and thumb. */
const GRIP_AT = { x: 46, y: 45 };
/** hand-point.png: the tip of the index finger. */
const TIP_AT = { x: 0, y: 24 };

/** The intro's art, loaded once. */
export interface HangarArt {
  hangar: Texture;
  cockpit: Texture;
  panel: Texture;
  pilot: Texture[];
  seated: Texture;
  grip: Texture;
  point: Texture;
}

let artLoad: Promise<HangarArt> | null = null;

/** Loads the intro's art (a few KB, bundled with the client), once. */
export function loadHangarArt(): Promise<HangarArt> {
  artLoad ??= (async () => {
    const urls = [hangarUrl, cockpitUrl, panelUrl, pilotUrl, seatedUrl, gripUrl, pointUrl];
    const textures = await Promise.all(urls.map((url) => Assets.load<Texture>(url)));
    for (const t of textures) t.source.scaleMode = 'nearest';
    const [hangar, cockpit, panel, strip, seated, grip, point] = textures as [Texture, Texture, Texture, Texture, Texture, Texture, Texture];
    const frames = WALK_FRAMES + 2;
    const fw = strip.width / frames;
    const pilot = Array.from(
      { length: frames },
      (_, i) => new Texture({ source: strip.source, frame: new Rectangle(i * fw, 0, fw, strip.height) }),
    );
    return { hangar, cockpit, panel, pilot, seated, grip, point };
  })();
  artLoad.catch(() => {
    artLoad = null;
  });
  return artLoad;
}

export class HangarIntro {
  readonly container = new Container();
  /** The hangar, moved and scaled as the camera. */
  #camera = new Container();
  #pilot = new Sprite();
  #seated: Sprite;
  #rim: Sprite;
  #cockpit = new Container();
  /** Through the open canopy: the hangar. The level shows through once the canopy is shut. */
  #outside: Sprite;
  #outsideMask = new Graphics();
  #keys = new Graphics();
  #cassette = new Container();
  #reels = new Graphics();
  #grip: Sprite;
  #point: Sprite;
  #canopy = new Graphics();
  #label = new PixelText('', G1);
  #heading = new PixelText('', G6, 2);
  #subhead = new PixelText('', G4);
  #credit = new PixelText('', G4);
  readonly #art: HangarArt;

  constructor(art: HangarArt) {
    this.#art = art;
    this.#seated = new Sprite(art.seated);
    this.#rim = new Sprite(new Texture({ source: art.hangar.source, frame: RIM }));
    this.#rim.position.set(RIM.x, RIM.y);
    this.#camera.addChild(new Sprite(art.hangar), this.#pilot, this.#seated, this.#rim);

    this.#outside = new Sprite(art.cockpit);
    this.#outside.mask = this.#outsideMask;
    const body = new Graphics();
    body.rect(0, 0, TAPE_W, TAPE_H).fill(G3).rect(1, 1, TAPE_W - 2, TAPE_H - 2).fill(G5);
    body.rect(3, 2, TAPE_W - 6, 11).fill(G6);
    body.rect(34, 16, 40, 9).fill(G1);
    body.rect(6, TAPE_H - 2, TAPE_W - 12, 1).fill(G4);
    this.#label.place(6, 3);
    this.#cassette.addChild(body, this.#reels, this.#label);
    this.#grip = new Sprite(art.grip);
    this.#point = new Sprite(art.point);
    this.#cockpit.addChild(
      this.#outside,
      this.#outsideMask,
      new Sprite(art.panel),
      this.#keys,
      this.#cassette,
      this.#grip,
      this.#point,
      this.#heading,
      this.#subhead,
      this.#credit,
    );
    this.container.addChild(this.#camera, this.#cockpit, this.#canopy);
  }

  /** What the cassette label and the headings say. */
  setSong(heading: string, title: string, credit: string, difficulty: string): void {
    this.#heading.text = heading;
    this.#heading.place(W / 2, 6, 'center');
    this.#subhead.text = difficulty;
    this.#subhead.place(W / 2, 38, 'center');
    this.#label.text = title.length > LABEL_CHARS ? title.slice(0, LABEL_CHARS) : title;
    this.#credit.text = credit;
    this.#credit.place(W / 2, 27, 'center');
  }

  /** Draws the intro at `ms` from its start. */
  draw(ms: number): void {
    const inHangar = ms < COCKPIT_AT;
    this.#camera.visible = inHangar;
    this.#cockpit.visible = !inHangar;
    this.#canopy.visible = false;
    this.#cockpit.position.set(0, 0);
    this.#showOutside(0);
    if (inHangar) this.#drawHangarShot(ms);
    else this.#drawCockpitShot(ms);
  }

  /**
   * The start of the run, `ms` after it started. The canopy frame comes down over the
   * window, and the level shows through the glass behind it; then the cockpit drops out of
   * view with the frame riding on it.
   */
  drawWipe(ms: number): void {
    this.#camera.visible = false;
    this.#cockpit.visible = true;
    this.#drawCockpitShot(PLAY_AT + ms);
    const frameY = Math.round(lerp(-2, SHIELD_Y, ease(span(ms, 0, WIPE_MS * CANOPY_SHARE))));
    const drop = Math.round(ease(span(ms, WIPE_MS * CANOPY_SHARE, WIPE_MS)) * (H - SHIELD_Y + 10));
    this.#showOutside(frameY);
    this.#cockpit.position.set(0, drop);
    // The headings were on the window; the level shows there now.
    this.#heading.visible = false;
    this.#subhead.visible = false;
    this.#credit.visible = false;
    const edge = frameY + drop;
    const c = this.#canopy;
    c.visible = edge < H + 10;
    c.clear();
    c.rect(0, edge - 8, W, 8).fill(G1);
    c.rect(0, edge - 8, W, 1).fill(G5);
    c.rect(0, edge - 2, W, 2).fill(G3);
    // The frame's struts down the sides of the glass.
    c.poly([0, edge - 8, 18, edge - 8, 6, edge - 60, 0, edge - 60]).fill(G1);
    c.poly([W, edge - 8, W - 18, edge - 8, W - 6, edge - 60, W, edge - 60]).fill(G1);
  }

  /** Shows the view out of the canopy from `top` down to the glare shield. */
  #showOutside(top: number): void {
    const m = this.#outsideMask;
    m.clear();
    this.#outside.visible = top < SHIELD_LOW_Y;
    if (this.#outside.visible) m.rect(0, top, W, SHIELD_LOW_Y - top).fill(0xffffff);
  }

  #drawHangarShot(ms: number): void {
    // The camera closes in on the cockpit as the captain climbs.
    const z = ease(span(ms, ZOOM_START, BOARD_END));
    this.#camera.pivot.set(lerp(W / 2, SEAT_X - 8, z), lerp(H / 2, RIM_Y - 4, z));
    this.#camera.position.set(W / 2, H / 2);
    this.#camera.scale.set(lerp(1, 1.8, z));

    const { pilot } = this.#art;
    let frame: Texture;
    let x: number;
    let feet: number;
    if (ms < WALK_END) {
      // A step every STEP_MS: contact, passing, contact, passing.
      frame = pilot[Math.floor(ms / (STEP_MS / 2)) % WALK_FRAMES]!;
      x = lerp(WALK_FROM_X, LADDER_FOOT.x, span(ms, 0, WALK_END));
      feet = FLOOR_Y;
    } else if (ms < CLIMB_END) {
      // Up the ladder, the arms changing over with each rung's clank.
      const p = span(ms, WALK_END, CLIMB_END);
      frame = pilot[CLIMB_FRAME + (Math.floor((ms - WALK_END) / 450) % 2)]!;
      x = lerp(LADDER_FOOT.x, LADDER_TOP.x, p) + CLIMB_NUDGE_X;
      feet = lerp(LADDER_FOOT.y, LADDER_TOP.y, p);
    } else {
      // Over the rim and down into the seat, behind the fuselage, until only the head and
      // shoulders show.
      const p = ease(span(ms, CLIMB_END, BOARD_END));
      frame = pilot[0]!;
      x = lerp(LADDER_TOP.x, SEAT_X, p);
      feet = lerp(LADDER_TOP.y, RIM_Y - this.#art.seated.height + PILOT_HEIGHT, p);
    }
    const seated = ms >= BOARD_END;
    this.#seated.visible = seated;
    this.#pilot.visible = !seated;
    this.#rim.visible = ms >= CLIMB_END;
    if (seated) {
      this.#seated.position.set(Math.round(SEAT_X - this.#seated.width / 2), RIM_Y - this.#seated.height);
    } else {
      this.#pilot.texture = frame;
      this.#pilot.position.set(Math.round(x - frame.width / 2), Math.round(feet - frame.height));
    }
  }

  #drawCockpitShot(ms: number): void {
    // The cassette comes in from the right in the gloved hand and into the deck's window.
    const inP = ease(span(ms, CASSETTE_IN, INSERTED));
    const cx = Math.round(lerp(W + 30, TAPE_AT.x, inP));
    const cy = Math.round(lerp(150, TAPE_AT.y, inP));
    this.#cassette.position.set(cx, cy);
    this.#cassette.visible = ms >= CASSETTE_IN;

    // The reels turn once Play is down.
    const r = this.#reels;
    r.clear();
    const turning = ms >= PRESS_AT ? (ms - PRESS_AT) / 1000 : 0;
    for (const rx of [28, 80]) drawReel(r, rx, 20, turning * Math.PI * 2 * 0.8);

    // The glove: holding the cassette's end, then away down to the right; then pointing,
    // over Play, and pressing it.
    const holding = ms >= CASSETTE_IN && ms < HAND_OUT;
    this.#grip.visible = holding;
    if (holding) {
      const out = ease(span(ms, INSERTED, HAND_OUT));
      this.#grip.position.set(
        Math.round(cx + TAPE_W - GRIP_AT.x + out * 140),
        Math.round(cy + TAPE_H / 2 - GRIP_AT.y + out * 150),
      );
    }
    const pointing = ms >= TO_PLAY;
    this.#point.visible = pointing;
    if (pointing) {
      const to = ease(span(ms, TO_PLAY, HOLD_AT));
      const tipX = KEY_LEFT[PLAY]! + KEY_W / 2;
      const tipY = KEY_TOP + KEY_H / 2 + (ms >= PRESS_AT ? 1 : 0);
      this.#point.position.set(
        Math.round(lerp(W + 10, tipX - TIP_AT.x, to)),
        Math.round(lerp(H + 40, tipY - TIP_AT.y, to)),
      );
    }
    drawKeys(this.#keys, ms >= PRESS_AT);

    // The level's heading, its difficulty, and the song's credit, once the tape is in.
    const shown = ms >= INSERTED;
    this.#heading.visible = shown;
    this.#subhead.visible = shown;
    this.#credit.visible = shown;
  }
}

/**
 * The level from black and white into colour, one step per row of the song from its start:
 * a colour matrix over the stage, removed once the colour is full.
 */
export class ColourFlood {
  readonly filter = new ColorMatrixFilter();

  /** The colour, 0 (grey) to 1 (full), at song sample `samples` of `level`. */
  static amount(level: Pick<Level, 'barStartSample'>, samples: number): number {
    let rows = 0;
    const starts = level.barStartSample;
    while (rows < FLOOD_ROWS && rows < starts.length && starts[rows]! <= samples) rows++;
    return rows / FLOOD_ROWS;
  }

  /** Sets the filter for `amount` (0 grey to 1 full colour). */
  set(amount: number): void {
    this.filter.saturate(amount - 1, false);
  }
}

// Drawing ----------------------------------------------------------------------------------

/** The symbols on the deck's keys in cockpit.png. Play is down once pressed. */
function drawKeys(g: Graphics, playDown: boolean): void {
  g.clear();
  KEY_LEFT.forEach((kx, i) => {
    const down = i === PLAY && playDown;
    if (down) {
      // The key sunk a pixel into the deck, darker.
      g.rect(kx - 1, KEY_TOP, KEY_W + 2, KEY_H + 1).fill(G1);
      g.rect(kx, KEY_TOP + 2, KEY_W, KEY_H - 1).fill(G3);
    }
    const mx = kx + Math.floor(KEY_W / 2);
    const my = KEY_TOP + 5 + (down ? 1 : 0);
    const left = (x: number) => g.poly([x + 2, my - 3, x + 2, my + 3, x - 2, my]).fill(G1);
    const right = (x: number) => g.poly([x - 2, my - 3, x - 2, my + 3, x + 2, my]).fill(G1);
    if (i === 0) {
      left(mx - 2);
      left(mx + 2);
    }
    if (i === PLAY) right(mx);
    if (i === 2) {
      right(mx - 2);
      right(mx + 2);
    }
    if (i === 3) g.rect(mx - 3, my - 3, 6, 6).fill(G1);
    if (i === 4) g.poly([mx - 3, my + 1, mx + 3, my + 1, mx, my - 3]).fill(G1).rect(mx - 3, my + 2, 7, 1).fill(G1);
  });
}

/** A cassette reel hub at (x, y), turned `angle` radians. */
function drawReel(g: Graphics, x: number, y: number, angle: number): void {
  g.circle(x, y, 6).fill(G2);
  g.circle(x, y, 4).fill(G5);
  for (let k = 0; k < 6; k++) {
    const a = angle + (k / 6) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5).lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4).stroke({ width: 1, color: G2 });
  }
}
