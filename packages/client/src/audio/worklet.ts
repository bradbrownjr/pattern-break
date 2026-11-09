// The AudioWorklet processor that plays a module (a song file made in a music tracker)
// through the vendored libopenmpt build.
// Vite bundles this file on its own (player.ts imports it with `?worker&url`). It renders
// with the same ctls and render parameters as the analysis pass (renderCtls() and
// RENDER_PARAMS from @game/analysis), at the same tempo, so it plays what the analysis
// analyzed.
//
// An AudioWorklet can't fetch, so the player hands in the wasm bytes as processorOptions.
// Nothing here may throw out of process(): a throw stops the processor for good.

import { loadOpenMpt, renderCtls, RENDER_PARAMS, type OpenMpt, type OpenMptModule } from '@game/analysis';
import { PROCESSOR_NAME, type FromProcessor, type ProcessorOptions, type ToProcessor } from './protocol.ts';

// AudioWorkletGlobalScope, which TypeScript's DOM lib doesn't describe.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new (options: { processorOptions: ProcessorOptions }) => AudioWorkletProcessor,
): void;

class LibopenmptProcessor extends AudioWorkletProcessor {
  #openmpt: OpenMpt | null = null;
  #bytes: Uint8Array | null = null;
  #tempoPermille = 1000;
  #mod: OpenMptModule | null = null;
  #playing = false;
  #started = false;
  #songFrames = 0;
  #order = -1;
  #row = -1;
  #rows: number[] = [];
  #nextReport = 0;
  #startId = -1;
  #loadId = -1;
  readonly #interval: number;

  constructor(options: { processorOptions: ProcessorOptions }) {
    super();
    const { wasm, positionIntervalFrames } = options.processorOptions;
    this.#interval = positionIntervalFrames;
    this.port.onmessage = (e: MessageEvent<ToProcessor>) => this.#onMessage(e.data);
    loadOpenMpt({ wasmBinary: wasm }).then(
      (openmpt) => {
        this.#openmpt = openmpt;
        this.#send({ type: 'ready', libraryVersion: openmpt.libraryVersion });
        if (this.#bytes) this.#prepare();
      },
      (err: unknown) => this.#send({ type: 'error', id: -1, message: `libopenmpt failed to load: ${String(err)}` }),
    );
  }

  #send(message: FromProcessor): void {
    this.port.postMessage(message);
  }

  #onMessage(message: ToProcessor): void {
    switch (message.type) {
      case 'load':
        this.#bytes = new Uint8Array(message.bytes);
        this.#tempoPermille = message.tempoPermille;
        this.#loadId = message.id;
        if (this.#openmpt) this.#prepare();
        break;
      case 'start':
        if (!this.#mod || this.#started) {
          this.#send({ type: 'error', id: message.id, message: 'start: no module is ready to play' });
          return;
        }
        this.#startId = message.id;
        this.#playing = true;
        break;
      case 'stop':
        this.#loadId = message.id;
        if (this.#bytes && this.#openmpt) this.#prepare();
        break;
    }
  }

  /** Opens a fresh module from the loaded bytes, set up exactly as analysis sets it up. */
  #prepare(): void {
    this.#playing = false;
    this.#started = false;
    this.#songFrames = 0;
    this.#order = -1;
    this.#row = -1;
    this.#rows = [];
    this.#nextReport = this.#interval;
    this.#mod?.destroy();
    this.#mod = null;
    try {
      const mod = this.#openmpt!.load(this.#bytes!);
      for (const [key, value] of renderCtls(this.#tempoPermille)) mod.ctlSet(key, value);
      for (const [param, value] of RENDER_PARAMS) mod.setRenderParam(param, value);
      mod.setRepeatCount(0);
      this.#mod = mod;
      this.#send({ type: 'loaded', id: this.#loadId, durationSeconds: mod.durationSeconds(), numChannels: mod.numChannels });
    } catch (err) {
      this.#send({ type: 'error', id: this.#loadId, message: String(err) });
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const mod = this.#mod;
    const out = outputs[0];
    if (!this.#playing || !mod || !out || out.length === 0) return true;
    const left = out[0]!;
    const right = out[1] ?? left;
    const quantum = left.length;
    const songFrame = this.#songFrames;
    let n = 0;
    try {
      n = mod.readFloatStereo(sampleRate, quantum, left, right);
    } catch (err) {
      this.#playing = false;
      this.#send({ type: 'error', id: -1, message: `render failed: ${String(err)}` });
      return true;
    }
    if (n < quantum) {
      left.fill(0, n);
      right.fill(0, n);
    }
    if (!this.#started) {
      this.#started = true;
      this.#send({ type: 'started', id: this.#startId, contextFrame: currentFrame });
    }
    const order = mod.currentOrder();
    const row = mod.currentRow();
    if (n > 0 && (order !== this.#order || row !== this.#row)) {
      this.#order = order;
      this.#row = row;
      this.#rows.push(songFrame, order, row);
    }
    this.#songFrames += n;

    const ended = n < quantum;
    if (ended || this.#songFrames >= this.#nextReport) {
      this.#send({ type: 'position', contextFrame: currentFrame, songFrames: songFrame, order, row, rows: this.#rows });
      this.#rows = [];
      while (this.#nextReport <= this.#songFrames) this.#nextReport += this.#interval;
    }
    if (ended) {
      this.#playing = false;
      this.#send({ type: 'ended', contextFrame: currentFrame + n, songFrames: this.#songFrames });
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, LibopenmptProcessor);
