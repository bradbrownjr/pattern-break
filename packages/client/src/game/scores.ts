// The Scores screen (docs/PLAN.md, "Client UI"): the global boards from the leaderboard
// server. Rows: the board (Arcade, then each song) and the difficulty, over the board's top
// 10. Left and right change the board or the difficulty. Names are entered on the end
// screens (name-entry.ts), not here. ScoresMenu is the state, so tests run in Node;
// ScoresScreen draws it.

import { PLAYFIELD_WIDTH, type DifficultyName } from '@game/core';
import { Container } from 'pixi.js';
import { AMBER, CYAN, GREY, MAGENTA, PLAYER_COLOURS, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import type { MenuAction } from './input.ts';
import { DIFFICULTY_LABELS } from './menu.ts';
import type { BoardEntry, BoardView } from './net.ts';

export const BOARD_ROWS = 10;

/** A board to show: the arcade run's, or a song's by its hash. */
export interface BoardChoice {
  /** 'arcade', or the song's SHA-256. */
  name: string;
  label: string;
}

/** What the screen shows of the board: still loading, offline, or what the server sent. */
export type BoardState = { kind: 'loading' } | { kind: 'offline' } | { kind: 'unavailable' } | { kind: 'board'; view: BoardView };

export const SCORES_ROWS = ['board', 'difficulty'] as const;
export type ScoresRow = (typeof SCORES_ROWS)[number];

export type ScoresCommand =
  | { type: 'moved' }
  /** The board or difficulty changed: load the board again. */
  | { type: 'changed' }
  | { type: 'back' };

function wrap(i: number, step: number, count: number): number {
  return (((i + step) % count) + count) % count;
}

export class ScoresMenu {
  readonly boards: readonly BoardChoice[];
  readonly difficulties: readonly DifficultyName[];
  board = 0;
  difficulty: number;
  cursor = 0;
  state: BoardState = { kind: 'loading' };

  constructor(boards: readonly BoardChoice[], difficulties: readonly DifficultyName[], difficulty: DifficultyName) {
    this.boards = boards;
    this.difficulties = difficulties;
    this.difficulty = Math.max(0, difficulties.indexOf(difficulty));
  }

  get choice(): BoardChoice {
    return this.boards[this.board]!;
  }

  get difficultyName(): DifficultyName {
    return this.difficulties[this.difficulty]!;
  }

  get entries(): readonly BoardEntry[] {
    return this.state.kind === 'board' ? this.state.view.top : [];
  }

  get row(): ScoresRow {
    return SCORES_ROWS[this.cursor]!;
  }

  setState(state: BoardState): void {
    this.state = state;
  }

  apply(action: MenuAction): ScoresCommand | null {
    const row = this.row;
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, SCORES_ROWS.length);
        return { type: 'moved' };
      case 'left':
      case 'right': {
        const step = action === 'left' ? -1 : 1;
        if (row === 'board' && this.boards.length > 1) {
          this.board = wrap(this.board, step, this.boards.length);
          return { type: 'changed' };
        }
        if (row === 'difficulty' && this.difficulties.length > 1) {
          this.difficulty = wrap(this.difficulty, step, this.difficulties.length);
          return { type: 'changed' };
        }
        return null;
      }
      case 'confirm':
        return this.apply('right');
      case 'back':
        return { type: 'back' };
    }
  }
}

const CENTER = PLAYFIELD_WIDTH / 2;
const TOP = 30;
const ROW = 11;
const LABEL_X = 96;
const VALUE_X = 168;
const LIST_TOP = TOP + 2 * ROW + 8;
// The list's columns: rank (right-aligned), name, the arcade levels reached, score
// (right-aligned), and the "<" on the player's own row, mirroring the ">" cursor.
const RANK_X = 84;
const NAME_X = 108;
const LEVELS_X = 228;
const SCORE_RIGHT = 300;
const YOU_X = SCORE_RIGHT + 8;

/**
 * One board row: "3", "KC1", "L6", "12345". The levels column shows how far an arcade run
 * got when it ended in a game over, and is empty otherwise, so the scores stay aligned.
 */
export function entryText(entry: BoardEntry, arcade: boolean): { rank: string; name: string; levels: string; score: string } {
  return {
    rank: String(entry.rank),
    name: entry.nickname,
    levels: arcade && !entry.finished ? `L${entry.levels}` : '',
    score: String(entry.score),
  };
}

/** The player's row colour: one of PLAYER_COLOURS, picked by the mark from their key. */
export function playerColour(mark: number): number {
  return PLAYER_COLOURS[(mark >>> 0) % PLAYER_COLOURS.length]!;
}

