# libopenmpt build

Written by `tools/build-libopenmpt.sh`. Rerun the script instead of editing this file.

## Inputs

- libopenmpt 0.8.10: tag `libopenmpt-0.8.10`, commit `dc4ddcf682763d55c33dcf6c874a3153dea7b304`, from https://github.com/OpenMPT/openmpt
- emsdk 6.0.13: commit `35659964bc2762fffec0d257997fb61475f765b7`, from https://github.com/emscripten-core/emsdk
- Compiler: `emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.13 (e13ee988ce3d87a738dd8f3661d02223308c412a)`
- Built on 2026-11-08 (UTC)
- Patches applied to libopenmpt, from `tools/libopenmpt/`:
  - `deterministic-prng.patch`

## Outputs

| File | Bytes | SHA-256 |
|---|---|---|
| `libopenmpt.wasm` | 1597568 | `41748361696e1e88c5fd9b12e93748bda4b7fa6ee841d090d591ce7d61b91c7f` |
| `libopenmpt.js` | 35680 | `e863953239ceae6e4d61de448421586942d3f3e119d65e9f8aff21b679dd2158` |

`LICENSE` is libopenmpt's license, copied from the source tree. `libopenmpt.d.ts` is
hand-written (the script leaves it alone); update it when the exported functions change.

## Loading

The wasm is a separate file, not embedded in the loader (no `SINGLE_FILE`), so the
committed `libopenmpt.wasm` is the exact binary every environment runs and its SHA-256
above identifies the build. The loader finds it with
`new URL("libopenmpt.wasm", import.meta.url)`: Node reads it from disk, and Vite emits it
as an asset and rewrites the URL. An AudioWorklet cannot fetch, so its caller fetches the
same file on the main thread and passes the bytes as `wasmBinary`.

Vite prints "Module \"node:module\" has been externalized for browser compatibility" for
this file. The loader imports `node:module` only when it runs in Node, so the warning is
harmless.

## Determinism

- No `-ffast-math`, no SIMD (so no relaxed SIMD), no threads, `FILESYSTEM=0`.
- `deterministic-prng.patch` seeds each module's playback PRNG with a fixed value. Without
  it, IT random volume, panning and filter swing and the random vibrato waveforms render
  differently on every load.
- With volume ramping on (the default), the output depends on the frame counts passed to
  `read_float_stereo`, by under 1e-6. Render in one fixed chunk size everywhere, or set
  `volumeRampingStrength` to 0.
- The 16-bit output functions dither with a PRNG seeded from the clock. The float
  functions do not dither.

## Compile flags

Paths are shown relative to the libopenmpt checkout.

```
-DLIBOPENMPT_BUILD
-DNDEBUG
-DMPT_BUILD_AUDIOWORKLETPROCESSOR
-Isrc
-Icommon
-I.
-std=c++20
-O3
-flto
-fwasm-exceptions
-fno-fast-math
-ffp-contract=off
-fvisibility=hidden
-ffile-prefix-map=<libopenmpt>=libopenmpt
-ffile-prefix-map=<emsdk>=emsdk
-w
```

## Link flags

The compile flags from `-std=c++20` on, plus:

```
-O3
-flto
-fwasm-exceptions
--no-entry
-sMODULARIZE=1
-sEXPORT_ES6=1
-sEXPORT_NAME=createLibopenmpt
-sENVIRONMENT=web,worker,node,worklet
-sFILESYSTEM=0
-sALLOW_MEMORY_GROWTH=1
-sSTACK_SIZE=1048576
-sSUPPORT_LONGJMP=0
-sDYNAMIC_EXECUTION=0
-sNODEJS_CATCH_EXIT=0
-sNODEJS_CATCH_REJECTION=0
-sINCOMING_MODULE_JS_API=wasmBinary,instantiateWasm,locateFile,print,printErr
-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32,UTF8ToString,stringToUTF8,lengthBytesUTF8
-sEXPORTED_FUNCTIONS=<the list below>
```

## Exported functions

