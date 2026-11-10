// The hangar intro before an arcade run (Brad, 2026-11-10; docs/DEVELOPMENT.md, "Playing
// it"). In black and white: the captain walks across the hangar, climbs into the fighter,
// and pushes a cassette of level 1's song into the deck; pressing Play starts the run. As
// the run starts the canopy closes over the view (the wipe), and the level floods from
// black and white into colour with the song's first rows (ColourFlood). Drawn in code with
// flat shapes; everything on screen is a function of the time, so capture mode can show
// any moment. Cosmetic: nothing here touches the sim.

import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, type Level } from '@game/core';
import { ColorMatrixFilter, Container, Graphics } from 'pixi.js';
import type { Effect } from '../audio/effects.ts';
import { PixelText } from '../render/text.ts';

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
/** The top of the glare shield in the cockpit shot, where the canopy frame comes to rest. */
const SHIELD_Y = 52;
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

// The fighter, side on, nose right, and where its parts are.
const LADDER_FOOT = { x: 206, y: 170 };
const LADDER_TOP = { x: 228, y: 124 };
const SEAT = { x: 246, y: 121 };

export class HangarIntro {
  readonly container = new Container();
  /** The hangar, moved and scaled as the camera. */
  #camera = new Container();
  #hangar = new Graphics();
  #pilot = new Graphics();
  #cockpit = new Container();
  /** Through the open canopy: the hangar. The level shows through once the canopy is shut. */
  #outside = new Graphics();
  #panel = new Graphics();
  #keys = new Graphics();
  #cassette = new Container();
  #cassetteBody = new Graphics();
  #reels = new Graphics();
  #hand = new Graphics();
  #canopy = new Graphics();
  #label = new PixelText('', G1);
  #heading = new PixelText('', G6, 2);
  #subhead = new PixelText('', G4);
  #credit = new PixelText('', G4);

