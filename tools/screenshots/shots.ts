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
      '"The_Epic_Chip", "Difficulty" with "Normal", "Jukebox", "Controls" and "Settings", in grey. Under the menu, ' +
      '"Music: The_Epic_Chip by Drozerix. Public Domain."',
    caption: 'The title menu. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'jukebox',
    query: { scene: 'jukebox', song: 'the_epic_chip', t: '12' },
    alt:
      '"Jukebox" in large cyan pixel letters with a magenta shadow over a starfield. Below it, a list of ' +
      'nine songs in grey pixel type with their authors right-aligned in dim grey: The_Epic_Chip, Numen in ' +
      'Da Chip, FastLane, CHiP_OVERTURE, The_Dim_Dungeon, 4_RNDD!, Girl From Mars, Wrath_of_the_Djinn and ' +
      'Keygen 9000, then "Back". The first song is lime with an amber ">" before it. Under the list, a dim ' +
      'row of 24 LED bars, green at the bottom to red at the top, all unlit. At the bottom, "The_Epic_Chip ' +
      'by Drozerix. Public Domain." in grey and "0:12 / 3:48" in cyan.',
    caption: 'The jukebox, playing the first song. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'controls-keyboard',
    query: { scene: 'controls-keyboard', song: 'the_epic_chip', t: '0' },
    alt:
      '"Controls" in large cyan pixel letters with a magenta shadow. Below it, a drawing of a keyboard: ' +
      'dark keycaps with dim labels, and the keys the game uses filled in colour. Esc is grey; W, A, S, D ' +
      'and the four arrow keys to the right are white; Space, Z and J are cyan; X and K amber; C and L ' +
      'magenta; V and ; red; F and \' lime; both Shift keys violet. Under it, a legend in two columns, a ' +
      'coloured square before each action: Fly, Arrows, WASD; Fire, Space, Z, J; Bomb, X, K; Missile, C, L; ' +
      'Nuke, V, ;; Buy, F, \'; Boost, Shift; Pause, Esc. At the bottom, "< Keyboard  Gamepad >" with ' +
      '"Keyboard" in cyan.',
    caption: 'The controls screen, keyboard page. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'controls-gamepad',
    query: { scene: 'controls-gamepad', song: 'the_epic_chip', t: '0' },
    alt:
      '"Controls" in large cyan pixel letters with a magenta shadow. Below it, a drawing of a gamepad: a ' +
      'dark body with a grip under each end, a white D-pad on the left, a white ring for the left stick ' +
      'and a dim one for the right, two small buttons in the middle with "Start" under the right one, and ' +
      'four round face buttons: Y lime at the top, X red on the left, B amber on the right, A cyan at the ' +
      'bottom. Above the body, shoulder buttons: LT and LB violet on the left, RT cyan and RB magenta on the ' +
      'right. Under it, a legend in two columns: Fly, Stick, D-pad; Fire, A, RT; Bomb, B; Missile, RB; Nuke, ' +
      'X; Buy, Y; Boost, LB, LT; Pause, Start. At the bottom, "< Keyboard  Gamepad >" with "Gamepad" in cyan.',
    caption: 'The controls screen, gamepad page. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'settings',
    query: { scene: 'settings', song: 'the_epic_chip', t: '0' },
    alt:
      '"Settings" in large cyan pixel letters with a magenta shadow. Below it, three rows in small pixel ' +
      'type. "Music" in amber with an amber ">" before it, then "<", five LED cells lit green, yellow-green, ' +
      'yellow, orange and red, and ">". "Effects" in grey with four of its five cells lit and the fifth dim ' +
      'red. "Back" in grey.',
    caption: 'The settings screen at the default volumes. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'paused',
    query: { scene: 'paused', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1' },
    alt:
      'A frame of play in an LED cavern, with a dark translucent panel in the middle. On the panel, ' +
      '"Paused" in large amber pixel letters, and below it a menu: "Resume" in amber with an amber ">" ' +
      'before it, then "Controls" and "Quit" in grey. The HUD shows three ship icons, a bomb icon ' +
      'and "x2" in the top left, the score "0002200" in the top right, and the power-up meter along the ' +
      'bottom edge, all six cells dark.',
    caption: 'The pause menu over play. Not used in the README.',
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
      'shots ahead of it. In the middle, a scatter of coloured particles where an enemy was just destroyed, ' +
      'with "200" in white pixel digits above it, and an amber capsule marked "P" falling below it towards the ' +
      'floor; another "200" marks a kill on the right. Three small ship icons on a dark panel in the top left ' +
      'corner show the lives left, followed by a small amber bomb icon and "x2" in amber; "0002200" in white in ' +
      'the top right corner is the score. Along the bottom edge runs the power-up meter, six dark LED cells ' +
      'labelled Boost, Double, Laser, Missile, Drone and Shield.',
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
      'magenta bullets. A small cyan ship on the left keeps firing cyan shots, drops a bomb that bursts on ' +
      'the floor, and moves up and down to dodge. Amber capsules marked "P" rest on the floor bars and scroll ' +
      'away with them. Three ship icons in the top left corner show the lives left, followed by a bomb icon ' +
      'and "x3" in amber, and the score in the top right corner counts up as each kill shows its points ' +
      'where the enemy was. Along the bottom edge runs the power-up meter, six dark LED cells labelled ' +
      'Boost, Double, Laser, Missile, Drone and Shield.',
    caption: 'Four seconds of the test song on normal, flown by the autopilot through the sim.',
    usedIn: ['readme'],
  },
];
