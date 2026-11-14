// The results after a level or a game over (docs/PLAN.md, "Scoring"): the score broken
// down, and the personal best for the song and difficulty, kept in this browser's
// localStorage like the settings. A run with a cheat never sets a best.

import type { SimState } from '@game/core';

export interface ScoreBreakdown {
  kills: number;
  /** Points for enemies shot down, with the streak multiplier, without the beat's doubling. */
  killPoints: number;
  /** What shooting on the beat added: half of each on-beat kill's points. */
  beatBonus: number;
  /** The survival bonus for the lives left at the song's end (0 on a game over). */
  livesBonus: number;
  score: number;
}

/**
 * `state`'s score broken down. The sim adds to the score only for a kill (its points in
 * enemyPoints, doubled when enemyOnBeat) and for the lives left at the end, so the parts
 * add up to the score.
 */
export function scoreBreakdown(state: SimState): ScoreBreakdown {
  let points = 0;
  let beat = 0;
  for (let i = 0; i < state.enemyPoints.length; i++) {
    const p = state.enemyPoints[i]!;
    points += p;
    if (state.enemyOnBeat[i]) beat += p / 2;
  }
  return { kills: state.kills, killPoints: points - beat, beatBonus: beat, livesBonus: state.survivalBonus, score: state.score };
}

/** The end screens' replay keys. */
export const REPLAY_HINT = 'R Replay  S Save';
/** The end screens' replay buttons on a gamepad. */
export const REPLAY_HINT_PAD = 'Y Replay  X Save';

/** The replay keys for the keyboard, or the buttons for a gamepad (`pad`). */
export function replayHint(pad: boolean): string {
  return pad ? REPLAY_HINT_PAD : REPLAY_HINT;
}

const KEY = 'pattern-break.bests';

export function bestKey(songId: string, difficulty: string): string {
  return `${songId}:${difficulty}`;
}

function readBests(storage: Pick<Storage, 'getItem'> | null): Record<string, number> {
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** The best score kept for `key`, or null. */
export function loadBest(storage: Pick<Storage, 'getItem'> | null, key: string): number | null {
  return readBests(storage)[key] ?? null;
}

/**
 * Records `score` for `key` if it beats the best (a cheat never does). Returns the best
 * before this run and whether this run is the new one. A failed write is ignored: the
 * best then lasts until the page closes only in what was shown.
 */
export function recordBest(storage: Storage | null, key: string, score: number, cheats: boolean): { previous: number | null; isNew: boolean } {
  const bests = readBests(storage);
  const previous = bests[key] ?? null;
  const isNew = !cheats && score > 0 && (previous === null || score > previous);
  if (isNew) {
    bests[key] = score;
    try {
      storage?.setItem(KEY, JSON.stringify(bests));
    } catch {
      // Storage is blocked or full.
    }
  }
  return { previous, isNew };
}

/** Width of a results row in characters: the font is monospaced, so the numbers line up. */
export const RESULT_WIDTH = 20;

/** `label` and `value` as one results row, the value at the right. */
export function resultRow(label: string, value: number | string): string {
  const v = String(value);
  return label + ' '.repeat(Math.max(1, RESULT_WIDTH - label.length - v.length)) + v;
}

/** The results rows: the breakdown, the score, and the best. */
export function resultRows(b: ScoreBreakdown, best: { previous: number | null; isNew: boolean }): string[] {
  const rows = [resultRow(`Kills ${b.kills}`, b.killPoints), resultRow('Beat bonus', b.beatBonus)];
  if (b.livesBonus > 0) rows.push(resultRow('Lives bonus', b.livesBonus));
  rows.push(resultRow('Score', b.score));
  rows.push(best.isNew ? resultRow('New best', b.score) : resultRow('Best', best.previous ?? '-'));
  return rows;
}
