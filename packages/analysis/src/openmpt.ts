// The libopenmpt binding: implements the contract in openmpt-types.ts on top of the
// vendored WebAssembly build (vendor/libopenmpt, built by tools/build-libopenmpt.sh).
//
// The same file runs in Node, in a browser worker bundled by Vite, and in an AudioWorklet.
// The Emscripten loader finds libopenmpt.wasm next to itself (`new URL(..., import.meta.url)`,
// which Vite also rewrites to the emitted asset). An AudioWorklet can't fetch, so its
// caller passes the wasm bytes in `wasmBinary`.

import createLibopenmpt, { type Libopenmpt } from '../vendor/libopenmpt/libopenmpt.js';
import type { OpenMpt, OpenMptModule, PatternCommand, RenderParam } from './openmpt-types.ts';

export interface LoadOpenMptOptions {
  /** The bytes of libopenmpt.wasm. Required where the loader can't read the file itself. */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** Receives libopenmpt's log lines (stderr). They are dropped when this is not set. */
  onLog?: (line: string) => void;
}

/** Instantiates libopenmpt. Each call makes a separate wasm instance with its own memory. */
export async function loadOpenMpt(options: LoadOpenMptOptions = {}): Promise<OpenMpt> {
  const log = options.onLog ?? (() => {});
  const lib = await createLibopenmpt({
    ...(options.wasmBinary ? { wasmBinary: options.wasmBinary } : {}),
    print: log,
    printErr: log,
  });
  const libraryVersion = takeString(lib, withCString(lib, 'library_version', (key) => lib._openmpt_get_string(key)));
  return {
    libraryVersion,
    load: (bytes) => openModule(lib, bytes),
  };
}

/** Copies a string libopenmpt returned and frees it with `openmpt_free_string`. */
function takeString(lib: Libopenmpt, ptr: number): string {
  if (ptr === 0) return '';
  try {
    return lib.UTF8ToString(ptr);
  } finally {
    lib._openmpt_free_string(ptr);
  }
}

/** Passes `str` to `fn` as a NUL-terminated UTF-8 string on the wasm heap, then frees it. */
function withCString<T>(lib: Libopenmpt, str: string, fn: (ptr: number) => T): T {
  const size = lib.lengthBytesUTF8(str) + 1;
  const ptr = lib._malloc(size);
  if (ptr === 0) throw new Error('libopenmpt: out of memory');
  try {
    lib.stringToUTF8(str, ptr, size);
    return fn(ptr);
  } finally {
    lib._free(ptr);
  }
}

function openModule(lib: Libopenmpt, bytes: Uint8Array): OpenMptModule {
  // One allocation holds the file data, then the int error code, then the error message
  // pointer (both 4 bytes in wasm32).
  const dataSize = (bytes.length + 3) & ~3;
  const block = lib._malloc(dataSize + 8);
  if (block === 0) throw new Error('libopenmpt: out of memory');
  let mod: number;
  let errorMessage: string;
  try {
    lib.HEAPU8.set(bytes, block);
    const errorPtr = block + dataSize;
    const messagePtr = errorPtr + 4;
    lib.HEAPU8.fill(0, errorPtr, errorPtr + 8);
    mod = lib._openmpt_module_create_from_memory2(block, bytes.length, 0, 0, 0, 0, errorPtr, messagePtr, 0);
    const heap = lib.HEAPU8;
    const messageStr = heap[messagePtr]! | (heap[messagePtr + 1]! << 8) | (heap[messagePtr + 2]! << 16) | (heap[messagePtr + 3]! << 24);
    errorMessage = takeString(lib, messageStr >>> 0);
  } finally {
    lib._free(block);
  }
  if (mod === 0) {
    throw new Error(`libopenmpt can't open the module${errorMessage ? `: ${errorMessage}` : ''}`);
  }
  return new Module(lib, mod);
}

class Module implements OpenMptModule {
  readonly numChannels: number;
  readonly numOrders: number;
  readonly numPatterns: number;
  readonly numInstruments: number;
  readonly numSamples: number;

  #lib: Libopenmpt;
  #mod: number;
  // Heap buffers for readFloatStereo, reused across calls and grown when a call asks for
  // more frames than they hold.
  #left = 0;
  #right = 0;
  #capacity = 0;

  constructor(lib: Libopenmpt, mod: number) {
    this.#lib = lib;
    this.#mod = mod;
    this.numChannels = lib._openmpt_module_get_num_channels(mod);
    this.numOrders = lib._openmpt_module_get_num_orders(mod);
    this.numPatterns = lib._openmpt_module_get_num_patterns(mod);
    this.numInstruments = lib._openmpt_module_get_num_instruments(mod);
    this.numSamples = lib._openmpt_module_get_num_samples(mod);
  }

  #ptr(): number {
    if (this.#mod === 0) throw new Error('libopenmpt: the module has been destroyed');
    return this.#mod;
  }