```
_malloc
_free
_openmpt_get_library_version
_openmpt_get_core_version
_openmpt_free_string
_openmpt_get_string
_openmpt_get_supported_extensions
_openmpt_is_extension_supported
_openmpt_error_string
_openmpt_probe_file_header
_openmpt_probe_file_header_without_filesize
_openmpt_probe_file_header_get_recommended_size
_openmpt_module_create_from_memory2
_openmpt_module_destroy
_openmpt_module_error_get_last
_openmpt_module_error_get_last_message
_openmpt_module_error_set_last
_openmpt_module_error_clear
_openmpt_module_select_subsong
_openmpt_module_get_selected_subsong
_openmpt_module_get_restart_order
_openmpt_module_get_restart_row
_openmpt_module_set_repeat_count
_openmpt_module_get_repeat_count
_openmpt_module_get_duration_seconds
_openmpt_module_get_time_at_position
_openmpt_module_set_position_seconds
_openmpt_module_get_position_seconds
_openmpt_module_set_position_order_row
_openmpt_module_get_render_param
_openmpt_module_set_render_param
_openmpt_module_read_float_mono
_openmpt_module_read_float_stereo
_openmpt_module_read_interleaved_float_stereo
_openmpt_module_get_metadata_keys
_openmpt_module_get_metadata
_openmpt_module_get_current_estimated_bpm
_openmpt_module_get_current_speed
_openmpt_module_get_current_tempo2
_openmpt_module_get_current_order
_openmpt_module_get_current_pattern
_openmpt_module_get_current_row
_openmpt_module_get_current_playing_channels
_openmpt_module_get_current_channel_vu_mono
_openmpt_module_get_current_channel_vu_left
_openmpt_module_get_current_channel_vu_right
_openmpt_module_get_num_subsongs
_openmpt_module_get_num_channels
_openmpt_module_get_num_orders
_openmpt_module_get_num_patterns
_openmpt_module_get_num_instruments
_openmpt_module_get_num_samples
_openmpt_module_get_subsong_name
_openmpt_module_get_channel_name
_openmpt_module_get_order_name
_openmpt_module_get_pattern_name
_openmpt_module_get_instrument_name
_openmpt_module_get_sample_name
_openmpt_module_get_order_pattern
_openmpt_module_is_order_skip_entry
_openmpt_module_is_order_stop_entry
_openmpt_module_is_pattern_skip_item
_openmpt_module_is_pattern_stop_item
_openmpt_module_get_pattern_num_rows
_openmpt_module_get_pattern_rows_per_beat
_openmpt_module_get_pattern_rows_per_measure
_openmpt_module_get_pattern_row_channel_command
_openmpt_module_format_pattern_row_channel_command
_openmpt_module_highlight_pattern_row_channel_command
_openmpt_module_format_pattern_row_channel
_openmpt_module_highlight_pattern_row_channel
_openmpt_module_get_ctls
_openmpt_module_ctl_get_boolean
_openmpt_module_ctl_get_integer
_openmpt_module_ctl_get_floatingpoint
_openmpt_module_ctl_get_text
_openmpt_module_ctl_set
_openmpt_module_ctl_set_boolean
_openmpt_module_ctl_set_integer
_openmpt_module_ctl_set_floatingpoint
_openmpt_module_ctl_set_text
```

## Sources

