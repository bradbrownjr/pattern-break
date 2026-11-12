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
      'menu in small pixel type: "Play" in amber with an amber ">" before it, then "Levels" with ' +
      '"The_Epic_Chip", "Difficulty" with "Normal", "Scores", "Jukebox", "Controls", "Settings", "Help" and "Credits", in grey. Under the menu, ' +
      '"Music: The_Epic_Chip by Drozerix"',
    caption: 'The title menu. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'jukebox',
    query: { scene: 'jukebox', song: 'the_epic_chip', t: '12' },
    alt:
      '"Jukebox" in large cyan pixel letters with a magenta shadow over a starfield. Below it, a list of ' +
      'songs in grey pixel type with their authors right-aligned in dim grey: The_Epic_Chip, ' +
      'Neon Techno, RNDD_Keygen#1.0, CHiP_OVERTURE, The_Dim_Dungeon, 4_RNDD!, Girl From Mars, Wrath_of_the_Djinn, ' +
      'Keygen 9000, Crush and Augmented_Emotions; five more songs, "Import" and "Back" are below, out of view, and a thin ' +
      'scroll bar on the right has its grey thumb at the top. The first song is lime with an amber ">" before it. Under the list, a dim ' +
      'row of 24 LED bars, green at the bottom to red at the top, all unlit. At the bottom, "The_Epic_Chip ' +
      'by Drozerix" in grey and "0:12 / 3:48" in cyan.',
    caption: 'The jukebox, playing the first song. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'controls-arrows',
    query: { scene: 'controls-arrows', song: 'the_epic_chip', t: '0' },
    alt:
      '"Controls" in large cyan pixel letters with a magenta shadow. Below it, a drawing of a keyboard: ' +
      'dark keycaps with dim labels, and the keys of this layout filled in colour. Esc is grey; the four ' +
      'arrow keys to the right are white; Z and Space are cyan, X amber, C magenta, V red, and both ' +
      'Shift keys violet. Under it, a legend in two columns, a coloured square before each action: Fly, ' +
      'Arrows; Fire, Z, Space; Bomb, X; Missile, C; Nuke, V; Boost, L Shift, R Shift; Pause, Esc. At the bottom, ' +
      '"< Arrows  WASD  Gamepad >" with "Arrows" in cyan.',
    caption: 'The controls screen, arrows page. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'controls-wasd',
    query: { scene: 'controls-wasd', song: 'the_epic_chip', t: '0' },
    alt:
      'The same keyboard with the other layout lit: Esc grey; W, A, S and D white; J and Space cyan, K ' +
      'amber, L magenta, ; red, and \' and the right Shift violet; the arrow keys dark. The legend reads Fly, WASD; Fire, J, ' +
      'Space; Bomb, K; Missile, L; Nuke, ;; Boost, \', R Shift; Pause, Esc. At the bottom, "< Arrows  WASD  ' +
      'Gamepad >" with "WASD" in cyan.',
    caption: 'The controls screen, WASD page. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'controls-gamepad',
    query: { scene: 'controls-gamepad', song: 'the_epic_chip', t: '0' },
    alt:
      '"Controls" in large cyan pixel letters with a magenta shadow. Below it, a drawing of a gamepad: a ' +
      'dark body with a grip under each end, a white D-pad on the left, a white ring for the left stick ' +
      'and a dim one for the right, two small buttons in the middle with "Start" under the right one, and ' +
      'four round face buttons: Y dim grey at the top, X red on the left, B amber on the right, A cyan at ' +
      'the bottom. Above the body, shoulder buttons: LT and LB violet on the left, RT cyan and RB magenta ' +
      'on the right. Under it, a legend in two columns: Fly, D-pad, Stick; Fire, A, RT; Bomb, B; Missile, ' +
      'RB; Nuke, X; Boost, LB, LT; Pause, Start. At the bottom, "< Arrows  WASD  Gamepad >" with "Gamepad" ' +
      'in cyan.',
    caption: 'The controls screen, gamepad page. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'help',
    query: { scene: 'help', song: 'the_epic_chip', t: '0' },
    alt:
      '"Help" in large cyan pixel letters with a magenta shadow, over a list with a grey scroll bar on ' +
      'the right, its thumb at the top. Cyan section names, then rows of an icon, a white label and a ' +
      'value on the right. Enemies: the magenta ship sprite, Ship, 100 in amber; the turret, Turret, 200; ' +
      'the lime tank, "Tank 3 hits", 300. Shield: the player ship inside a cyan ring, "Each life", "6 ' +
      'points" in grey; a magenta dot, "Ship bullet", -2 in amber; a lime block, "Tank shell", -3; an ' +
      'amber pellet, "Turret shell", -6; no icon, Wall, "-3 Bounce" in amber; no icon, "Falling wall", ' +
      '-3; no icon, Ram, -3.',
    caption: 'The help screen at its top. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'help-end',
    query: { scene: 'help-end', song: 'the_epic_chip', t: '0' },
    alt:
      'The help screen scrolled to its end, the scroll bar thumb at the bottom. Rows of an icon, a white ' +
      'label and a grey value: a white bar, Laser, Pierces; violet chevrons, Boost, "Speed Max 3"; no ' +
      'icon, "Life lost", "Power-ups lost" in magenta. Then the cyan section name Display: a small cyan ' +
      'angled shot, "Top left", "Bright held"; the player ship, "Lives Bottom left", "3 to start"; a cyan ' +
      'block, "Shield Bottom right", "6 pips"; "1UP" in lime, "Extra life", "20000 Max 9"; the amber bomb ' +
      'icon, "Bomb ready", Fills; the missile icon, "Missile ready", Fills; an amber "x3", "Multiplier By ' +
      'score"; the amber nuke icon, "Nukes held".',
    caption: 'The help screen scrolled to its end. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'credits',
    query: { scene: 'credits', song: 'the_epic_chip', t: '18' },
    alt:
      '"Credits" in large cyan pixel letters with a magenta shadow. Under it the roll, 18 seconds in, the ' +
      'Music section\'s heading already gone: song titles in grey with "Drozerix" right-aligned in dim ' +
      'grey, The_Epic_Chip half gone under the heading, then Neon Techno down to Peachy Chip, and Sleepy Snow cut ' +
      'off at the bottom edge of the roll. ' +
      'At the bottom, "Up Down Select" in dim grey.',
    caption: 'The title menu\'s credits, rolling. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'credits-ending',
    query: { scene: 'credits-ending', song: 'the_epic_chip', t: '12' },
    alt:
      'The ending after the last level, 12 seconds into its roll, with no heading: "Thank you for playing" in ' +
      'large cyan letters, "Normal Total 1234560" in amber under it, then "Credits" in large cyan letters ' +
      'and the start of the Music section. At the bottom, "Up Down Select Esc Skip" in dim grey.',
    caption: 'The ending\'s credit roll, opening. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'credits-end',
    query: { scene: 'credits-ending', song: 'the_epic_chip', t: '300' },
    alt:
      'The end of the ending\'s roll: "The End" in large cyan letters in the middle of the screen, the last ' +
      'credit, "Pattern Break" with "MIT", above it, and "Any key Title" in cyan at the bottom.',
    caption: 'The ending\'s credit roll, finished. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'scores',
    query: { scene: 'scores', song: 'the_epic_chip', t: '0' },
    alt:
      '"Scores" in large cyan pixel letters with a magenta shadow. Under it, two rows in small pixel ' +
      'type: "Board" in amber with an amber ">" before it and "< Arcade >" in white, then "Difficulty" ' +
      'with "Normal" in grey. Below, a sample board of eight rows, each a rank, a name and a score ' +
      'right-aligned, each row in its own bright colour: 1 KC1JMH and 48200 in magenta, with a cyan "<" ' +
      'after it marking the viewer\'s own place; 2 AMY in orange; 3 JORDAN in purple, with "L6" in a ' +
      'column between name and score (the run ended on level 6); then W1AW in green, PILOT in pink, NEON ' +
      'in lime, DJINN in red-orange and MARS in cyan, down to 19150. At the bottom, "Esc Back" in cyan.',
    caption: 'The Scores screen with a sample arcade board. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'settings',
    query: { scene: 'settings', song: 'the_epic_chip', t: '0' },
    alt:
      '"Settings" in large cyan pixel letters with a magenta shadow. Below it, eleven rows in small pixel ' +
      'type. "Music" in amber with an amber ">" before it, then "<", five LED cells lit green, ' +
      'yellow-green, yellow, orange and red, and ">". "Effects" in grey with four of its five cells lit ' +
      'and the fifth dim red. Then, all in grey, "Flashing" with "Reduced", "Shake" with "On", "CRT" with ' +
      '"On", "LEDs" with "Neon", "Fullscreen" with "On", "Sync" with "0 ms", "Perf" with "Off", "Keys", ' +
      'and "Back".',
    caption: 'The settings screen at the defaults. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'keys',
    query: { scene: 'keys', song: 'the_epic_chip', t: '0' },
    alt:
      '"Keys" in large cyan pixel letters with a magenta shadow. Under it, "Device" with "< Keyboard >", ' +
      'then a row for each action with its three slots: Up, Up, W, -; Down, Down, S, -; Left, Left, A, -; ' +
      'Right, Right, D, -; Fire, Z, J, Space; Bomb, X, K, -; Missile, C, L, -; Nuke, V, ;, -; Boost, ' +
      'L Shift, \', R Shift; Pause, Esc in dim grey, -, -. "Fire" is amber with an amber ">" before it, ' +
      'and its first slot, Z, is white on a dim grey box. Then "Reset" and "Back", and at the bottom, ' +
      '"Enter Set  Del Clear  Esc Back" in grey.',
    caption: 'The Keys screen at the defaults, on Fire. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-walk',
    query: { scene: 'hangar', song: 'neon_techno', difficulty: 'normal', t: '1.3' },
    alt:
      'A hangar in shades of grey, in pixel art: a dark back wall with steel girders, a row of roof ' +
      'trusses, and three hanging work lights casting cones of light onto a grey floor with a dashed line. ' +
      'Right of centre, a grey fighter faces right on two landing struts over hazard stripes: a long needle ' +
      'nose, a swept fin on top and one underneath at the rear, a light window on its side, and its canopy ' +
      'raised open. A ladder leans against it up to the cockpit. A small pilot in a grey flight suit and a ' +
      'white helmet with a dark visor walks towards it from the left, level with its tail.',
    caption: 'The hangar intro: the captain walks to the fighter. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-climb',
    query: { scene: 'hangar', song: 'neon_techno', difficulty: 'normal', t: '3.6' },
    alt:
      'The grey hangar, closer in on the fighter. The pilot in the white helmet is near the top of the ' +
      'ladder, one arm reaching up, just below the raised canopy and the dark cockpit opening.',
    caption: 'The hangar intro: the captain climbs the ladder. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-cockpit',
    query: { scene: 'hangar', song: 'neon_techno', difficulty: 'normal', t: '6.3' },
    alt:
      'Inside the cockpit, in shades of grey, in pixel art. Through the open canopy at the top, the dark ' +
      'hangar wall and its girders. Below, a riveted instrument panel: a row of small indicator lights, two ' +
      'round gauges, a toggle switch, and in the middle a cassette deck, its door tilted open forward on ' +
      'its bottom hinge, showing the dark deck and its two spindles behind it; under it, five keys marked ' +
      'rewind, play, fast forward, stop and eject. A padded grey glove on a dark sleeve reaches in from ' +
      'the right holding a cassette by its end, on its way into the open door: a dark shell, a white label ' +
      'reading "Neon Techno" with a window across it showing two hubs, and a raised strip along the ' +
      'bottom with small openings.',
    caption: 'The hangar intro: the cassette goes into the open deck. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-play',
    query: { scene: 'hangar', song: 'neon_techno', difficulty: 'normal', t: '8.2' },
    alt:
      'The cockpit with the cassette in the deck: through the door\'s window, its label reading "Neon Techno" ' +
      'and its two hubs. Above the panel, "Level 1" in large white pixel letters, "Neon Techno" in ' +
      'light grey, and "by Drozerix  Normal" in grey. The glove, coming in from the bottom ' +
      'right, presses the Play key with its index finger, covering the keys to its right.',
    caption: 'The hangar intro: Play pressed. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-clip',
    query: { scene: 'hangar', song: 'neon_techno', difficulty: 'normal' },
    clip: { from: 0, to: 8.3, fps: 10 },
    alt:
      'Eight seconds in shades of grey, in pixel art. A pilot in a white helmet walks across a hangar to a ' +
      'fighter with a needle nose and its canopy open, climbs the ladder as the view closes in on the ' +
      'cockpit, and drops into the seat until only the helmet shows. The view cuts to the instrument panel: ' +
      'a gloved finger presses the deck\'s eject key and the door tips open forward; the glove brings in a ' +
      'cassette labelled "Neon Techno", lays it in the open door and pulls away, then a finger pushes the ' +
      'door shut, leaving the label and hubs showing through the door\'s window. "Level 1", "Neon Techno", ' +
      'the credit and "Normal" appear above the panel, the finger presses Play, and the hubs start ' +
      'to turn.',
    caption: 'The hangar intro from the start to Play. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'hangar-alarm',
    query: { scene: 'hangar', song: 'crush', difficulty: 'impossible', t: '1.0' },
    alt:
      'The grey pixel-art hangar of the intro washed in dark red: the back wall, the roof trusses, three ' +
      'work lights with their cones of light, the fighter with its canopy open and the ladder against it, ' +
      'and the small pilot in a white helmet walking towards it from the left. Every shade is tinted red, ' +
      'the darks a deep maroon and the lights a pale pink.',
    caption: 'The hangar intro on Impossible, at a flash of the red strobe. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'impossible',
    query: { scene: 'play', song: 'crush', difficulty: 'impossible', t: '12', seed: '1' },
    alt:
      'A frame of play in an LED cavern lit only in red: the columns hanging from the top and rising from ' +
      'the bottom are dark maroon at the screen edges, brightening to vivid red at their tips. Dim ' +
      'horizontal bands of violet, teal and olive cross the dark passage behind them. The small cyan ship ' +
      'on the left is inside a cyan ring, its shield, with cyan shots ahead of it and small magenta ' +
      'bullets scattered around it. Two magenta enemy ships fly in on the right, where "300" shows twice ' +
      'in white, overlapping, over a scatter of specks where enemies were destroyed; a turret hangs from ' +
      'the ceiling at the top right. In the HUD, a row of small power-up icons on a dark panel in the top ' +
      'left corner, bright for what the ship has and faint for the rest, ending in three faint nuke ' +
      'icons; "x3" in amber and "0008100" in the top right; three ship icons for the lives in the bottom ' +
      'left; six cyan shield pips in the bottom right.',
    caption: 'Crush on Impossible, 12 seconds in, flown by the autopilot. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'run-start',
    query: { scene: 'run-start', song: 'neon_techno', difficulty: 'normal', t: '0.25' },
    alt:
      'The start of level 1. In the top sixth of the screen, through the cockpit glass, the LED cavern ' +
      'with its columns in pale, washed-out greens, the HUD\'s row of power-up icons faint at the top left ' +
      'and the score at the top right. Under it, a dark canopy frame with a light edge crosses the screen ' +
      'on its way down. Below it, the grey instrument panel as before Play: two round gauges, the ' +
      'cassette labelled "Neon Techno" in the deck, and the glove on the Play key.',
    caption: 'Level 1 a quarter of a second after Play: the canopy closing over the grey level. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'paused',
    query: { scene: 'paused', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1' },
    alt:
      'A frame of play in an LED cavern, dim horizontal bands of colour across its passage, with a dark ' +
      'translucent panel in the middle. On the panel, "Paused" in large amber pixel letters, and below it ' +
      'a menu: "Resume" in amber with an amber ">" before it, then "Controls", "Help" and "Quit" in grey. ' +
      'The player ship on the left is inside a faint cyan ring, its shield, with cyan shots ahead; "200" ' +
      'in white on the right where an enemy was destroyed, and an amber-framed capsule on a floor tip. In ' +
      'the HUD, a row of small power-up icons on a dark panel in the top left corner, bright for what the ' +
      'ship has and faint for the rest, ending in three faint nuke icons; "x2" in amber and "0002000" in ' +
      'the top right; three ship icons for the lives in the bottom left; six cyan shield pips in the ' +
      'bottom right.',
    caption: 'The pause menu over play. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'copper',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.9', difficulty: 'normal', seed: '1' },
    alt:
      'A frame of play in an LED cavern lit green to red. Soft horizontal bands of colour, the copper ' +
      'bars, cross the screen behind the columns: violet near the top, then teal, olive, and amber near ' +
      'the bottom, each darker at its edges and brightest in its middle, showing through the gaps between ' +
      'LED segments. Near the left, a few orange specks fly down from the tip of a ceiling column and a ' +
      'few red specks up from the tip of a floor column below it: sparks on a note. The cyan ship flies ' +
      'inside its shield ring, its shots ahead, two turrets hang from the ceiling, and an amber-framed ' +
      'capsule sits on a floor tip in the middle.',
    caption: 'Copper bars glowing with the bass, and sparks off the LED tips on a note, at 21.9 seconds. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'crt',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.9', difficulty: 'normal', seed: '1', crt: '1' },
    alt:
      'The same frame as the copper bars shot with the CRT setting on. Bright pixels glow softly into the dark ' +
      'gaps between the LED segments, every row of game pixels has a faint dark line along its bottom like ' +
      'a television screen, and the corners are a little darker than the middle.',
    caption: 'The copper shot with the CRT setting on: bloom, scanlines and a vignette. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'results',
    query: { scene: 'results', song: 'pb-fixture-01', t: '40', difficulty: 'normal', seed: '1' },
    alt:
      'A dark translucent panel over a frame of play. "Song clear" in large lime pixel letters, then in ' +
      'small grey type "pb fixture 01, Normal" and four rows with labels on the left and numbers lined up ' +
      'on the right: "Kills 29" 6300, "Beat bonus" 200, "Score" 6500, and in amber "New best" 6500. Below ' +
      'them "R Replay  S Save" in grey and "Any key Title" in cyan.',
    caption: 'The results over play, as if the test song ended at 40 seconds, the score a new best. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'colour-blind',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1', leds: 'colourBlind' },
    alt:
      'The gameplay frame with the LED columns in blue, grey and yellow instead of green to red: dark blue at ' +
      'the screen edges, through slate and khaki greys, to bright yellow at the tips, each segment brighter ' +
      'than the one before. The ship, enemies, shots, copper bars and HUD are as in the gameplay shot.',
    caption: 'The gameplay shot with the LEDs setting on Colour-blind. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'explosion',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1', boom: '200' },
    alt:
      'A frame of play in an LED cavern, columns of LED segments lit green to red hanging from the top ' +
      'and rising from the bottom. On the left, where the ship was, a scatter of single cyan, white, ' +
      'magenta and amber pixels flies apart inside a large thin ring of dots, magenta along the top, teal ' +
      'on the right, lime at the bottom and amber on the left, over soft horizontal bands of violet, teal ' +
      'and olive. Cyan shots fly on to the right, past "200" in white where an enemy was destroyed. The ' +
      'power-up icons, "x2" and the score are at the top, three ship icons at the bottom left, and the ' +
      'six shield pips at the bottom right, all dark now.',
    caption: 'The ship breaking apart, 200 ms after it blew up. Not used in the README.',
    usedIn: [],
  },
  {
    id: 'gameplay',
    query: { scene: 'play', song: 'pb-fixture-01', t: '21.5', difficulty: 'normal', seed: '1' },
    alt:
      'A frame of play in an LED cavern. Columns of small square LED segments hang from the top edge and ' +
      'rise from the bottom edge, lit green at the screen edges through yellow and orange to red at their ' +
      'tips, leaving a dark passage across the middle, crossed by soft horizontal bands of violet, teal, ' +
      'olive and amber, the copper bars. Two small magenta and amber turrets hang upside down from tips ' +
      'of the ceiling. A small cyan ship with a magenta engine flame flies on the left inside a faint ' +
      'cyan ring, its shield, with a row of cyan shots ahead of it, and "200" in white pixel digits on ' +
      'the right where an enemy was just destroyed. An amber-framed capsule showing a white and cyan orb, ' +
      'the next power-up, sits on a floor tip. In the HUD, a row of small power-up icons on a dark panel ' +
      'in the top left corner, bright for what the ship has and faint for the rest, ending in three faint ' +
      'nuke icons; here the bomb, the missile and the angled double shot are bright. "x2" in amber and ' +
      '"0002000" in white are in the top right corner; three small ship icons for the lives are in the ' +
      'bottom left; six cyan shield pips are in the bottom right.',
    caption: 'Pattern Break at 21.5 seconds into the test song on normal, with the ship flown by the autopilot.',
    usedIn: ['readme'],
  },
  {
    id: 'gameplay-clip',
    query: { scene: 'play', song: 'pb-fixture-01', difficulty: 'normal', seed: '1' },
    clip: { from: 29, to: 33, fps: 25 },
    alt:
      'Four seconds of play in an LED cavern. Columns of square LED segments, lit green at the screen ' +
      'edges through yellow and orange to red at their tips, hang from the top and rise from the bottom ' +
      'and scroll from right to left, one column per row of the song. Behind them, soft horizontal bands ' +
      'of teal, olive, amber and violet sway up and down and glow brighter with the bass. A small cyan ' +
      'ship on the left, inside a faint cyan ring that is its shield, with a small glowing drone orb ' +
      'beside it, fires rows of cyan shots, angled shots and missiles at magenta enemy ships flying in ' +
      'from the right and dodges up and down. Turrets ride in on the column tips and fire amber pellets, ' +
      'and each kill bursts into coloured specks with its points in white digits. Amber-framed capsules ' +
      'showing a laser icon scroll past. In the HUD, a row of small power-up icons on a dark panel in the ' +
      'top left corner, bright for what the ship has and faint for the rest, ending in three faint nuke ' +
      'icons; "x3" in amber and the score counting up from 4100 to 5600 in the top right; three ship ' +
      'icons for the lives in the bottom left; six cyan shield pips in the bottom right.',
    caption: 'Four seconds of the test song on normal, flown by the autopilot through the sim.',
    usedIn: ['readme'],
  },
];
