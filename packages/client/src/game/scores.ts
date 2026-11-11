// The Scores screen (docs/PLAN.md, "Client UI"): the global boards from the leaderboard
// server. Rows: the board (Arcade, then each song), the difficulty, the player's name, then
// the board's top 10. Left and right change the board or the difficulty; Enter on Name
// opens the name entry; Enter on a player with a link opens it. ScoresMenu is the state, so
// tests run in Node; ScoresScreen draws it.

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

export type ScoresRow = { kind: 'board' } | { kind: 'difficulty' } | { kind: 'name' } | { kind: 'entry'; index: number };

export type ScoresCommand =
  | { type: 'moved' }
  /** The board or difficulty changed: load the board again. */
  | { type: 'changed' }
  | { type: 'name' }
  | { type: 'open'; url: string }
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

  get rows(): ScoresRow[] {
    return [
      { kind: 'board' },
      { kind: 'difficulty' },
      { kind: 'name' },
      ...this.entries.map((_e, index) => ({ kind: 'entry' as const, index })),
    ];
  }

  get row(): ScoresRow {
    return this.rows[Math.min(this.cursor, this.rows.length - 1)]!;
  }

  /** A new board came in; the cursor stays on the rows that still exist. */
  setState(state: BoardState): void {
    this.state = state;
    this.cursor = Math.min(this.cursor, this.rows.length - 1);
  }

  apply(action: MenuAction): ScoresCommand | null {
    const row = this.row;
    switch (action) {
      case 'up':
      case 'down':
        this.cursor = wrap(this.cursor, action === 'up' ? -1 : 1, this.rows.length);
        return { type: 'moved' };
      case 'left':
      case 'right': {
        const step = action === 'left' ? -1 : 1;
        if (row.kind === 'board' && this.boards.length > 1) {
          this.board = wrap(this.board, step, this.boards.length);
          return { type: 'changed' };
        }
        if (row.kind === 'difficulty' && this.difficulties.length > 1) {
          this.difficulty = wrap(this.difficulty, step, this.difficulties.length);
          return { type: 'changed' };
        }
        return null;
      }
      case 'confirm':
        if (row.kind === 'name') return { type: 'name' };
        if (row.kind === 'entry') {
          const link = this.entries[row.index]?.link;
          return link ? { type: 'open', url: link } : null;
        }
        if (row.kind === 'board' || row.kind === 'difficulty') return this.apply('right');
        return null;
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
const LIST_TOP = TOP + 3 * ROW + 6;
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
  #labels = ['Board', 'Difficulty', 'Name'].map((t) => new PixelText(t, GREY));
  #values = [0, 1, 2].map(() => new PixelText('', GREY));
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

  update(menu: ScoresMenu, nickname: string | null | undefined, blinkBright: boolean): void {
    const row = menu.row;
    const values = [menu.choice.label, DIFFICULTY_LABELS[menu.difficultyName], nickname ?? (nickname === null ? 'None' : '-')];
    values.forEach((value, i) => {
      const selected = menu.cursor === i;
      const changeable = i < 2;
      this.#labels[i]!.color = selected ? AMBER : GREY;
      const v = this.#values[i]!;
      v.text = changeable && selected ? `< ${value} >` : changeable ? `  ${value}` : value;
      v.color = selected ? WHITE : GREY;
      v.place(changeable ? VALUE_X - 12 : VALUE_X, TOP + i * ROW);
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
      const selected = row.kind === 'entry' && row.index === i;
      const color = selected ? AMBER : playerColour(entry.mark);
      rank.text = text.rank;
      name.text = entry.link ? `${text.name} *` : text.name;
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

    const link = row.kind === 'entry' && entries[row.index]?.link;
    this.#hint.text = row.kind === 'name' ? 'Enter Edit  Esc Back' : link ? 'Enter Open  Esc Back' : 'Esc Back';
    this.#hint.place(CENTER, 204, 'center');

    this.#marker.visible = blinkBright;
    const markerY = row.kind === 'entry' ? LIST_TOP + row.index * ROW : TOP + menu.cursor * ROW;
    this.#marker.place((row.kind === 'entry' ? RANK_X - 18 : LABEL_X - 10), markerY);
  }
}
