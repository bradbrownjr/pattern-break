// Hand-written types for libopenmpt.js, the Emscripten loader that
// tools/build-libopenmpt.sh generates. The functions are the ones the build exports
// (BUILD.md, "Exported functions"); signatures follow libopenmpt.h, with every pointer
// and size_t as a number and every 64-bit integer as a bigint.

/** The Module settings the loader reads (INCOMING_MODULE_JS_API in the build). */
export interface LibopenmptModuleArg {
  /** The bytes of libopenmpt.wasm. When given, the loader doesn't fetch or read the file. */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** Replaces the wasm instantiation. Calls `receiveInstance` with the instance. */
  instantiateWasm?: (
    imports: Record<string, unknown>,
    receiveInstance: (instance: unknown, module?: unknown) => void,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Maps a file name (libopenmpt.wasm) to the URL or path to load it from. */
  locateFile?: (path: string, scriptDirectory: string) => string;
  /** stdout. libopenmpt doesn't write to it. */
  print?: (text: string) => void;
  /** stderr. libopenmpt's default log function writes here. */
  printErr?: (text: string) => void;
}

type Ptr = number;
type Mod = Ptr;

export interface Libopenmpt {
  /** Views of the wasm memory. Replaced when memory grows; read them after each call. */
  readonly HEAPU8: Uint8Array;
  readonly HEAPF32: Float32Array;
  UTF8ToString(ptr: Ptr, maxBytesToRead?: number): string;
  stringToUTF8(str: string, outPtr: Ptr, maxBytesToWrite: number): number;
  lengthBytesUTF8(str: string): number;

  _malloc(size: number): Ptr;
  _free(ptr: Ptr): void;

  _openmpt_get_library_version(): number;
  _openmpt_get_core_version(): number;
  _openmpt_free_string(str: Ptr): void;
  _openmpt_get_string(key: Ptr): Ptr;
  _openmpt_get_supported_extensions(): Ptr;
  _openmpt_is_extension_supported(extension: Ptr): number;
  _openmpt_error_string(error: number): Ptr;
  _openmpt_probe_file_header(
    flags: bigint, data: Ptr, size: number, filesize: bigint,
    logfunc: Ptr, loguser: Ptr, errfunc: Ptr, erruser: Ptr, error: Ptr, errorMessage: Ptr,
  ): number;
  _openmpt_probe_file_header_without_filesize(
    flags: bigint, data: Ptr, size: number,
    logfunc: Ptr, loguser: Ptr, errfunc: Ptr, erruser: Ptr, error: Ptr, errorMessage: Ptr,
  ): number;
  _openmpt_probe_file_header_get_recommended_size(): number;

  _openmpt_module_create_from_memory2(
    filedata: Ptr, filesize: number, logfunc: Ptr, loguser: Ptr, errfunc: Ptr, erruser: Ptr,
    error: Ptr, errorMessage: Ptr, ctls: Ptr,
  ): Mod;
  _openmpt_module_destroy(mod: Mod): void;
  _openmpt_module_error_get_last(mod: Mod): number;
  _openmpt_module_error_get_last_message(mod: Mod): Ptr;
  _openmpt_module_error_set_last(mod: Mod, error: number): void;
  _openmpt_module_error_clear(mod: Mod): void;

  _openmpt_module_select_subsong(mod: Mod, subsong: number): number;
  _openmpt_module_get_selected_subsong(mod: Mod): number;
  _openmpt_module_get_restart_order(mod: Mod, subsong: number): number;
  _openmpt_module_get_restart_row(mod: Mod, subsong: number): number;
  _openmpt_module_set_repeat_count(mod: Mod, count: number): number;
  _openmpt_module_get_repeat_count(mod: Mod): number;
  _openmpt_module_get_duration_seconds(mod: Mod): number;
  _openmpt_module_get_time_at_position(mod: Mod, order: number, row: number): number;
  _openmpt_module_set_position_seconds(mod: Mod, seconds: number): number;
  _openmpt_module_get_position_seconds(mod: Mod): number;
  _openmpt_module_set_position_order_row(mod: Mod, order: number, row: number): number;
  _openmpt_module_get_render_param(mod: Mod, param: number, value: Ptr): number;
  _openmpt_module_set_render_param(mod: Mod, param: number, value: number): number;

