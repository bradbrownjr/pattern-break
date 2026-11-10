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
import { FLASH_PEAK } from '../render/flash.ts';
import { PixelText } from '../render/text.ts';
import cockpitUrl from './hangar-art/cockpit.png';
import panelUrl from './hangar-art/cockpit-panel.png';
import doorUrl from './hangar-art/door.png';
import hangarUrl from './hangar-art/hangar.png';
import gripUrl from './hangar-art/hand-grip.png';
import pointUrl from './hangar-art/hand-point.png';
import pilotUrl from './hangar-art/pilot.png';
import seatedUrl from './hangar-art/pilot-seated.png';

const W = PLAYFIELD_WIDTH;
const H = PLAYFIELD_HEIGHT;

/** Greys, darkest first. */
const G0 = 0x08090c;
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
/** A finger presses Eject, and the deck's door springs open. */
const EJECT_REACH = 5300;
const EJECT_AT = 5600;
const DOOR_OPEN = 5800;
const EJECT_LEAVE = 5750;
const EJECT_GONE = 5950;
/** The glove sets the cassette in the open door's holder, and goes. */
const CASSETTE_IN = 5950;
const INSERTED = 6500;
const GRIP_GONE = 6650;
/** A finger pushes the door shut. */
const PUSH_REACH = 6850;
const DOOR_SHUT = 7050;
const PUSH_GONE = 7300;
const TO_PLAY = 7300;
/** The hand waits over Play here until the level is loaded. */
export const HOLD_AT = 8000;
/** Play goes down. */
const PRESS_AT = 8100;
/** The run starts: the song plays from the tape. */
export const PLAY_AT = 8250;
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
  { at: EJECT_AT, effect: 'click', pan: 0.2 },
  { at: INSERTED, effect: 'insert', pan: 0 },
  { at: DOOR_SHUT, effect: 'insert', pan: 0.05 },
  { at: PRESS_AT, effect: 'click', pan: 0 },
  { at: PRESS_AT + 30, effect: 'hiss', pan: 0 },
];

/**
 * Impossible's hangar is on alert (Brad, 2026-11-10): the siren wails twice, 3 s each, with
 * a second between, before Play.
 */
export const ALARM_CUES: readonly { at: number; effect: Effect; pan: number }[] = [
  { at: 150, effect: 'siren', pan: -0.3 },
  { at: 4150, effect: 'siren', pan: 0.3 },
];

/** The intro's sounds, with the alarm's when `alarm` is on, in time order. */
export function hangarCues(alarm: boolean): readonly { at: number; effect: Effect; pan: number }[] {
  return alarm ? [...HANGAR_CUES, ...ALARM_CUES].sort((a, b) => a.at - b.at) : HANGAR_CUES;
}

/**
 * The alarm's red strobe, the strength of its flash `ms` into the intro: a double flash
 * every second, each 70 ms fading out from `peak` of red added over the picture (the
 * Flashing setting's peak). Two flashes a second stays under WCAG 2.2's limit of three in
 * any one second (2.3.1, Three Flashes or Below Threshold) at either setting.
 */
export const STROBE_PERIOD_MS = 1000;
const STROBE_FLASHES = [0, 160];
const STROBE_FLASH_MS = 70;
const STROBE_RED = 0xff1a1a;

export function strobeAlpha(ms: number, peak: number): number {
  const phase = ((ms % STROBE_PERIOD_MS) + STROBE_PERIOD_MS) % STROBE_PERIOD_MS;
  for (const at of STROBE_FLASHES) {
    if (phase >= at && phase < at + STROBE_FLASH_MS) return peak * (1 - (phase - at) / STROBE_FLASH_MS);
  }
  return 0;
}

/**
 * The intro's clock for `ms` since it started: it stops with the hand over Play until the
 * level is `ready`, and at Play once it is. It never reads below 0: a frame's timestamp is
 * when the frame began, which can be a moment before the key press that started the
 * intro, and a negative time picked a walk frame that doesn't exist and stopped the frame
 * loop (found 2026-11-10: the game froze at a level's start, about one run in two in
 * headless Chromium).
 */