export class ScoresScreen {
  readonly container = new Container();
  #marker = new PixelText('>', AMBER);
  #labels = ['Board', 'Difficulty'].map((t) => new PixelText(t, GREY));
  #values = [0, 1].map(() => new PixelText('', GREY));
  #rank: PixelText[] = [];
  #name: PixelText[] = [];
  #levels: PixelText[] = [];
  #score: PixelText[] = [];
  #mine = new PixelText('<', CYAN);
  #you = new PixelText('', CYAN);
  #note = new PixelText('', GREY);
  #hint = new PixelText('', CYAN);

  constructor() {
    const shadow = new PixelText('Scores', MAGENTA, 2).place(CENTER + 1, 8 + 1, 'center');
    const heading = new PixelText('Scores', CYAN, 2).place(CENTER, 8, 'center');
    this.container.addChild(shadow, heading, this.#marker, this.#mine, this.#you, this.#note, this.#hint);
    this.#labels.forEach((label, i) => {
      label.place(LABEL_X, TOP + i * ROW);
      this.container.addChild(label, this.#values[i]!);
    });
    for (let i = 0; i < BOARD_ROWS; i++) {
      const rank = new PixelText('', GREY);
      const name = new PixelText('', GREY);
      const levels = new PixelText('', GREY);
      const score = new PixelText('', GREY);
      this.#rank.push(rank);
      this.#name.push(name);
      this.#levels.push(levels);
      this.#score.push(score);
      this.container.addChild(rank, name, levels, score);
    }
  }

  /** `touch`: the touch buttons are on show and say Back themselves. */
  update(menu: ScoresMenu, blinkBright: boolean, touch = false): void {
    const values = [menu.choice.label, DIFFICULTY_LABELS[menu.difficultyName]];
    values.forEach((value, i) => {
      const selected = menu.cursor === i;
      this.#labels[i]!.color = selected ? AMBER : GREY;
      const v = this.#values[i]!;
      v.text = selected ? `< ${value} >` : `  ${value}`;
      v.color = selected ? WHITE : GREY;
      v.place(VALUE_X - 12, TOP + i * ROW);
    });

    const arcade = menu.choice.name === 'arcade';
    const entries = menu.entries;
    const mine = menu.state.kind === 'board' ? menu.state.view.you : null;
    this.#mine.visible = false;
    for (let i = 0; i < BOARD_ROWS; i++) {
      const entry = entries[i];
      const y = LIST_TOP + i * ROW;
      const cells = [this.#rank[i]!, this.#name[i]!, this.#levels[i]!, this.#score[i]!] as const;
      for (const cell of cells) cell.visible = entry !== undefined;
      if (!entry) continue;
      const [rank, name, levels, score] = cells;
      const text = entryText(entry, arcade);
      const color = playerColour(entry.mark);
      rank.text = text.rank;
      name.text = text.name;
      levels.text = text.levels;
      score.text = text.score;
      for (const cell of cells) cell.color = color;
      rank.place(RANK_X, y, 'right');
      name.place(NAME_X, y);
      levels.place(LEVELS_X, y);
      score.place(SCORE_RIGHT, y, 'right');
      if (mine?.rank === entry.rank) {
        this.#mine.visible = true;
        this.#mine.place(YOU_X, y);
      }
    }

    // The player's own place, when it's below the top 10.
    const you = menu.state.kind === 'board' ? menu.state.view.you : null;
    this.#you.visible = you !== null && you.rank > entries.length;
    if (you && this.#you.visible) {
      const text = entryText(you, arcade);
      this.#you.text = `You ${text.rank}  ${text.levels ? `${text.levels}  ` : ''}${text.score}`;
      this.#you.place(CENTER, LIST_TOP + BOARD_ROWS * ROW + 2, 'center');
    }

    const note =
      menu.state.kind === 'loading'
        ? 'Loading'
        : menu.state.kind === 'offline'
          ? 'Offline'
          : menu.state.kind === 'unavailable'
            ? 'Needs HTTPS'
            : entries.length === 0
              ? 'No scores yet'
              : '';
    this.#note.text = note;
    this.#note.color = menu.state.kind === 'board' ? GREY : MAGENTA;
    this.#note.place(CENTER, LIST_TOP + 2 * ROW, 'center');

    this.#hint.text = touch ? '' : 'Esc Back';
    this.#hint.place(CENTER, 204, 'center');

    this.#marker.visible = blinkBright;
    this.#marker.place(LABEL_X - 10, TOP + menu.cursor * ROW);
  }
}
