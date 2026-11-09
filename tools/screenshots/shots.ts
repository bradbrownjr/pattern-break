// The screenshot manifest. `pnpm screenshots` regenerates every figure listed here.
// Fields and the capture-mode parameters are described in docs/DEVELOPMENT.md, "Screenshots".

export interface Clip {
  /** Song time of the first frame, in seconds. */
  from: number;
  /** Song time the clip ends at, in seconds; the last frame is before it. */
  to: number;
  /** Frames per second. Pick one that divides 100: GIF frame delays are whole hundredths of a second. */
  fps: number;
}

export interface Shot {
  /**
   * File name stem: the image is written to docs/img/<id>.png, or docs/img/<id>.gif for a
   * clip. Lowercase letters, digits, hyphens.
   */
  id: string;
  /** Capture-mode query parameters. `capture=1` is added by the script, and `t` for a clip. */
  query: Record<string, string>;
  /** Makes the shot an animated GIF of the frames from `from` to `to` (song seconds). */
  clip?: Clip;
  /**
   * Viewport in CSS pixels. Default 1152x648 for a still and 768x432 for a clip: exact
   * multiples of the 384x216 internal resolution, so pixels stay square.
   */
  viewport?: { width: number; height: number };
  /** CSS selector to crop to. Default is the whole viewport. */
  element?: string;
  /** Describes what is on screen, for people who cannot see the image. */
  alt: string;
  caption: string;
  /** Where the figure is used. Empty means a test sample only. */
  usedIn: ('readme' | 'docs')[];
}

export const DEFAULT_VIEWPORT = { width: 1152, height: 648 };
export const DEFAULT_CLIP_VIEWPORT = { width: 768, height: 432 };

export const shots: Shot[] = [
  {
    id: 'title-screen',
    query: { scene: 'title', song: 'the_epic_chip', difficulty: 'normal', t: '0' },
    alt:
      'The title screen on a near-black background with faint blue stars. "Pattern Break" in large cyan pixel ' +
      'letters with a magenta shadow, over a row of small LED segments shading from green to red. Below it, a ' +
      'menu in small pixel type: "Play" in amber with an amber ">" before it, then "Practice" with ' +
      '"The_Epic_Chip", "Difficulty" with "Normal", and "Jukebox", in grey. Under the menu, "Music: ' +
      'The_Epic_Chip by Drozerix. Public Domain.", and at the bottom two lines of help: "Up and down choose. ' +
      'Left and right change. Enter selects." and "In play: arrows or WASD fly, Space or Z fires, Esc pauses."',
    caption: 'The title menu. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'gameplay',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1' },
    alt:
      'A frame of play in an LED cavern. Columns of small square LED segments hang from the top edge and rise ' +
      'from the bottom edge, lit green at the screen edges through yellow and orange to red at their tips, ' +
      'leaving a dark passage across the middle. Two small magenta and amber turrets sit upside down on the ' +
      'tips of the ceiling. A small cyan ship with a magenta engine flame flies on the left, with a row of cyan ' +
      'shots ahead of it and a scatter of coloured particles where an enemy was just destroyed. Three small ' +
      'ship icons on a dark panel in the top left corner show the lives left.',
    caption: 'Pattern Break at 21.5 seconds into the test song on normal, with the ship flown by the autopilot.',
    usedIn: ['readme'],
  },
  {
    id: 'gameplay-clip',
    query: { scene: 'play', song: 'pb-fixture-01', difficulty: 'normal', seed: '1' },
    clip: { from: 29, to: 33, fps: 25 },
    alt:
      'Four seconds of play in an LED cavern. Columns of square LED segments, lit green at the screen edges ' +
      'through yellow and orange to red at their tips, hang from the top and rise from the bottom and scroll ' +
      'from right to left, one column per row of the song. Small magenta and amber turrets ride in on the ' +
      'tips of the floor and ceiling, and small magenta enemy ships fly in from the right and fire round ' +
      'magenta bullets. A small cyan ship on the left keeps firing cyan shots and moves up and down to dodge. ' +
      'Three ship icons in the top left corner show the lives left.',
    caption: 'Four seconds of the test song on normal, flown by the autopilot through the sim.',
    usedIn: ['readme'],
  },
];
