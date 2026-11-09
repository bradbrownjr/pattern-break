// The main-thread side of module playback (a module is a song file made in a music
// tracker): owns the AudioContext, the libopenmpt worklet node and
// the song clock. See docs/DEVELOPMENT.md, "Audio and clock".

import { SAMPLE_RATE } from '@game/core';
import wasmUrl from '@game/analysis/libopenmpt.wasm?url';
// Vite turns this import into the URL of the bundled worklet; the lint rule reads worklet.ts
// itself, which has no default export.
// oxlint-disable-next-line import/default
import workletUrl from './worklet.ts?worker&url';
import { SongClock } from './clock.ts';
import { PROCESSOR_NAME, type FromProcessor, type PositionMessage, type ProcessorOptions, type ToProcessor } from './protocol.ts';

/** The context runs at a rate other than 48 000 Hz, so it would not play what analysis timed. */
export class SampleRateError extends Error {
  readonly sampleRate: number;

  constructor(sampleRate: number) {
    super(`The audio context runs at ${sampleRate} Hz; playback needs ${SAMPLE_RATE} Hz.`);
    this.name = 'SampleRateError';
    this.sampleRate = sampleRate;
  }
}

export type PlayerState = 'empty' | 'loaded' | 'starting' | 'playing' | 'paused' | 'ended';

export interface AudioPlayerOptions {
  /**
   * The context to play in. Default: a new AudioContext at 48 000 Hz with the
   * 'interactive' latency hint. Tests pass an OfflineAudioContext.
   */
  context?: BaseAudioContext;
  /** The bytes of libopenmpt.wasm. Default: fetched from the vendored build. */
  wasm?: ArrayBuffer;
  /** How often the worklet reports its position, in song milliseconds. Default 50. */
  positionIntervalMs?: number;
}

export interface LoadedSong {
  durationSeconds: number;
  numChannels: number;
}

export interface AudioPlayer {
  readonly context: BaseAudioContext;
  /**
   * The node the song plays from, ahead of the volume. Connect taps such as an AnalyserNode
   * to it; they don't change what is heard or the clock, and fades don't change what they read.
   */
  readonly output: AudioNode;
  readonly libraryVersion: string;
  readonly state: PlayerState;

  /**
   * Loads module bytes to play at `tempoPermille` (thousandths; 1000, the default, is the
   * song as written), replacing any loaded song, and stops playback.
   */
  load(bytes: Uint8Array, tempoPermille?: number): Promise<LoadedSong>;
  /**
   * Plays the loaded song from its start, restarting it if it is playing, paused or ended.
   * Resumes the context if it is suspended. Resolves once the worklet has rendered the first
   * frame and the clock is anchored.
   */
  start(): Promise<void>;
  /** Suspends the context. The song and the clock stop together. */
  pause(): Promise<void>;
  /** Resumes the context. The clock continues from where it stopped. */
  resume(): Promise<void>;
  /** Stops playback and rewinds; the clock reads 0 until the next start(). */
  stop(): void;
  /**
   * Ramps the volume (0 to 1, after the output tap) to `value` over `seconds`, starting
   * `delaySeconds` from now. Cancels earlier ramps. Cosmetic: the clock doesn't change.
   */
  fade(value: number, seconds: number, delaySeconds?: number): void;
  /** Sets the volume at once, cancelling any ramp. */
  setVolume(value: number): void;

  /** Called when libopenmpt reaches the song's end, with the song's length in frames. */
  onEnded: ((songFrames: number) => void) | null;
  /** Called for every position message from the worklet (every positionIntervalMs). */
  onPosition: ((position: PositionMessage) => void) | null;
  /** Called for worklet errors that no pending call is waiting for. */
  onError: ((message: string) => void) | null;

  /** User latency correction in milliseconds, added to song time. Negative delays the clock. */
  userOffsetMs: number;
  /** Song time in 48 kHz samples (see SongClock). Read it once per frame. */
  songTimeSamples(): number;
  songTimeSeconds(): number;
  /** Context seconds of the song's first frame, or null before the worklet reports it. */
  readonly startTime: number | null;
  /** The output latency in seconds the clock subtracts. */
  readonly latency: number;
  /** The song's length in frames once it has ended, else null. */
  readonly endedAtSongFrames: number | null;
  /** The last position message, or null. */
  readonly lastPosition: PositionMessage | null;