export function introTime(ms: number, ready: boolean): number {
  return Math.max(0, Math.min(ms, ready ? PLAY_AT : HOLD_AT));
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
/** The deck's keys, left to right: rewind, play, fast forward, stop, eject. */
const KEY_LEFT = [133, 157, 182, 206, 230];
const KEY_TOP = 158;
const KEY_W = 21;
const KEY_H = 14;
const PLAY = 1;
/** The deck's door, hinged along its bottom edge, and the window in it. */
const DOOR = new Rectangle(135, 97, 117, 57);
const DECK_WINDOW = new Rectangle(145, 105, 97, 35);
/**
 * How far the door tilts open, in radians (a guess: no source gives the angle). Kept
 * shallow: the tilt is drawn by squashing the door and the tape in it, and at 60 degrees
 * the tape looked like it shrank (Brad, 2026-11-10).
 */
const DOOR_ANGLE = (25 * Math.PI) / 180;
const EJECT = 4;
/**
 * The cassette, in a compact cassette's proportions (4 by 2.5 inches: Wikipedia, "Cassette
 * tape"), as big as the deck's door allows, and where it sits behind the door.
 */
const TAPE_W = 88;
const TAPE_H = 55;
const TAPE_AT = { x: 149, y: 98 };
/** The label's line holds this many characters. */
export const LABEL_CHARS = 13;

/** What fits on the cassette's label: the title up to the last word that fits. */
export function labelText(title: string): string {
  if (title.length <= LABEL_CHARS) return title;
  const cut = title.lastIndexOf(' ', LABEL_CHARS);
  return (cut > 0 ? title.slice(0, cut) : title.slice(0, LABEL_CHARS)).trimEnd();
}

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
  /** The deck's door, its window clear. */
  door: Texture;
  pilot: Texture[];
  seated: Texture;
  grip: Texture;
  point: Texture;
}

let artLoad: Promise<HangarArt> | null = null;