  _openmpt_module_read_float_mono(mod: Mod, samplerate: number, count: number, mono: Ptr): number;
  _openmpt_module_read_float_stereo(
    mod: Mod, samplerate: number, count: number, left: Ptr, right: Ptr,
  ): number;
  _openmpt_module_read_interleaved_float_stereo(
    mod: Mod, samplerate: number, count: number, interleavedStereo: Ptr,
  ): number;

  _openmpt_module_get_metadata_keys(mod: Mod): Ptr;
  _openmpt_module_get_metadata(mod: Mod, key: Ptr): Ptr;
  _openmpt_module_get_current_estimated_bpm(mod: Mod): number;
  _openmpt_module_get_current_speed(mod: Mod): number;
  _openmpt_module_get_current_tempo2(mod: Mod): number;
  _openmpt_module_get_current_order(mod: Mod): number;
  _openmpt_module_get_current_pattern(mod: Mod): number;
  _openmpt_module_get_current_row(mod: Mod): number;
  _openmpt_module_get_current_playing_channels(mod: Mod): number;
  _openmpt_module_get_current_channel_vu_mono(mod: Mod, channel: number): number;
  _openmpt_module_get_current_channel_vu_left(mod: Mod, channel: number): number;
  _openmpt_module_get_current_channel_vu_right(mod: Mod, channel: number): number;

  _openmpt_module_get_num_subsongs(mod: Mod): number;
  _openmpt_module_get_num_channels(mod: Mod): number;
  _openmpt_module_get_num_orders(mod: Mod): number;
  _openmpt_module_get_num_patterns(mod: Mod): number;
  _openmpt_module_get_num_instruments(mod: Mod): number;
  _openmpt_module_get_num_samples(mod: Mod): number;
  _openmpt_module_get_subsong_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_channel_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_order_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_pattern_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_instrument_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_sample_name(mod: Mod, index: number): Ptr;
  _openmpt_module_get_order_pattern(mod: Mod, order: number): number;
  _openmpt_module_is_order_skip_entry(mod: Mod, order: number): number;
  _openmpt_module_is_order_stop_entry(mod: Mod, order: number): number;
  _openmpt_module_is_pattern_skip_item(mod: Mod, pattern: number): number;
  _openmpt_module_is_pattern_stop_item(mod: Mod, pattern: number): number;
  _openmpt_module_get_pattern_num_rows(mod: Mod, pattern: number): number;
  _openmpt_module_get_pattern_rows_per_beat(mod: Mod, pattern: number): number;
  _openmpt_module_get_pattern_rows_per_measure(mod: Mod, pattern: number): number;
  _openmpt_module_get_pattern_row_channel_command(
    mod: Mod, pattern: number, row: number, channel: number, command: number,
  ): number;
  _openmpt_module_format_pattern_row_channel_command(
    mod: Mod, pattern: number, row: number, channel: number, command: number,
  ): Ptr;
  _openmpt_module_highlight_pattern_row_channel_command(
    mod: Mod, pattern: number, row: number, channel: number, command: number,
  ): Ptr;
  _openmpt_module_format_pattern_row_channel(
    mod: Mod, pattern: number, row: number, channel: number, width: number, pad: number,
  ): Ptr;
  _openmpt_module_highlight_pattern_row_channel(
    mod: Mod, pattern: number, row: number, channel: number, width: number, pad: number,
  ): Ptr;

  _openmpt_module_get_ctls(mod: Mod): Ptr;
  _openmpt_module_ctl_get_boolean(mod: Mod, ctl: Ptr): number;
  _openmpt_module_ctl_get_integer(mod: Mod, ctl: Ptr): bigint;
  _openmpt_module_ctl_get_floatingpoint(mod: Mod, ctl: Ptr): number;
  _openmpt_module_ctl_get_text(mod: Mod, ctl: Ptr): Ptr;
  /** Deprecated upstream, but the one setter that takes a string for every ctl type. */
  _openmpt_module_ctl_set(mod: Mod, ctl: Ptr, value: Ptr): number;
  _openmpt_module_ctl_set_boolean(mod: Mod, ctl: Ptr, value: number): number;
  _openmpt_module_ctl_set_integer(mod: Mod, ctl: Ptr, value: bigint): number;
  _openmpt_module_ctl_set_floatingpoint(mod: Mod, ctl: Ptr, value: number): number;
  _openmpt_module_ctl_set_text(mod: Mod, ctl: Ptr, value: Ptr): number;
}

/** Instantiates libopenmpt. Each call makes a separate instance with its own memory. */
export default function createLibopenmpt(moduleArg?: LibopenmptModuleArg): Promise<Libopenmpt>;
