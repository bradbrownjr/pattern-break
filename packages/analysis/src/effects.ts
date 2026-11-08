// libopenmpt's internal effect numbering, as returned by
// `OpenMptModule.patternCommand(pattern, row, channel, PatternCommand.effect)` and
// `PatternCommand.volumeEffect`.
//
// Transcribed from libopenmpt 0.8.10, soundlib/modcommand.h (`enum EffectCommand` and
// `enum VolumeCommand`). The numbers are libopenmpt's own, not any file format's: each
// loader converts its format's effects into them. For example ProTracker 1xx is
// `portamentoUp`, Bxx `positionJump`, Cxx `volume`, Dxx `patternBreak`, Fxx `speed` or
// `tempo` (soundlib/MODTools.cpp, `ConvertModCommand`). ProTracker Exy is `modCmdEx` and
// S3M or IT Sxy is `s3mCmdEx`, with the sub-command in the parameter's high nibble. XM, S3M
// and IT also have a volume column, read with `PatternCommand.volumeEffect` and
// `PatternCommand.volume`, where a set volume is `VolumeCommand.volume`.
//
// Recheck this file when the pinned libopenmpt version changes.

/** `enum EffectCommand` (soundlib/modcommand.h). */
export const EffectCommand = {
  none: 0,
  arpeggio: 1,
  portamentoUp: 2,
  portamentoDown: 3,
  tonePortamento: 4,
  vibrato: 5,
  tonePortaVol: 6,
  vibratoVol: 7,
  tremolo: 8,
  panning8: 9,
  offset: 10,
  volumeSlide: 11,
  positionJump: 12,
  volume: 13,
  patternBreak: 14,
  retrig: 15,
  speed: 16,
  tempo: 17,
  tremor: 18,
  modCmdEx: 19,
  s3mCmdEx: 20,
  channelVolume: 21,
  channelVolSlide: 22,
  globalVolume: 23,
  globalVolSlide: 24,
  keyOff: 25,
  fineVibrato: 26,
  panbrello: 27,
  xFinePortaUpDown: 28,
  panningSlide: 29,
  setEnvPosition: 30,
  midi: 31,
  smoothMidi: 32,
  delayCut: 33,
  xParam: 34,
  finetune: 35,
  finetuneSmooth: 36,
  dummy: 37,
  noteSlideUp: 38,
  noteSlideDown: 39,
  noteSlideUpRetrig: 40,
  noteSlideDownRetrig: 41,
  reverseOffset: 42,
  dbmEcho: 43,
  offsetPercentage: 44,
  digiReverseSample: 45,
  volume8: 46,
  hmnMegaArp: 47,
  medSynthJump: 48,
  autoVolumeSlide: 49,
  autoPortaUp: 50,
  autoPortaDown: 51,
  autoPortaUpFine: 52,
  autoPortaDownFine: 53,
  autoPortamentoFc: 54,
  tonePortaDuration: 55,
  volumeDownDuration: 56,
  volumeDownEtx: 57,
} as const;
export type EffectCommand = (typeof EffectCommand)[keyof typeof EffectCommand];

/** `enum VolumeCommand` (soundlib/modcommand.h). */
export const VolumeCommand = {
  none: 0,
  volume: 1,
  panning: 2,
  volSlideUp: 3,
  volSlideDown: 4,
  fineVolUp: 5,
  fineVolDown: 6,
  vibratoSpeed: 7,
  vibratoDepth: 8,
  panSlideLeft: 9,
  panSlideRight: 10,
  tonePortamento: 11,
  portaUp: 12,
  portaDown: 13,
  playControl: 14,
  offset: 15,
} as const;
export type VolumeCommand = (typeof VolumeCommand)[keyof typeof VolumeCommand];