  /** Disconnects the node, and closes the context if the player created it. */
  close(): Promise<void>;
}

/**
 * The output latency the clock subtracts: `outputLatency`, or `baseLatency` where the
 * browser doesn't report outputLatency, or 0 (an OfflineAudioContext has neither).
 */
export function outputLatencyOf(context: BaseAudioContext): number {
  if (typeof AudioContext === 'undefined' || !(context instanceof AudioContext)) return 0;
  const output = context.outputLatency;
  if (typeof output === 'number' && Number.isFinite(output) && output > 0) return output;
  const base = context.baseLatency;
  if (typeof base === 'number' && Number.isFinite(base) && base > 0) return base;
  return 0;
}

export async function createAudioPlayer(options: AudioPlayerOptions = {}): Promise<AudioPlayer> {
  const ownsContext = !options.context;
  const context = options.context ?? new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  try {
    if (context.sampleRate !== SAMPLE_RATE) throw new SampleRateError(context.sampleRate);
    const wasm = options.wasm ?? (await fetchBytes(wasmUrl));
    await context.audioWorklet.addModule(workletUrl);
    const processorOptions: ProcessorOptions = {
      wasm,
      positionIntervalFrames: Math.max(1, Math.round(((options.positionIntervalMs ?? 50) * SAMPLE_RATE) / 1000)),
    };
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions,
    });
    const gain = context.createGain();
    node.connect(gain);
    gain.connect(context.destination);
    const player = new Player(context, node, gain, ownsContext);
    await player.ready;
    return player;
  } catch (err) {
    if (ownsContext && context instanceof AudioContext) await context.close();
    throw err;
  }
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

interface Waiter {
  type: 'loaded' | 'started';
  id: number;
  resolve: (message: FromProcessor) => void;
  reject: (err: Error) => void;
}

class Player implements AudioPlayer {
  readonly context: BaseAudioContext;
  readonly ready: Promise<void>;
  libraryVersion = '';
  onEnded: ((songFrames: number) => void) | null = null;
  onPosition: ((position: PositionMessage) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  #node: AudioWorkletNode;
  #gain: GainNode;
  #ownsContext: boolean;
  #clock = new SongClock();
  #state: PlayerState = 'empty';
  #nextId = 1;
  #waiters: Waiter[] = [];
  #endedAt: number | null = null;
  #lastPosition: PositionMessage | null = null;

  constructor(context: BaseAudioContext, node: AudioWorkletNode, gain: GainNode, ownsContext: boolean) {
    this.context = context;
    this.#node = node;
    this.#gain = gain;
    this.#ownsContext = ownsContext;
    this.ready = new Promise((resolve, reject) => {
      node.port.onmessage = (e: MessageEvent<FromProcessor>) => {
        const m = e.data;
        if (m.type === 'ready') {
          this.libraryVersion = m.libraryVersion;
          resolve();
        } else if (m.type === 'error' && m.id === -1 && !this.libraryVersion) {
          reject(new Error(m.message));
        }
        this.#onMessage(m);
      };
    });
  }

  get state(): PlayerState {
    return this.#state;
  }

  get output(): AudioNode {
    return this.#node;
  }

  get userOffsetMs(): number {
    return this.#clock.userOffsetMs;
  }

  set userOffsetMs(ms: number) {
    this.#clock.userOffsetMs = ms;
  }

  get startTime(): number | null {
    return this.#clock.startTime;
  }

  get latency(): number {
    return this.#clock.latency;
  }

  get endedAtSongFrames(): number | null {
    return this.#endedAt;
  }

  get lastPosition(): PositionMessage | null {
    return this.#lastPosition;
  }

  songTimeSeconds(): number {
    return this.#clock.seconds(this.context.currentTime);
  }

  songTimeSamples(): number {
    return this.#clock.samples(this.context.currentTime);
  }

  #post(message: ToProcessor, transfer: Transferable[] = []): void {
    this.#node.port.postMessage(message, transfer);
  }

