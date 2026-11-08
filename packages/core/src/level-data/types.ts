// LevelData: everything the analysis pass extracts from one module. Arrays are
// struct-of-arrays: entry i of a table is field[i] across that table's typed arrays.
// docs/DEVELOPMENT.md, "LevelData", describes the binary format.

export const LEVEL_DATA_FORMAT_VERSION = 1;

/** The analysis parameters a LevelData was made with (see analysis-constants.ts). */
export interface LevelDataParams {
  sampleRate: number;
  chunkFrames: number;
  hopFrames: number;
  fftSize: number;
  bandCount: number;
  bandLowHz: number;
  bandHighHz: number;
  ledLevels: number;
  ledBottomDb: number;
  ledStepDb: number;
  vuScale: number;
  maxDurationSamples: number;
}

export interface LevelDataMeta {
  title: string;
  artist: string;
  /** Short format name from libopenmpt, for example 'mod' or 'it'. */
  type: string;
  tracker: string;
  numChannels: number;
  numOrders: number;
  numPatterns: number;
  numInstruments: number;
  numSamples: number;
  /** libopenmpt's 0-based instrument list: pattern instrument n is instrumentNames[n - 1]. */
  instrumentNames: string[];
  /** libopenmpt's 0-based sample list. */
  sampleNames: string[];
}

/**
 * One entry per row libopenmpt played, in play order. timeSamples is the start of the
 * render chunk after which the row was first seen, so a row's true start is in
 * [timeSamples, timeSamples + chunkFrames).
 */
export interface LevelDataRows {
  timeSamples: Uint32Array;
  order: Uint16Array;
  pattern: Uint16Array;
  row: Uint16Array;
  speed: Uint16Array;
  tempo: Uint16Array;
}

/**
 * One entry per note-on (pattern note 1..120) on a played row, ordered by row and then
 * channel. All values are raw libopenmpt pattern values except resolvedInstrument.
 */
export interface LevelDataNotes {
  timeSamples: Uint32Array;
  channel: Uint8Array;
  /** As written in the pattern; 0 means none. */
  instrument: Uint8Array;
  /** The instrument that plays: `instrument`, or the channel's last nonzero one if 0. */
  resolvedInstrument: Uint8Array;
  note: Uint8Array;
  volume: Uint8Array;
  volumeEffect: Uint8Array;
  effect: Uint8Array;
  effectParam: Uint8Array;
}

/**
 * Analysis frame f is taken after (f + 1) * hopFrames samples have been rendered, over the
 * most recent fftSize samples. Spectrum arrays are frameCount x bandCount, LED levels
 * 0..ledLevels. VU arrays are frameCount x numChannels, 0..vuScale.
 */
export interface LevelDataFrames {
  frameCount: number;
  spectrumLeft: Uint8Array;
  spectrumRight: Uint8Array;
  vuLeft: Uint8Array;
  vuRight: Uint8Array;
}

export interface LevelData {
  formatVersion: number;
  genVersion: number;
  libopenmptVersion: string;
  params: LevelDataParams;
  /** Samples rendered in total. */
  totalSamples: number;
  /** True if rendering stopped at maxDurationSamples instead of at the song's end. */
  hitDurationCap: boolean;
  meta: LevelDataMeta;
  /**
   * orderPatterns[o] is the pattern that order o plays, as libopenmpt reports it. A value
   * of numPatterns or more is not a pattern (libopenmpt's skip and end-of-song markers).
   */
  orderPatterns: Uint16Array;
  rows: LevelDataRows;
  notes: LevelDataNotes;
  frames: LevelDataFrames;
}
