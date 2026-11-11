// The help screen, from the title menu or the pause menu (docs/DEVELOPMENT.md, "Playing
// it"): a key to what's on screen, drawn with the game's own sprites, and what everything
// scores. Taller than the screen, so it scrolls a row at a time (Scroller in menu.ts).
// The numbers come from @game/core's constants, so the key can't drift from the sim.

import {
  BOOST_MAX_LEVEL,
  ENEMY_HP,
  EnemyKind,
  KILL_POINTS,
  MAX_DRONES,
  MAX_MULTIPLIER,
  MAX_NUKES,
  NUKE_CHARGE_KILLS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  EXTRA_LIFE_POINTS,
  MAX_LIVES,
  SHIELD_BULLET_COST,
  SHIELD_MAX,
  SHIELD_RAM_COST,
  SHIELD_WALL_COST,
  START_LIVES,
  STREAK_STEP,
  SURVIVAL_POINTS_PER_LIFE,
  SHOT_HEIGHT,
  SHOT_WIDTH,
} from '@game/core';
import { Container, Sprite, Texture } from 'pixi.js';
import { getTextures } from '../render/combat.ts';
import { AMBER, CYAN, DIM_GREY, GREY, LIME, MAGENTA, WHITE } from '../render/palette.ts';
import { shipTexture } from '../render/ship.ts';
import { PixelText } from '../render/text.ts';
import { Scroller } from './menu.ts';

const CENTER = PLAYFIELD_WIDTH / 2;
const TOP = 36;
const ROW = 14;
/** Rows that fit between the heading and the bottom edge. */
export const HELP_VISIBLE_ROWS = Math.floor((PLAYFIELD_HEIGHT - 8 - TOP) / ROW);
const ICON_X = 92;
const LABEL_X = 112;
const VALUE_RIGHT = 300;
const BAR_X = 312;

/** What a row shows on the left: textures drawn centred on each other, a coloured bar, or text. */
type Icon =
  | { textures: () => Texture[]; alpha?: number }
  | { bar: number; width: number; height: number }
  | { text: string; color: number };

type HelpRow = { heading: string } | { icon?: Icon; label: string; value?: string; valueColor?: number };

const tex = () => getTextures();

/** The rows, top to bottom. Arcade terse: a label and a value, no sentences. */
export function helpRows(): HelpRow[] {
  const shipKill = KILL_POINTS[EnemyKind.ship];
  return [
    { heading: 'Enemies' },
    { icon: { textures: () => [tex().ship] }, label: 'Ship', value: String(shipKill) },
    { icon: { textures: () => [tex().turret] }, label: 'Turret', value: String(KILL_POINTS[EnemyKind.turret]) },
    {
      icon: { textures: () => [tex().tank] },
      label: `Tank  ${ENEMY_HP[EnemyKind.tank]} hits`,
      value: String(KILL_POINTS[EnemyKind.tank]),
    },
    { heading: 'Shield' },
    {
      icon: { textures: () => [tex().shield, shipTexture()], alpha: 0.8 },
      label: 'Each life',
      value: `${SHIELD_MAX} points`,
      valueColor: GREY,
    },
    { icon: { textures: () => [tex().bullets[EnemyKind.ship]!] }, label: 'Ship bullet', value: `-${SHIELD_BULLET_COST[EnemyKind.ship]}` },
    { icon: { textures: () => [tex().bullets[EnemyKind.tank]!] }, label: 'Tank shell', value: `-${SHIELD_BULLET_COST[EnemyKind.tank]}` },
    { icon: { textures: () => [tex().bullets[EnemyKind.turret]!] }, label: 'Turret shell', value: `-${SHIELD_BULLET_COST[EnemyKind.turret]}` },
    { label: 'Wall', value: `-${SHIELD_WALL_COST}  Bounce` },
    { label: 'Ram', value: `-${SHIELD_RAM_COST}` },
    { label: 'Empty', value: 'Hit loses life', valueColor: MAGENTA },
    { heading: 'Score' },
    { icon: { text: String(shipKill * 2), color: AMBER }, label: 'Kill on the beat', value: 'x2' },
    { icon: { text: 'x2', color: AMBER }, label: `${STREAK_STEP} kills no hit`, value: `+1  Max x${MAX_MULTIPLIER}` },
    { icon: { textures: () => [shipTexture()] }, label: 'Life left at end', value: String(SURVIVAL_POINTS_PER_LIFE) },
    { icon: { textures: () => [tex().nuke] }, label: `${NUKE_CHARGE_KILLS} beat kills`, value: `+1 Nuke  Max ${MAX_NUKES}` },
    { heading: 'Weapons' },
    { icon: { bar: CYAN, width: SHOT_WIDTH, height: SHOT_HEIGHT }, label: 'Shot', value: 'Hold fire', valueColor: GREY },
    { icon: { textures: () => [tex().bomb] }, label: 'Bomb', value: 'Hits tanks', valueColor: GREY },
    { icon: { textures: () => [tex().nuke] }, label: 'Nuke', value: 'Clears screen', valueColor: GREY },
    { heading: 'Power-ups' },
    { icon: { textures: () => [tex().capsules[0]!] }, label: 'Capsule', value: 'Shows next', valueColor: GREY },
    { icon: { textures: () => [tex().doubleIcon] }, label: 'Double', value: 'Angled shot', valueColor: GREY },
    { icon: { textures: () => [tex().missileIcon] }, label: 'Missile', value: 'Air to air', valueColor: GREY },
    { icon: { textures: () => [tex().capsules[2]!] }, label: 'Shield', value: 'Refill', valueColor: GREY },
    { icon: { textures: () => [tex().droneIcon] }, label: 'Drone', value: `Copies fire  Max ${MAX_DRONES}`, valueColor: GREY },
    { icon: { textures: () => [tex().laserIcon] }, label: 'Laser', value: 'Pierces', valueColor: GREY },
    { icon: { textures: () => [tex().boostIcon] }, label: 'Boost', value: `Speed  Max ${BOOST_MAX_LEVEL}`, valueColor: GREY },
    { label: 'Life lost', value: 'Power-ups lost', valueColor: MAGENTA },
    { heading: 'Display' },
    { icon: { textures: () => [tex().doubleIcon], alpha: 1 }, label: 'Top left', value: 'Bright held', valueColor: GREY },
    { icon: { textures: () => [shipTexture()] }, label: 'Lives  Bottom left', value: `${START_LIVES} to start`, valueColor: GREY },
    { icon: { bar: CYAN, width: 6, height: 8 }, label: 'Shield  Bottom right', value: `${SHIELD_MAX} pips`, valueColor: GREY },
    { icon: { text: '1UP', color: LIME }, label: 'Extra life', value: `${EXTRA_LIFE_POINTS}  Max ${MAX_LIVES}`, valueColor: GREY },
    { icon: { textures: () => [tex().bombIcon, tex().bombFill.at(-1)!] }, label: 'Bomb ready', value: 'Fills', valueColor: GREY },
    {
      icon: { textures: () => [tex().missileIcon, tex().missileFill.at(-1)!] },
      label: 'Missile ready',
      value: 'Fills',
      valueColor: GREY,
    },
    { icon: { text: 'x3', color: AMBER }, label: 'Multiplier  By score' },
    { icon: { textures: () => [tex().nuke] }, label: 'Nukes held' },
  ];
}