  #wait(type: Waiter['type'], id: number): Promise<FromProcessor> {
    return new Promise((resolve, reject) => this.#waiters.push({ type, id, resolve, reject }));
  }

  #onMessage(m: FromProcessor): void {
    switch (m.type) {
      case 'loaded':
      case 'started': {
        const i = this.#waiters.findIndex((w) => w.type === m.type && w.id === m.id);
        if (i >= 0) this.#waiters.splice(i, 1)[0]!.resolve(m);
        break;
      }
      case 'position':
        this.#lastPosition = m;
        this.#clock.refineLatency(outputLatencyOf(this.context));
        this.onPosition?.(m);
        break;
      case 'ended':
        this.#endedAt = m.songFrames;
        if (this.#state === 'playing' || this.#state === 'paused') this.#state = 'ended';
        this.onEnded?.(m.songFrames);
        break;
      case 'error': {
        const i = this.#waiters.findIndex((w) => w.id === m.id);
        if (i >= 0) this.#waiters.splice(i, 1)[0]!.reject(new Error(m.message));
        else this.onError?.(m.message);
        break;
      }
      case 'ready':
        break;
    }
  }

  async load(bytes: Uint8Array, tempoPermille = 1000): Promise<LoadedSong> {
    this.#clock.stop();
    this.#endedAt = null;
    this.#lastPosition = null;
    this.#state = 'empty';
    const id = this.#nextId++;
    const copy = bytes.slice().buffer;
    const reply = this.#wait('loaded', id);
    this.#post({ type: 'load', id, bytes: copy, tempoPermille }, [copy]);
    const m = await reply;
    if (m.type !== 'loaded') throw new Error('unexpected reply');
    this.#state = 'loaded';
    return { durationSeconds: m.durationSeconds, numChannels: m.numChannels };
  }

  async start(): Promise<void> {
    if (this.#state === 'empty') throw new Error('start: no song is loaded');
    if (this.#state !== 'loaded') this.stop();
    const id = this.#nextId++;
    const reply = this.#wait('started', id);
    this.#state = 'starting';
    this.#clock.starting(outputLatencyOf(this.context));
    this.#post({ type: 'start', id });
    if (this.context instanceof AudioContext && this.context.state !== 'running') await this.context.resume();
    const m = await reply;
    if (m.type !== 'started') throw new Error('unexpected reply');
    this.#clock.anchor(m.contextFrame, outputLatencyOf(this.context));
    if (this.#state === 'starting') this.#state = 'playing';
  }

  async pause(): Promise<void> {
    if (this.#state !== 'playing' || !(this.context instanceof AudioContext)) return;
    await this.context.suspend();
    this.#clock.pause(this.context.currentTime);
    this.#state = 'paused';
  }

  async resume(): Promise<void> {
    if (this.#state !== 'paused' || !(this.context instanceof AudioContext)) return;
    await this.context.resume();
    this.#clock.resume();
    this.#state = this.#endedAt === null ? 'playing' : 'ended';
  }

  stop(): void {
    if (this.#state === 'empty') return;
    // The worklet replies with 'loaded' once it has a fresh module; nothing waits for it,
    // because messages are handled in order and a following start() queues behind it.
    this.#post({ type: 'stop', id: this.#nextId++ });
    for (const w of this.#waiters.splice(0)) w.reject(new Error('stopped'));
    this.#clock.stop();
    this.#endedAt = null;
    this.#lastPosition = null;
    this.#state = 'loaded';
  }

  fade(value: number, seconds: number, delaySeconds = 0): void {
    const g = this.#gain.gain;
    const at = this.context.currentTime + delaySeconds;
    g.cancelScheduledValues(this.context.currentTime);
    g.setValueAtTime(g.value, this.context.currentTime);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(value, at + Math.max(seconds, 0.001));
  }

  setVolume(value: number): void {
    const g = this.#gain.gain;
    g.cancelScheduledValues(this.context.currentTime);
    g.setValueAtTime(value, this.context.currentTime);
  }

  async close(): Promise<void> {
    this.#node.disconnect();
    this.#gain.disconnect();
    this.#node.port.onmessage = null;
    if (this.#ownsContext && this.context instanceof AudioContext) await this.context.close();
  }
}
