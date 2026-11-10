// Menu sounds, synthesized with Web Audio: short square-wave notes like a chip sound chip
// makes, so there are no sound files to license (docs/PLAN.md, "Visual spec"). Cosmetic:
// they never touch the song clock or the sim. They play through the effects mixer, so the
// Effects setting sets their volume too.

export type MenuSound = 'coin' | 'move' | 'change' | 'select' | 'back' | 'start' | 'secret';

/** Each sound as notes played one after another: [MIDI note, length in ms]. */
export const MENU_SOUNDS: Record<MenuSound, readonly (readonly [number, number])[]> = {
  /** The first key press on the start screen. */
  coin: [
    [83, 70],
    [88, 220],
  ],
  move: [[84, 35]],
  change: [
    [79, 30],
    [86, 45],
  ],
  select: [
    [72, 45],
    [76, 45],
    [79, 45],
    [84, 90],
  ],
  back: [
    [79, 45],
    [72, 70],
  ],
  /** Starting a run or a level. */
  start: [
    [60, 45],
    [64, 45],
    [67, 45],
    [72, 45],
    [76, 45],
    [79, 45],
    [84, 160],
  ],
  /** A secret found: the Konami code, or Impossible. A trill up to a high octave. */
  secret: [
    [84, 40],
    [88, 40],
    [84, 40],
    [88, 40],
    [91, 40],
    [96, 220],
  ],
};

/**
 * Below the music, which plays at 1. The effects volume halves it at its default (4 of 5),
 * giving the 0.1 the menu sounds had before the setting.
 */
const SFX_VOLUME = 0.2;

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class MenuSounds {
  readonly #context: BaseAudioContext;
  readonly #out: GainNode;

  constructor(context: BaseAudioContext, destination: AudioNode = context.destination) {
    this.#context = context;
    this.#out = context.createGain();
    this.#out.gain.value = SFX_VOLUME;
    this.#out.connect(destination);
  }

  play(sound: MenuSound): void {
    const ctx = this.#context;
    let t = ctx.currentTime + 0.005;
    for (const [note, ms] of MENU_SOUNDS[sound]) {
      const length = ms / 1000;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = midiToHz(note);
      // A short attack and an exponential release, so notes don't click.
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + 0.004);
      env.gain.setValueAtTime(1, t + length * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(env);
      env.connect(this.#out);
      osc.start(t);
      osc.stop(t + length + 0.01);
      osc.onended = () => env.disconnect();
      t += length;
    }
  }
}
