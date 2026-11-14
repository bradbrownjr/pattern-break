// The Sync screen, from Settings: clicks play and the player presses on each one; then the
// offset it measured (audio/sync.ts). There's no beat to watch, so the player goes by ear.

import { PLAYFIELD_WIDTH } from '@game/core';
import { Container } from 'pixi.js';
import { SYNC_PRESSES, SYNC_WARMUP, type SyncResult } from '../audio/sync.ts';
import { AMBER, CYAN, GREY, MAGENTA, WHITE } from '../render/palette.ts';
import { PixelText } from '../render/text.ts';
import { syncText } from './screens.ts';

const CENTER = PLAYFIELD_WIDTH / 2;

/** The screen's state: presses so far while the clicks play, then the result (null: too uneven). */
export type SyncView =
  | { phase: 'running'; presses: number }
  | { phase: 'result'; result: SyncResult | null; was: number };

/** The progress while the clicks play: "Warm-up" for the presses that don't count, then "5/16". */
export function syncProgress(presses: number): string {
  return presses < SYNC_WARMUP ? 'Warm-up' : `${Math.min(presses - SYNC_WARMUP, SYNC_PRESSES)}/${SYNC_PRESSES}`;
}

export const SYNC_PROMPT_RUNNING = 'Esc Back';
export const SYNC_PROMPT_RESULT = 'Enter Keep  R Retry  Esc Back';
export const SYNC_PROMPT_FAILED = 'R Retry  Esc Back';
/** The same prompts with a gamepad's buttons. */
export const SYNC_PROMPT_RUNNING_PAD = 'B Back';
export const SYNC_PROMPT_RESULT_PAD = 'A Keep  Y Retry  B Back';
export const SYNC_PROMPT_FAILED_PAD = 'Y Retry  B Back';

export class SyncScreen {
  readonly container = new Container();
  #hint = new PixelText('Press on each click', GREY).place(CENTER, 76, 'center');
  #big = new PixelText('', WHITE, 2);
  #detail = new PixelText('', GREY);
  #was = new PixelText('', GREY);
  #prompt = new PixelText('', CYAN);
  #shown: { view: SyncView; touch: boolean } | null = null;

  constructor() {
    const shadow = new PixelText('Sync', MAGENTA, 2).place(CENTER + 1, 40 + 1, 'center');
    const heading = new PixelText('Sync', CYAN, 2).place(CENTER, 40, 'center');
    this.container.addChild(shadow, heading, this.#hint, this.#big, this.#detail, this.#was, this.#prompt);
  }

  /**
   * `touch`: the touch buttons are on show and name what they do, so the keys are left out.
   * `pad`: the last press was a gamepad's, so the prompt names its buttons.
   */
  update(view: SyncView, touch = false, pad = false): void {
    this.#shown = { view, touch };
    if (view.phase === 'running') {
      this.#hint.visible = true;
      this.#big.text = syncProgress(view.presses);
      this.#big.color = view.presses < SYNC_WARMUP ? GREY : WHITE;
      this.#detail.text = '';
      this.#was.text = '';
      this.#prompt.text = pad ? SYNC_PROMPT_RUNNING_PAD : SYNC_PROMPT_RUNNING;
    } else if (view.result) {
      this.#hint.visible = false;
      this.#big.text = `Offset ${syncText(view.result.offsetMs)}`;
      this.#big.color = AMBER;
      this.#detail.text = `Spread ${view.result.spreadMs} ms`;
      this.#was.text = `Was ${syncText(view.was)}`;
      this.#prompt.text = pad ? SYNC_PROMPT_RESULT_PAD : SYNC_PROMPT_RESULT;
    } else {
      this.#hint.visible = false;
      this.#big.text = 'Too uneven';
      this.#big.color = MAGENTA;
      this.#detail.text = '';
      this.#was.text = '';
      this.#prompt.text = pad ? SYNC_PROMPT_FAILED_PAD : SYNC_PROMPT_FAILED;
    }
    this.#big.place(CENTER, 100, 'center');
    this.#detail.place(CENTER, 126, 'center');
    this.#was.place(CENTER, 140, 'center');
    if (touch) this.#prompt.text = '';
    this.#prompt.place(CENTER, 176, 'center');
  }

  /** Draws the screen again with the keyboard's prompt or a gamepad's (`pad`). */
  setPad(pad: boolean): void {
    if (this.#shown) this.update(this.#shown.view, this.#shown.touch, pad);
  }
}