```
common/ComponentManager.cpp
common/Logging.cpp
common/Profiler.cpp
common/mptFileType.cpp
common/mptPathString.cpp
common/mptRandom.cpp
common/mptStringBuffer.cpp
common/mptTime.cpp
common/serialization_utils.cpp
common/version.cpp
soundlib/AudioCriticalSection.cpp
soundlib/ContainerMMCMP.cpp
soundlib/ContainerPP20.cpp
soundlib/ContainerUMX.cpp
soundlib/ContainerXPK.cpp
soundlib/Dlsbank.cpp
soundlib/Fastmix.cpp
soundlib/ITCompression.cpp
soundlib/ITTools.cpp
soundlib/InstrumentExtensions.cpp
soundlib/InstrumentSynth.cpp
soundlib/Load_667.cpp
soundlib/Load_669.cpp
soundlib/Load_amf.cpp
soundlib/Load_ams.cpp
soundlib/Load_c67.cpp
soundlib/Load_cba.cpp
soundlib/Load_dbm.cpp
soundlib/Load_digi.cpp
soundlib/Load_dmf.cpp
soundlib/Load_dsm.cpp
soundlib/Load_dsym.cpp
soundlib/Load_dtm.cpp
soundlib/Load_etx.cpp
soundlib/Load_far.cpp
soundlib/Load_fc.cpp
soundlib/Load_fmt.cpp
soundlib/Load_ftm.cpp
soundlib/Load_gdm.cpp
soundlib/Load_gmc.cpp
soundlib/Load_gt2.cpp
soundlib/Load_ice.cpp
soundlib/Load_imf.cpp
soundlib/Load_ims.cpp
soundlib/Load_it.cpp
soundlib/Load_itp.cpp
soundlib/Load_kris.cpp
soundlib/Load_mdl.cpp
soundlib/Load_med.cpp
soundlib/Load_mid.cpp
soundlib/Load_mo3.cpp
soundlib/Load_mod.cpp
soundlib/Load_mt2.cpp
soundlib/Load_mtm.cpp
soundlib/Load_mus_km.cpp
soundlib/Load_okt.cpp
soundlib/Load_plm.cpp
soundlib/Load_psm.cpp
soundlib/Load_pt36.cpp
soundlib/Load_ptm.cpp
soundlib/Load_puma.cpp
soundlib/Load_rtm.cpp
soundlib/Load_s3m.cpp
soundlib/Load_sfx.cpp
soundlib/Load_stk.cpp
soundlib/Load_stm.cpp
soundlib/Load_stp.cpp
soundlib/Load_symmod.cpp
soundlib/Load_tcb.cpp
soundlib/Load_uax.cpp
soundlib/Load_ult.cpp
soundlib/Load_unic.cpp
soundlib/Load_wav.cpp
soundlib/Load_xm.cpp
soundlib/Load_xmf.cpp
soundlib/MIDIEvents.cpp
soundlib/MIDIMacroParser.cpp
soundlib/MIDIMacros.cpp
soundlib/MODTools.cpp
soundlib/MPEGFrame.cpp
soundlib/Message.cpp
soundlib/MixFuncTable.cpp
soundlib/MixerLoops.cpp
soundlib/MixerSettings.cpp
soundlib/ModChannel.cpp
soundlib/ModInstrument.cpp
soundlib/ModSample.cpp
soundlib/ModSequence.cpp
soundlib/OPL.cpp
soundlib/OggStream.cpp
soundlib/Paula.cpp
soundlib/PlayState.cpp
soundlib/PlaybackTest.cpp
soundlib/RowVisitor.cpp
soundlib/S3MTools.cpp
soundlib/SampleFormatBRR.cpp
soundlib/SampleFormatFLAC.cpp
soundlib/SampleFormatMP3.cpp
soundlib/SampleFormatMediaFoundation.cpp
soundlib/SampleFormatOpus.cpp
soundlib/SampleFormatSFZ.cpp
soundlib/SampleFormatVorbis.cpp
soundlib/SampleFormats.cpp
soundlib/SampleIO.cpp
soundlib/Snd_flt.cpp
soundlib/Snd_fx.cpp
soundlib/Sndfile.cpp
soundlib/Sndmix.cpp
soundlib/SoundFilePlayConfig.cpp
soundlib/Tables.cpp
soundlib/Tagging.cpp
soundlib/TinyFFT.cpp
soundlib/UMXTools.cpp
soundlib/UpgradeModule.cpp
soundlib/WAVTools.cpp
soundlib/WindowedFIR.cpp
soundlib/XMTools.cpp
soundlib/load_j2b.cpp
soundlib/mod_specifications.cpp
soundlib/modcommand.cpp
soundlib/modsmp_ctrl.cpp
soundlib/pattern.cpp
soundlib/patternContainer.cpp
soundlib/tuning.cpp
soundlib/tuningCollection.cpp
soundlib/plugins/DigiBoosterEcho.cpp
soundlib/plugins/LFOPlugin.cpp
soundlib/plugins/PlugInterface.cpp
soundlib/plugins/PluginManager.cpp
soundlib/plugins/SymMODEcho.cpp
soundlib/plugins/dmo/Chorus.cpp
soundlib/plugins/dmo/Compressor.cpp
soundlib/plugins/dmo/DMOPlugin.cpp
soundlib/plugins/dmo/DMOUtils.cpp
soundlib/plugins/dmo/Distortion.cpp
soundlib/plugins/dmo/Echo.cpp
soundlib/plugins/dmo/Flanger.cpp
soundlib/plugins/dmo/Gargle.cpp
soundlib/plugins/dmo/I3DL2Reverb.cpp
soundlib/plugins/dmo/ParamEq.cpp
soundlib/plugins/dmo/WavesReverb.cpp
sounddsp/AGC.cpp
sounddsp/DSP.cpp
sounddsp/EQ.cpp
sounddsp/Reverb.cpp
libopenmpt/libopenmpt_c.cpp
libopenmpt/libopenmpt_cxx.cpp
libopenmpt/libopenmpt_ext_impl.cpp
libopenmpt/libopenmpt_impl.cpp
```