/** Loads the intro's art (a few KB, bundled with the client), once. */
export function loadHangarArt(): Promise<HangarArt> {
  artLoad ??= (async () => {
    const urls = [hangarUrl, cockpitUrl, panelUrl, doorUrl, pilotUrl, seatedUrl, gripUrl, pointUrl];
    const textures = await Promise.all(urls.map((url) => Assets.load<Texture>(url)));
    for (const t of textures) t.source.scaleMode = 'nearest';
    const [hangar, cockpit, panel, door, strip, seated, grip, point] = textures as [
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
    ];
    const frames = WALK_FRAMES + 2;
    const fw = strip.width / frames;
    const pilot = Array.from(
      { length: frames },
      (_, i) => new Texture({ source: strip.source, frame: new Rectangle(i * fw, 0, fw, strip.height) }),
    );
    return { hangar, cockpit, panel, door, pilot, seated, grip, point };
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
  /** Behind the door: the dark deck and its spindles. */
  #cavity = new Graphics();
  /**
   * The door and the cassette in its holder, tilting together on the hinge along the door's
   * bottom edge: seen face on, the tilt foreshortens them towards the hinge.
   */
  #doorGroup = new Container();
  #door: Sprite;
  #reels = new Graphics();
  #grip: Sprite;
  #point: Sprite;
  #canopy = new Graphics();
  #label = new PixelText('', G1);
  #heading = new PixelText('', G6, 2);
  #subhead = new PixelText('', G5);
  #credit = new PixelText('', G4);
  /** The alarm's red strobe over everything, added to the picture; and whether it is on. */
  #strobe = new Sprite(Texture.WHITE);
  #alarm = false;
  readonly #art: HangarArt;

  constructor(art: HangarArt) {
    this.#art = art;
    this.#seated = new Sprite(art.seated);
    this.#rim = new Sprite(new Texture({ source: art.hangar.source, frame: RIM }));
    this.#rim.position.set(RIM.x, RIM.y);
    this.#camera.addChild(new Sprite(art.hangar), this.#pilot, this.#seated, this.#rim);

    this.#outside = new Sprite(art.cockpit);
    this.#outside.mask = this.#outsideMask;
    this.#door = new Sprite(art.door);
    this.#door.position.set(DOOR.x, DOOR.y);
    const hinge = DOOR.y + DOOR.height;
    this.#doorGroup.position.set(0, hinge);
    this.#doorGroup.pivot.set(0, hinge);
    this.#doorGroup.addChild(this.#door);
    drawCavity(this.#cavity);
    this.#label.place(8, 8);
    this.#cassette.addChild(drawCassette(), this.#reels, this.#label);
    this.#grip = new Sprite(art.grip);
    this.#point = new Sprite(art.point);
    this.#cockpit.addChild(
      this.#outside,
      this.#outsideMask,
      new Sprite(art.panel),
      this.#keys,
      this.#cavity,
      this.#doorGroup,
      this.#cassette,
      this.#grip,
      this.#point,
      this.#heading,
      this.#subhead,
      this.#credit,
    );
    this.#strobe.width = W;
    this.#strobe.height = H;
    this.#strobe.tint = STROBE_RED;
    this.#strobe.blendMode = 'add';
    this.#strobe.visible = false;
    this.container.addChild(this.#camera, this.#cockpit, this.#canopy, this.#strobe);
  }

  /** Turns the alarm's red strobe on or off (Impossible). */
  /** The strobe's strength: the Flashing setting's peak (render/flash.ts). */
  strobePeak = FLASH_PEAK.reduced;

  setAlarm(on: boolean): void {
    this.#alarm = on;
  }

  /**
   * What the cassette's label and the headings say: the level, then the song's title (the
   * label holds only part of a long one), then its credit and the difficulty.
   */
  setSong(heading: string, title: string, credit: string, difficulty: string): void {
    this.#heading.text = heading;
    this.#heading.place(W / 2, 6, 'center');
    this.#subhead.text = title;
    this.#subhead.place(W / 2, 27, 'center');
    this.#label.text = labelText(title);
    this.#credit.text = `${credit}  ${difficulty}`;
    this.#credit.place(W / 2, 38, 'center');
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
    const flash = this.#alarm ? strobeAlpha(ms, this.strobePeak) : 0;
    this.#strobe.visible = flash > 0;
    this.#strobe.alpha = flash;
  }

  /**
   * The start of the run, `ms` after it started. The canopy frame comes down over the
   * window, and the level shows through the glass behind it; then the cockpit drops out of
   * view with the frame riding on it.
   */
  drawWipe(ms: number): void {
    this.#strobe.visible = false;
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
    // The door: springing open on Eject, then pushed shut once the tape is in.
    const open = ms < DOOR_SHUT ? ease(span(ms, EJECT_AT, DOOR_OPEN)) * (1 - span(ms, PUSH_REACH, DOOR_SHUT)) : 0;
    const foreshortened = Math.cos(open * DOOR_ANGLE);
    const hinge = DOOR.y + DOOR.height;
    this.#doorGroup.scale.y = foreshortened;
    // Tilted away from the light, its face darkens.
    this.#door.tint = Math.round(lerp(255, 150, open)) * 0x010101;
    const doorTop = hinge - DOOR.height * foreshortened;

    // The cassette comes in from the right in the gloved hand, tilting to lie in the open
    // door's holder; seated, it rides in the door behind its face, showing through the
    // window.
    const inP = ease(span(ms, CASSETTE_IN, INSERTED));
    const seated = ms >= INSERTED;
    const tape = this.#cassette;
    tape.visible = ms >= CASSETTE_IN;
    if (seated) {
      if (tape.parent !== this.#doorGroup) this.#doorGroup.addChildAt(tape, 0);
      tape.position.set(TAPE_AT.x, TAPE_AT.y);
      tape.scale.y = 1;
    } else {
      if (tape.parent !== this.#cockpit) this.#cockpit.addChildAt(tape, this.#cockpit.getChildIndex(this.#doorGroup) + 1);
      const seatY = hinge - (hinge - TAPE_AT.y) * foreshortened;
      tape.position.set(Math.round(lerp(W + 30, TAPE_AT.x, inP)), Math.round(lerp(150, seatY, inP)));
      tape.scale.y = lerp(1, foreshortened, inP);
    }
    const cx = tape.x;
    const cy = tape.y;

    // The reels turn once Play is down.
    const r = this.#reels;
    r.clear();
    const turning = ms >= PRESS_AT ? (ms - PRESS_AT) / 1000 : 0;
    for (const rx of HUB_X) drawReel(r, rx, HUB_Y, turning * Math.PI * 2 * 0.8);

    // The glove holding the cassette's end, then away down to the right.
    const holding = ms >= CASSETTE_IN && ms < GRIP_GONE;
    this.#grip.visible = holding;
    if (holding) {
      const out = ease(span(ms, INSERTED, GRIP_GONE));
      this.#grip.position.set(
        Math.round(cx + TAPE_W - GRIP_AT.x + out * 140),
        Math.round(cy + (TAPE_H * tape.scale.y) / 2 - GRIP_AT.y + out * 150),
      );
    }

    // The pointing finger: on Eject, then on the door's top edge to push it shut, then on
    // Play.
    const key = (i: number, down: boolean) => ({
      x: KEY_LEFT[i]! + KEY_W / 2,
      y: KEY_TOP + KEY_H / 2 + (down ? 1 : 0),
    });
    let tip: { x: number; y: number } | null = null;
    let reach = 0;
    if (ms >= EJECT_REACH && ms < EJECT_GONE) {
      tip = key(EJECT, ms >= EJECT_AT && ms < EJECT_LEAVE);
      reach = ms < EJECT_LEAVE ? span(ms, EJECT_REACH, EJECT_AT) : 1 - span(ms, EJECT_LEAVE, EJECT_GONE);
    } else if (ms >= GRIP_GONE && ms < PUSH_GONE) {
      tip = { x: DOOR.x + DOOR.width - 24, y: doorTop + 2 };
      reach = ms < DOOR_SHUT ? span(ms, GRIP_GONE, PUSH_REACH) : 1 - span(ms, DOOR_SHUT, PUSH_GONE);
    } else if (ms >= TO_PLAY) {
      tip = key(PLAY, ms >= PRESS_AT);
      reach = span(ms, TO_PLAY, HOLD_AT);
    }
    this.#point.visible = tip !== null && reach > 0;
    if (tip) {
      const p = ease(reach);
      this.#point.position.set(
        Math.round(lerp(W + 10, tip.x - TIP_AT.x, p)),
        Math.round(lerp(H + 40, tip.y - TIP_AT.y, p)),
      );
    }
    const down: number[] = [];
    if (ms >= EJECT_AT && ms < EJECT_LEAVE) down.push(EJECT);
    if (ms >= PRESS_AT) down.push(PLAY);
    drawKeys(this.#keys, down);

    // The level's heading, the song's title, its credit and the difficulty, once the
    // tape is in.
    const shown = ms >= DOOR_SHUT;
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

/** The symbols on the deck's keys in cockpit.png, with the keys in `pressed` held down. */
function drawKeys(g: Graphics, pressed: readonly number[]): void {
  g.clear();
  KEY_LEFT.forEach((kx, i) => {
    const down = pressed.includes(i);
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

// The cassette's face, after a photo of one (Wikimedia Commons, "Goldstar compact cassette
// DJ60 20090717.jpg"): screws in the corners and the bottom middle; a label with a line
// to write on and a window across it showing both hubs, level with each other, at about a
// quarter and three quarters of the width; and along the bottom, a raised trapezoid with
// the openings for the heads and the capstans, and a tape guide in each corner.
const HUB_X = [26, 62];
const HUB_Y = 26;

/** The cassette's shell and label, drawn once; the hubs turn on top of it. */
function drawCassette(): Graphics {
  const g = new Graphics();
  const w = TAPE_W;
  const h = TAPE_H;
  g.roundRect(0, 0, w, h, 3).fill(G2);
  g.roundRect(1, 1, w - 2, h - 2, 2).fill(G3);
  // The label, its writing line, and the window across it.
  g.rect(6, 4, w - 12, 33).fill(G6);
  g.rect(8, 17, w - 16, 1).fill(G5);
  g.rect(17, 19, 54, 15).fill(G1);
  // The tape wound on each hub, more on the left at the start.
  g.circle(HUB_X[0]!, HUB_Y, 7).fill(G2);
  g.circle(HUB_X[1]!, HUB_Y, 5).fill(G2);
  // The trapezoid along the bottom, its openings, and the tape across them.
  g.poly([20, 39, w - 20, 39, w - 13, h - 1, 13, h - 1]).fill(G4);
  for (const hx of [24, 34, 50, 60]) g.rect(hx, h - 7, 4, 5).fill(G1);
  g.rect(14, h - 3, w - 28, 1).fill(G2);
  g.circle(9, h - 6, 3).fill(G5).circle(9, h - 6, 1).fill(G2);
  g.circle(w - 9, h - 6, 3).fill(G5).circle(w - 9, h - 6, 1).fill(G2);
  // Screws.
  for (const [sx, sy] of [
    [3, 3],
    [w - 4, 3],
    [3, h - 4],
    [w - 4, h - 4],
    [w / 2 - 1, h - 6],
  ] as const) {
    g.rect(sx, sy, 2, 2).fill(G1);
  }
  return g;
}

/**
 * Behind the open door: the dark inside of the deck, with the two spindles that turn the
 * cassette's hubs, where the hubs sit once it is in.
 */
function drawCavity(g: Graphics): void {
  g.rect(DOOR.x, DOOR.y, DOOR.width, DOOR.height).fill(G0);
  g.rect(DOOR.x, DOOR.y, DOOR.width, 2).fill(G2);
  // Seen through the shut door's window when it is empty: the same dark as the window.
  g.rect(DECK_WINDOW.x, DECK_WINDOW.y, DECK_WINDOW.width, DECK_WINDOW.height).fill(G1);
  for (const hx of HUB_X) {
    const x = TAPE_AT.x + hx;
    const y = TAPE_AT.y + HUB_Y;
    g.circle(x, y, 3).fill(G2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.rect(Math.round(x + Math.cos(a) * 3), Math.round(y + Math.sin(a) * 3), 1, 1).fill(G3);
    }
  }
}

/** A cassette reel hub at (x, y), turned `angle` radians. */
function drawReel(g: Graphics, x: number, y: number, angle: number): void {
  g.circle(x, y, 4).fill(G5);
  for (let k = 0; k < 6; k++) {
    const a = angle + (k / 6) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5).lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4).stroke({ width: 1, color: G2 });
  }
}