export class HelpScreen {
  readonly container = new Container();
  readonly scroller: Scroller;
  #rows: Container[] = [];
  #thumb = new Sprite(Texture.WHITE);

  constructor() {
    const shadow = new PixelText('Help', MAGENTA, 2).place(CENTER + 1, 10 + 1, 'center');
    const heading = new PixelText('Help', CYAN, 2).place(CENTER, 10, 'center');
    this.container.addChild(shadow, heading);
    const rows = helpRows();
    this.scroller = new Scroller(rows.length, HELP_VISIBLE_ROWS);
    for (const row of rows) {
      const c = new Container();
      if ('heading' in row) {
        c.addChild(new PixelText(row.heading, CYAN).place(LABEL_X - 20, 0));
      } else {
        if (row.icon) c.addChild(iconOf(row.icon));
        c.addChild(new PixelText(row.label, WHITE).place(LABEL_X, 0));
        if (row.value) c.addChild(new PixelText(row.value, row.valueColor ?? AMBER).place(VALUE_RIGHT, 0, 'right'));
      }
      this.#rows.push(c);
      this.container.addChild(c);
    }
    // The scroll bar: a dim track and a thumb as tall as the share of rows in view.
    const track = new Sprite(Texture.WHITE);
    track.tint = DIM_GREY;
    track.alpha = 0.4;
    track.position.set(BAR_X, TOP - 2);
    track.width = 2;
    track.height = HELP_VISIBLE_ROWS * ROW;
    this.#thumb.tint = GREY;
    this.#thumb.width = 2;
    this.container.addChild(track, this.#thumb);
    this.update();
  }

  /** Places the rows for the scroller's position. */
  update(): void {
    const { top, rows, visible } = this.scroller;
    this.#rows.forEach((c, i) => {
      const slot = i - top;
      c.visible = slot >= 0 && slot < visible;
      c.position.set(0, TOP + slot * ROW);
    });
    const trackHeight = visible * ROW;
    const height = Math.max(4, Math.round((trackHeight * Math.min(visible, rows)) / rows));
    this.#thumb.height = height;
    const span = trackHeight - height;
    this.#thumb.position.set(BAR_X, TOP - 2 + (this.scroller.maxTop === 0 ? 0 : Math.round((span * top) / this.scroller.maxTop)));
  }
}

/** The icon for a row, centred on ICON_X and the text's middle line. */
function iconOf(icon: Icon): Container {
  const c = new Container();
  const midY = 3;
  if ('text' in icon) {
    c.addChild(new PixelText(icon.text, icon.color).place(ICON_X, 0, 'center'));
  } else if ('bar' in icon) {
    const s = new Sprite(Texture.WHITE);
    s.tint = icon.bar;
    s.width = icon.width;
    s.height = icon.height;
    s.position.set(Math.round(ICON_X - icon.width / 2), Math.round(midY - icon.height / 2));
    c.addChild(s);
  } else {
    icon.textures().forEach((t, i) => {
      const s = new Sprite(t);
      if (i === 0 && icon.alpha !== undefined) s.alpha = icon.alpha;
      s.position.set(Math.round(ICON_X - t.width / 2), Math.round(midY - t.height / 2));
      c.addChild(s);
    });
  }
  return c;
}