  /** Throws libopenmpt's last error for this module, then clears it. */
  #fail(what: string): never {
    const mod = this.#ptr();
    const message = takeString(this.#lib, this.#lib._openmpt_module_error_get_last_message(mod));
    this.#lib._openmpt_module_error_clear(mod);
    throw new Error(`libopenmpt: ${what} failed${message ? `: ${message}` : ''}`);
  }

  metadata(key: string): string {
    const mod = this.#ptr();
    return takeString(this.#lib, withCString(this.#lib, key, (k) => this.#lib._openmpt_module_get_metadata(mod, k)));
  }

  instrumentName(index: number): string {
    return takeString(this.#lib, this.#lib._openmpt_module_get_instrument_name(this.#ptr(), index));
  }

  sampleName(index: number): string {
    return takeString(this.#lib, this.#lib._openmpt_module_get_sample_name(this.#ptr(), index));
  }

  orderPattern(order: number): number {
    return this.#lib._openmpt_module_get_order_pattern(this.#ptr(), order);
  }

  patternNumRows(pattern: number): number {
    return this.#lib._openmpt_module_get_pattern_num_rows(this.#ptr(), pattern);
  }

  patternCommand(pattern: number, row: number, channel: number, command: PatternCommand): number {
    return this.#lib._openmpt_module_get_pattern_row_channel_command(this.#ptr(), pattern, row, channel, command);
  }

  setRenderParam(param: RenderParam, value: number): void {
    if (!this.#lib._openmpt_module_set_render_param(this.#ptr(), param, value)) {
      this.#fail(`set_render_param(${param}, ${value})`);
    }
  }

  ctlSet(key: string, value: string): void {
    const mod = this.#ptr();
    const ok = withCString(this.#lib, key, (k) =>
      withCString(this.#lib, value, (v) => this.#lib._openmpt_module_ctl_set(mod, k, v)),
    );
    if (!ok) this.#fail(`ctl_set('${key}', '${value}')`);
  }

  setRepeatCount(count: number): void {
    if (!this.#lib._openmpt_module_set_repeat_count(this.#ptr(), count)) {
      this.#fail(`set_repeat_count(${count})`);
    }
  }

  readFloatStereo(sampleRate: number, frames: number, left: Float32Array, right: Float32Array): number {
    const mod = this.#ptr();
    if (!Number.isInteger(frames) || frames < 0 || frames > left.length || frames > right.length) {
      throw new RangeError(`readFloatStereo: ${frames} frames don't fit the output arrays`);
    }
    if (frames > this.#capacity) this.#grow(frames);
    const lib = this.#lib;
    const count = lib._openmpt_module_read_float_stereo(mod, sampleRate, frames, this.#left, this.#right);
    // Rendering can grow the wasm memory, which replaces HEAPF32, so read it afterwards.
    const heap = lib.HEAPF32;
    const l = this.#left >>> 2;
    const r = this.#right >>> 2;
    left.set(heap.subarray(l, l + count));
    right.set(heap.subarray(r, r + count));
    return count;
  }

  #grow(frames: number): void {
    const lib = this.#lib;
    lib._free(this.#left);
    lib._free(this.#right);
    this.#left = lib._malloc(frames * 4);
    this.#right = lib._malloc(frames * 4);
    if (this.#left === 0 || this.#right === 0) {
      lib._free(this.#left);
      lib._free(this.#right);
      this.#left = this.#right = this.#capacity = 0;
      throw new Error('libopenmpt: out of memory');
    }
    this.#capacity = frames;
  }

  currentOrder(): number {
    return this.#lib._openmpt_module_get_current_order(this.#ptr());
  }

  currentPattern(): number {
    return this.#lib._openmpt_module_get_current_pattern(this.#ptr());
  }

  currentRow(): number {
    return this.#lib._openmpt_module_get_current_row(this.#ptr());
  }

  currentSpeed(): number {
    return this.#lib._openmpt_module_get_current_speed(this.#ptr());
  }

  currentTempo(): number {
    // get_current_tempo2: get_current_tempo is deprecated and drops fractional tempos.
    return this.#lib._openmpt_module_get_current_tempo2(this.#ptr());
  }

  channelVuLeft(channel: number): number {
    return this.#lib._openmpt_module_get_current_channel_vu_left(this.#ptr(), channel);
  }

  channelVuRight(channel: number): number {
    return this.#lib._openmpt_module_get_current_channel_vu_right(this.#ptr(), channel);
  }

  durationSeconds(): number {
    return this.#lib._openmpt_module_get_duration_seconds(this.#ptr());
  }

  destroy(): void {
    if (this.#mod === 0) return;
    const lib = this.#lib;
    lib._free(this.#left);
    lib._free(this.#right);
    this.#left = this.#right = this.#capacity = 0;
    lib._openmpt_module_destroy(this.#mod);
    this.#mod = 0;
  }
}
