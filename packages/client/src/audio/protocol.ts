// Messages between the player (main thread) and the libopenmpt AudioWorklet processor, which
// plays a module (a song file made in a music tracker).
// Frame counts are at the context's sample rate, which the player requires to be 48 000 Hz.
// Requests carry an id; the reply they cause carries the same id.

/** The processor's registered name. */
export const PROCESSOR_NAME = 'pattern-break-libopenmpt';

/** Passed as `processorOptions` when the AudioWorkletNode is created. */
export interface ProcessorOptions {
  /** The bytes of libopenmpt.wasm. An AudioWorklet can't fetch them itself. */
  wasm: ArrayBuffer;
  /** Song frames between position messages. */
  positionIntervalFrames: number;
}

export type ToProcessor =
  /** Loads a module and prepares it to play from the start. Replaces any loaded module. */
  | { type: 'load'; id: number; bytes: ArrayBuffer }
  /** Starts the prepared module at the next render quantum. */
  | { type: 'start'; id: number }
  /** Stops playback and prepares the loaded module to play from the start again. */
  | { type: 'stop'; id: number };

export type FromProcessor =
  /** libopenmpt is instantiated. */
  | { type: 'ready'; libraryVersion: string }
  /** A `load` or `stop` finished: a fresh module is ready to play from the start. */
  | { type: 'loaded'; id: number; durationSeconds: number; numChannels: number }
  /**
   * The song's first frame went into the render quantum that starts at context frame
   * `contextFrame`. This is the clock's anchor.
   */
  | { type: 'started'; id: number; contextFrame: number }
  | PositionMessage
  /**
   * libopenmpt reached the song's end after `songFrames` frames. `contextFrame` is the
   * context frame just after the song's last frame.
   */
  | { type: 'ended'; contextFrame: number; songFrames: number }
  /** `id` is the request that failed, or -1 for a failure outside a request. */
  | { type: 'error'; id: number; message: string };

export interface PositionMessage {
  type: 'position';
  /** Context frame at the start of the quantum this message was sent after. */
  contextFrame: number;
  /**
   * Song frames rendered before that quantum. While nothing has gone wrong,
   * contextFrame - songFrames is the anchor frame from the `started` message.
   */
  songFrames: number;
  /** libopenmpt's order and row after that quantum. */
  order: number;
  row: number;
  /**
   * Every row change since the previous message, as flat triples
   * [songFrame, order, row, ...]. songFrame is the song frame at the start of the quantum
   * after which the row was first seen, so the row starts within one quantum (128 frames)
   * after it. LevelData's row times follow the same rule with 160-frame analysis chunks.
   */
  rows: number[];
}