  constructor() {
    drawHangar(this.#hangar);
    this.#camera.addChild(this.#hangar, this.#pilot);
    drawPanel(this.#panel);
    drawOutside(this.#outside, 0);
    this.#cassetteBody.rect(0, 0, 120, 38).fill(G4).rect(2, 2, 116, 34).fill(G5);
    this.#cassetteBody.rect(6, 4, 108, 12).fill(G6);
    this.#cassetteBody.rect(30, 20, 60, 12).fill(G1);
    this.#label.place(9, 6);
    this.#cassette.addChild(this.#cassetteBody, this.#reels, this.#label);
    this.#cockpit.addChild(
      this.#outside,
      this.#panel,
      this.#keys,
      this.#cassette,
      this.#hand,
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
    // The label holds 18 characters.
    this.#label.text = title.length > 18 ? title.slice(0, 18) : title;
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
    drawOutside(this.#outside, 0);
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
    drawOutside(this.#outside, frameY);
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

  #drawHangarShot(ms: number): void {
    // The camera closes in on the cockpit as the captain climbs.
    const z = ease(span(ms, ZOOM_START, BOARD_END));
    const scale = lerp(1, 1.8, z);
    this.#camera.pivot.set(lerp(W / 2, SEAT.x - 6, z), lerp(H / 2, SEAT.y + 4, z));
    this.#camera.position.set(W / 2, H / 2);
    this.#camera.scale.set(scale);

    const g = this.#pilot;
    g.clear();
    if (ms < WALK_END) {
      const p = span(ms, 0, WALK_END);
      const x = lerp(-14, LADDER_FOOT.x - 6, p);
      drawPilot(g, x, LADDER_FOOT.y, Math.sin((ms / (2 * STEP_MS)) * Math.PI * 2), 0);
    } else if (ms < CLIMB_END) {
      const p = span(ms, WALK_END, CLIMB_END);
      const x = lerp(LADDER_FOOT.x - 2, LADDER_TOP.x - 2, p);
      const y = lerp(LADDER_FOOT.y, LADDER_TOP.y + 4, p);
      drawPilot(g, x, y, Math.sin((ms / 450) * Math.PI), 1);
    } else if (ms < BOARD_END) {
      // Over the rim and down into the seat: only the helmet stays above it.
      const p = ease(span(ms, CLIMB_END, BOARD_END));
      const x = lerp(LADDER_TOP.x + 2, SEAT.x, p);
      const y = lerp(LADDER_TOP.y + 2, SEAT.y + 10, p);
      drawPilot(g, x, y, 0, 2);
    } else {
      drawPilot(g, SEAT.x, SEAT.y + 10, 0, 2);
    }
    // The cockpit rim in front of a seated captain.
    if (ms >= CLIMB_END) g.rect(SEAT.x - 14, SEAT.y + 1, 30, 4).fill(G4);
  }

  #drawCockpitShot(ms: number): void {
    // The cassette comes in from the right in a gloved hand and slides into the window.
    const inP = ease(span(ms, CASSETTE_IN, INSERTED));
    const cx = lerp(W + 30, 132, inP);
    const cy = lerp(150, 126, inP);
    this.#cassette.position.set(Math.round(cx), Math.round(cy));
    this.#cassette.visible = ms >= CASSETTE_IN;

    // The reels turn once Play is down.
    const r = this.#reels;
    r.clear();
    const turning = ms >= PRESS_AT ? (ms - PRESS_AT) / 1000 : 0;
    for (const rx of [36, 84]) drawReel(r, rx, 26, turning * Math.PI * 2 * 0.8);

    // The hand: holding the cassette, then gone, then over Play and pressing it.
    const h = this.#hand;
    h.clear();
    let hx: number;
    let hy: number;
    if (ms < HAND_OUT) {
      const out = ease(span(ms, INSERTED, HAND_OUT));
      hx = cx + 116 + out * 120;
      hy = cy + 10 + out * 60;
    } else {
      const to = ease(span(ms, TO_PLAY, HOLD_AT));
      hx = lerp(W + 40, PLAY_KEY.x + 8, to);
      hy = lerp(H + 20, PLAY_KEY.y + 4, to);
      if (ms >= PRESS_AT) hy += 2;
    }
    if (ms >= CASSETTE_IN) drawHand(h, Math.round(hx), Math.round(hy), ms >= HAND_OUT);
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

/** The hangar, the fighter and the ladder: drawn once. */
function drawHangar(g: Graphics): void {
  g.rect(0, 0, W, H).fill(G0);
  // The back wall, its girders and beams.
  g.rect(0, 20, W, 150).fill(G1);
  for (let x = 6; x < W; x += 48) g.rect(x, 20, 6, 150).fill(G2);
  g.rect(0, 40, W, 4).fill(G2);
  g.rect(0, 118, W, 2).fill(G2);
  // Roof trusses.
  for (let x = 0; x < W; x += 24) g.moveTo(x, 18).lineTo(x + 12, 6).lineTo(x + 24, 18).stroke({ width: 2, color: G2 });
  g.rect(0, 17, W, 3).fill(G2);
  // Work lights and their cones.
  for (const lx of [96, 192, 288]) {
    g.poly([lx - 44, 170, lx + 44, 170, lx + 6, 26, lx - 6, 26]).fill({ color: 0xffffff, alpha: 0.05 });
    g.ellipse(lx, 178, 48, 6).fill({ color: 0xffffff, alpha: 0.06 });
    g.rect(lx - 1, 20, 2, 4).fill(G3);
    g.poly([lx - 7, 28, lx + 7, 28, lx + 4, 24, lx - 4, 24]).fill(G4);
    g.rect(lx - 5, 28, 10, 1).fill(G6);
  }
  // The floor, its edge, markings, and hazard stripes under the fighter.
  g.rect(0, 170, W, H - 170).fill(G2);
  g.rect(0, 170, W, 1).fill(G4);
  for (let x = 0; x < W; x += 24) g.rect(x, 198, 12, 2).fill(G3);
  for (let x = 170; x < 330; x += 10) g.poly([x, 182, x + 5, 182, x + 9, 176, x + 4, 176]).fill(G3);

  // The fighter, nose right: struts, wing, fuselage, fin, engine, the open canopy.
  g.moveTo(196, 152).lineTo(192, 168).stroke({ width: 2, color: G3 });
  g.moveTo(296, 150).lineTo(300, 168).stroke({ width: 2, color: G3 });
  g.circle(192, 168, 3).fill(G1);
  g.circle(300, 168, 3).fill(G1);
  g.poly([150, 128, 166, 104, 180, 104, 186, 128]).fill(G3);
  g.rect(140, 132, 12, 16).fill(G3);
  g.rect(136, 134, 4, 12).fill(G1);
  g.poly([150, 126, 222, 120, 264, 122, 334, 142, 304, 152, 172, 156, 150, 150]).fill(G4);
  g.poly([152, 127, 222, 121, 264, 123, 300, 133, 264, 126, 222, 124, 154, 130]).fill(G5);
  g.poly([186, 146, 256, 146, 226, 162, 180, 162]).fill(G3);
  g.moveTo(200, 140).lineTo(300, 140).stroke({ width: 1, color: G3 });
  g.moveTo(240, 124).lineTo(240, 150).stroke({ width: 1, color: G3 });
  // The cockpit opening and the canopy, raised on its hinge at the back.
  g.poly([228, 121, 266, 123, 262, 126, 230, 125]).fill(G0);
  g.poly([226, 121, 222, 102, 234, 96, 248, 104, 230, 121]).fill({ color: G5, alpha: 0.5 });
  g.poly([226, 121, 222, 102, 234, 96, 248, 104, 230, 121]).stroke({ width: 1, color: G5 });
  // The ladder against the cockpit rim.
  const { x: fx, y: fy } = LADDER_FOOT;
  const { x: tx, y: ty } = LADDER_TOP;
  // Rails as thin quads: a 1 px diagonal stroke drops out at this resolution.
  for (const dx of [-5, 4]) g.poly([fx + dx, fy, fx + dx + 1.5, fy, tx + dx + 1.5, ty, tx + dx, ty]).fill(G5);
  for (let k = 1; k < 7; k++) {
    const p = k / 7;
    g.rect(Math.round(lerp(fx, tx, p)) - 4, Math.round(lerp(fy, ty, p)), 9, 1).fill(G5);
  }
}

/**
 * The captain at feet (x, y), facing right. `swing` (-1 to 1) moves the legs and arms;
 * `pose` 0 walks, 1 climbs, 2 sits (only the head and shoulders show above the rim).
 */
function drawPilot(g: Graphics, x: number, y: number, swing: number, pose: 0 | 1 | 2): void {
  const hipY = y - 10;
  const neckY = hipY - 9;
  if (pose !== 2) {
    const a = swing * (pose === 1 ? 0.6 : 0.45);
    for (const s of [1, -1]) {
      g.moveTo(x, hipY)
        .lineTo(x + Math.sin(a * s) * 10, hipY + Math.cos(a * s) * 10)
        .stroke({ width: 2, color: s === 1 ? G5 : G4 });
    }
    g.rect(x - 3, neckY, 6, 10).fill(G5);
    const reach = pose === 1 ? -0.9 : 0;
    for (const s of [1, -1]) {
      g.moveTo(x, neckY + 2)
        .lineTo(x + Math.sin(-a * s + reach * 0.3) * 8 + (pose === 1 ? 4 : 0), neckY + 2 + Math.cos(-a * s + reach) * 8)
        .stroke({ width: 2, color: s === 1 ? G5 : G4 });
    }
  } else {
    g.rect(x - 3, neckY, 6, 6).fill(G5);
  }
  // The helmet and its visor.
  g.circle(x, neckY - 4, 4).fill(G6);
  g.rect(x + 1, neckY - 6, 3, 3).fill(G1);
}

/** The deck's keys, left to right: rewind, play, fast forward, stop, eject. */
const KEYS_X = [132, 154, 176, 198, 220];
const PLAY = 1;
/** Where the Play key is on the cockpit panel. */
const PLAY_KEY = { x: KEYS_X[PLAY]!, y: 176 };

/** The hangar seen through the open canopy, from `top` down to the glare shield. */
function drawOutside(g: Graphics, top: number): void {
  g.clear();
  if (top >= SHIELD_Y + 16) return;
  g.rect(0, top, W, SHIELD_Y + 16 - top).fill(G1);
  for (let x = 30; x < W; x += 72) if (x + 8 > 0) g.rect(x, top, 8, SHIELD_Y + 16 - top).fill(G2);
  if (top < 24) g.ellipse(300, 18, 40, 6).fill({ color: 0xffffff, alpha: 0.06 });
}

/** The cockpit panel: glare shield, gauges, lights, and the cassette deck. */
function drawPanel(g: Graphics): void {
  g.clear();
  // The glare shield and the panel.
  g.poly([0, 64, 60, 52, W - 60, 52, W, 64, W, H, 0, H]).fill(G2);
  g.poly([0, 64, 60, 52, W - 60, 52, W, 64, W, 68, W - 60, 56, 60, 56, 0, 68]).fill(G3);
  // Gauges.
  for (const [gx, gy] of [
    [64, 112],
    [320, 112],
  ] as const) {
    g.circle(gx, gy, 22).fill(G1);
    g.circle(gx, gy, 22).stroke({ width: 2, color: G4 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 1.5 + Math.PI * 0.75;
      g.moveTo(gx + Math.cos(a) * 16, gy + Math.sin(a) * 16).lineTo(gx + Math.cos(a) * 20, gy + Math.sin(a) * 20).stroke({ width: 1, color: G4 });
    }
    g.moveTo(gx, gy).lineTo(gx + 12, gy - 10).stroke({ width: 2, color: G6 });
  }
  // A row of indicator lights.
  for (let k = 0; k < 12; k++) g.rect(120 + k * 12, 72, 6, 4).fill(k % 3 === 0 ? G6 : G3);
  // The cassette deck: housing and window.
  g.rect(122, 118, 140, 50).fill(G1);
  g.rect(122, 118, 140, 50).stroke({ width: 1, color: G4 });
  g.rect(128, 122, 128, 44).fill(G0);
}

/** The deck's keys. Play is down once pressed. */
function drawKeys(g: Graphics, playDown: boolean): void {
  g.clear();
  g.rect(122, 170, 140, 20).fill(G1);
  KEYS_X.forEach((kx, i) => {
    const down = i === PLAY && playDown;
    const y = 174 + (down ? 2 : 0);
    g.rect(kx, y, 18, 10).fill(down ? G3 : G4);
    const mx = kx + 9;
    const my = y + 5;
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
    if (i === 4) g.poly([mx - 3, my + 2, mx + 3, my + 2, mx, my - 3]).fill(G1).rect(mx - 3, my + 3, 6, 1).fill(G1);
  });
}

/** A cassette reel hub at (x, y), turned `angle` radians. */
function drawReel(g: Graphics, x: number, y: number, angle: number): void {
  g.circle(x, y, 8).fill(G2);
  g.circle(x, y, 5).fill(G5);
  for (let k = 0; k < 6; k++) {
    const a = angle + (k / 6) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2).lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5).stroke({ width: 1, color: G2 });
  }
}

/**
 * A gloved hand reaching in from the bottom right, its fingertips at (x, y): pointing, or
 * gripping the end of the cassette.
 */
function drawHand(g: Graphics, x: number, y: number, pointing: boolean): void {
  // The dark flight-suit sleeve down to the bottom right, the glove's cuff across it, and
  // the back of the glove.
  g.poly([x + 24, y + 14, x + 36, y, x + 150, y + 100, x + 120, y + 120]).fill(G1);
  g.poly([x + 20, y + 11, x + 32, y - 3, x + 36, y, x + 24, y + 14]).fill(G5);
  g.roundRect(x + 2, y - 5, 22, 16, 4).fill(G4);
  g.rect(x + 6, y - 2, 12, 1).fill(G3);
  if (pointing) {
    // The index finger out to the key, the others curled under, the thumb along the side.
    g.roundRect(x - 6, y - 2, 12, 4, 2).fill(G5);
    g.roundRect(x, y + 3, 8, 6, 2).fill(G3);
    g.roundRect(x + 4, y - 7, 10, 4, 2).fill(G5);
  } else {
    // Four fingers over the cassette's end and the thumb under it.
    for (let k = 0; k < 4; k++) g.roundRect(x - 4, y - 4 + k * 4, 9, 3, 1).fill(k % 2 === 0 ? G5 : G4);
    g.roundRect(x, y + 12, 12, 4, 2).fill(G5);
  }
}
