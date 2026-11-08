// The contract between the libopenmpt WASM binding (src/openmpt.ts) and the analysis
// pipeline (src/analyze.ts). Both sides are written against this file; change it only
// with both sides in view.
//
// Names follow libopenmpt's C API (libopenmpt.h), minus the `openmpt_module_` prefix.

/** `openmpt_module_get_pattern_row_channel_command` command indices (libopenmpt.h). */
export const PatternCommand = {
  note: 0,
  instrument: 1,
  volumeEffect: 2,
  effect: 3,
  volume: 4,
  parameter: 5,
} as const;
export type PatternCommand = (typeof PatternCommand)[keyof typeof PatternCommand];

/** `openmpt_module_set_render_param` parameter ids (libopenmpt.h). */
export const RenderParam = {
  masterGainMillibel: 1,
  stereoSeparationPercent: 2,
  interpolationFilterLength: 3,
  volumeRampingStrength: 4,
} as const;
export type RenderParam = (typeof RenderParam)[keyof typeof RenderParam];

export interface OpenMptModule {
  readonly numChannels: number;
  readonly numOrders: number;
  readonly numPatterns: number;
  readonly numInstruments: number;
  readonly numSamples: number;

  /** `get_metadata`. Returns '' for a missing key. Keys: type, type_long, title, artist, tracker, ... */
  metadata(key: string): string;
  instrumentName(index: number): string;
  sampleName(index: number): string;

  orderPattern(order: number): number;
  patternNumRows(pattern: number): number;
  /** Raw libopenmpt value. Note: 0 none, 1..120 note, 253 fade, 254 cut, 255 key off. */
  patternCommand(pattern: number, row: number, channel: number, command: PatternCommand): number;

  setRenderParam(param: RenderParam, value: number): void;
  /** `ctl_set`, for example ('render.resampler.emulate_amiga', '0'). */
  ctlSet(key: string, value: string): void;
  /** `set_repeat_count`. 0 plays the song once. */
  setRepeatCount(count: number): void;

  /**
   * `read_float_stereo`. Renders up to `frames` frames into the start of `left` and `right`
   * and returns the number rendered; 0 means the song has ended.
   */
  readFloatStereo(sampleRate: number, frames: number, left: Float32Array, right: Float32Array): number;

  /** Playback state after the last read. */
  currentOrder(): number;
  currentPattern(): number;
  currentRow(): number;
  currentSpeed(): number;
  currentTempo(): number;
  channelVuLeft(channel: number): number;
  channelVuRight(channel: number): number;

  durationSeconds(): number;

  /** Frees the native module. The object is unusable afterwards. */
  destroy(): void;
}

export interface OpenMpt {
  /** `openmpt_get_string('library_version')`, for example '0.8.10'. */
  readonly libraryVersion: string;
  /** Throws if libopenmpt can't open the bytes. */
  load(bytes: Uint8Array): OpenMptModule;
}
