#!/usr/bin/env bash
# Builds libopenmpt to WebAssembly and writes the result to
# packages/analysis/vendor/libopenmpt/.
#
# Usage: tools/build-libopenmpt.sh [work-dir]
#
# The work dir holds the libopenmpt and emsdk checkouts and the object files (about 1.5 GB
# once emsdk is installed). It defaults to $LIBOPENMPT_WORK_DIR, then to
# ${TMPDIR:-/tmp}/pattern-break-libopenmpt. Keep it outside the repo.
#
# Needs bash, git, python3 (for emsdk), patch, and sha256sum. Network access to
# github.com (sources) and storage.googleapis.com (emsdk binaries).
#
# Every input is pinned below. The same inputs give the same wasm bytes: source and emsdk
# paths are mapped out of the binary with -ffile-prefix-map, so the work dir location does
# not leak into it.

set -euo pipefail

# Pinned inputs. A change here changes the wasm, so commit the rebuilt vendor files and a
# GEN_VERSION bump with it.
LIBOPENMPT_VERSION=0.8.10
LIBOPENMPT_TAG=libopenmpt-0.8.10
LIBOPENMPT_COMMIT=dc4ddcf682763d55c33dcf6c874a3153dea7b304
LIBOPENMPT_REPO=https://github.com/OpenMPT/openmpt
EMSDK_VERSION=6.0.13
EMSDK_COMMIT=35659964bc2762fffec0d257997fb61475f765b7
EMSDK_REPO=https://github.com/emscripten-core/emsdk

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PATCH_DIR="$REPO_ROOT/tools/libopenmpt"
OUT_DIR="$REPO_ROOT/packages/analysis/vendor/libopenmpt"
WORK_DIR=${1:-${LIBOPENMPT_WORK_DIR:-${TMPDIR:-/tmp}/pattern-break-libopenmpt}}
mkdir -p "$WORK_DIR"
WORK_DIR=$(cd "$WORK_DIR" && pwd)
SRC="$WORK_DIR/openmpt-$LIBOPENMPT_VERSION"
EMSDK="$WORK_DIR/emsdk-$EMSDK_VERSION"
OBJ="$WORK_DIR/obj-$LIBOPENMPT_VERSION"
JOBS=${JOBS:-$(nproc 2>/dev/null || echo 4)}

case "$WORK_DIR/" in
  "$REPO_ROOT"/*) echo "work dir must be outside the repo: $WORK_DIR" >&2; exit 1 ;;
esac

log() { printf '\n== %s\n' "$*"; }

# Clones $1 at tag $2 into $3 and checks that HEAD is commit $4.
fetch() {
  local repo=$1 tag=$2 dir=$3 commit=$4
  if [ ! -d "$dir/.git" ]; then
    git clone --quiet --depth 1 --branch "$tag" -c advice.detachedHead=false "$repo" "$dir"
  fi
  local head
  head=$(git -C "$dir" rev-parse HEAD)
  if [ "$head" != "$commit" ]; then
    echo "$dir is at $head, expected $commit ($tag). Delete it and rerun." >&2
    exit 1
  fi
}

log "Fetching libopenmpt $LIBOPENMPT_TAG and emsdk $EMSDK_VERSION into $WORK_DIR"
fetch "$LIBOPENMPT_REPO" "$LIBOPENMPT_TAG" "$SRC" "$LIBOPENMPT_COMMIT"
fetch "$EMSDK_REPO" "$EMSDK_VERSION" "$EMSDK" "$EMSDK_COMMIT"

log "Patching libopenmpt"
# Each patch is applied once; a marker file records it.
for p in "$PATCH_DIR"/*.patch; do
  marker="$SRC/.applied-$(basename "$p")"
  if [ ! -f "$marker" ]; then
    patch --quiet --forward -p1 -d "$SRC" < "$p"
    touch "$marker"
  fi
done

log "Installing emsdk $EMSDK_VERSION"
"$EMSDK/emsdk" install "$EMSDK_VERSION" > "$WORK_DIR/emsdk-install.log"
"$EMSDK/emsdk" activate "$EMSDK_VERSION" > "$WORK_DIR/emsdk-activate.log"
export EM_CONFIG="$EMSDK/.emscripten"
export PATH="$EMSDK/upstream/emscripten:$PATH"
EMCC_VERSION=$(emcc --version | head -n 1)
case "$EMCC_VERSION" in
  *" $EMSDK_VERSION "*) ;;
  *) echo "unexpected emcc: $EMCC_VERSION" >&2; exit 1 ;;
esac

# Compile flags. No -ffast-math (clang's default is IEEE semantics; -fno-fast-math and
# -ffp-contract=off say so explicitly), no SIMD (so no relaxed SIMD), no threads.
DEFINES=(
  -DLIBOPENMPT_BUILD
  -DNDEBUG
  # Avoids std::random_device and the high resolution clock, which an AudioWorklet lacks.
  -DMPT_BUILD_AUDIOWORKLETPROCESSOR
)
INCLUDES=(-I"$SRC/src" -I"$SRC/common" -I"$SRC")
CXXFLAGS=(
  -std=c++20
  -O3
  -flto
  -fwasm-exceptions
  -fno-fast-math
  -ffp-contract=off
  -fvisibility=hidden
  -ffile-prefix-map="$SRC"=libopenmpt
  -ffile-prefix-map="$EMSDK"=emsdk
  -w
)

# The source list from libopenmpt's Makefile (LIBOPENMPT_CXX_SOURCES), without the
# optional miniz, minimp3, and stb_vorbis decoders: tracker formats don't need them.
SOURCES=()
for d in src/openmpt/all src/openmpt/base src/openmpt/logging src/openmpt/random common \
  src/openmpt/fileformat_base src/openmpt/soundbase src/openmpt/soundfile_data soundlib \
  soundlib/plugins soundlib/plugins/dmo sounddsp libopenmpt; do
  for f in "$SRC/$d"/*.cpp; do
    [ -e "$f" ] && SOURCES+=("${f#"$SRC/"}")
  done
done

log "Compiling ${#SOURCES[@]} files with $EMCC_VERSION ($JOBS jobs)"
rm -rf "$OBJ"
mkdir -p "$OBJ"
export SRC OBJ
printf '%s\n' "${SOURCES[@]}" | xargs -P "$JOBS" -I{} sh -c '
  o="$OBJ/$(printf "%s" "{}" | tr "/" "_").o"
  em++ "$@" -c "$SRC/{}" -o "$o"
' sh "${DEFINES[@]}" "${INCLUDES[@]}" "${CXXFLAGS[@]}"

# Exported C API: everything that works on a memory buffer, plus malloc and free. The
# stream callback entry points (openmpt_module_create2 and friends) are left out because
# they need function pointers from JS.
EXPORTS=(
  malloc free
  openmpt_get_library_version openmpt_get_core_version openmpt_free_string
  openmpt_get_string openmpt_get_supported_extensions openmpt_is_extension_supported
  openmpt_error_string
  openmpt_probe_file_header openmpt_probe_file_header_without_filesize
  openmpt_probe_file_header_get_recommended_size
  openmpt_module_create_from_memory2 openmpt_module_destroy
  openmpt_module_error_get_last openmpt_module_error_get_last_message
  openmpt_module_error_set_last openmpt_module_error_clear
  openmpt_module_select_subsong openmpt_module_get_selected_subsong
  openmpt_module_get_restart_order openmpt_module_get_restart_row
  openmpt_module_set_repeat_count openmpt_module_get_repeat_count
  openmpt_module_get_duration_seconds openmpt_module_get_time_at_position
  openmpt_module_set_position_seconds openmpt_module_get_position_seconds
  openmpt_module_set_position_order_row
  openmpt_module_get_render_param openmpt_module_set_render_param
  openmpt_module_read_float_mono openmpt_module_read_float_stereo
  openmpt_module_read_interleaved_float_stereo
  openmpt_module_get_metadata_keys openmpt_module_get_metadata
  openmpt_module_get_current_estimated_bpm openmpt_module_get_current_speed
  openmpt_module_get_current_tempo2 openmpt_module_get_current_order
  openmpt_module_get_current_pattern openmpt_module_get_current_row
  openmpt_module_get_current_playing_channels openmpt_module_get_current_channel_vu_mono
  openmpt_module_get_current_channel_vu_left openmpt_module_get_current_channel_vu_right
  openmpt_module_get_num_subsongs openmpt_module_get_num_channels
  openmpt_module_get_num_orders openmpt_module_get_num_patterns
  openmpt_module_get_num_instruments openmpt_module_get_num_samples
  openmpt_module_get_subsong_name openmpt_module_get_channel_name
  openmpt_module_get_order_name openmpt_module_get_pattern_name
  openmpt_module_get_instrument_name openmpt_module_get_sample_name
  openmpt_module_get_order_pattern openmpt_module_is_order_skip_entry
  openmpt_module_is_order_stop_entry openmpt_module_is_pattern_skip_item
  openmpt_module_is_pattern_stop_item openmpt_module_get_pattern_num_rows
  openmpt_module_get_pattern_rows_per_beat openmpt_module_get_pattern_rows_per_measure
  openmpt_module_get_pattern_row_channel_command
  openmpt_module_format_pattern_row_channel_command
  openmpt_module_highlight_pattern_row_channel_command
  openmpt_module_format_pattern_row_channel openmpt_module_highlight_pattern_row_channel
  openmpt_module_get_ctls openmpt_module_ctl_get_boolean openmpt_module_ctl_get_integer
  openmpt_module_ctl_get_floatingpoint openmpt_module_ctl_get_text openmpt_module_ctl_set
  openmpt_module_ctl_set_boolean openmpt_module_ctl_set_integer
  openmpt_module_ctl_set_floatingpoint openmpt_module_ctl_set_text
)
EXPORTED_FUNCTIONS=$(printf '_%s,' "${EXPORTS[@]}")
EXPORTED_FUNCTIONS=${EXPORTED_FUNCTIONS%,}

LDFLAGS=(
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
  -sEXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS"
)

log "Linking"
LINK_DIR="$WORK_DIR/link-$LIBOPENMPT_VERSION"
rm -rf "$LINK_DIR"
mkdir -p "$LINK_DIR"
(cd "$LINK_DIR" && em++ "${CXXFLAGS[@]}" "${LDFLAGS[@]}" "$OBJ"/*.o -o libopenmpt.js)

log "Writing $OUT_DIR"
mkdir -p "$OUT_DIR"
cp "$LINK_DIR/libopenmpt.js" "$LINK_DIR/libopenmpt.wasm" "$OUT_DIR/"
cp "$SRC/LICENSE" "$OUT_DIR/LICENSE"
chmod 644 "$OUT_DIR/libopenmpt.js" "$OUT_DIR/libopenmpt.wasm" "$OUT_DIR/LICENSE"
WASM_SHA256=$(sha256sum "$OUT_DIR/libopenmpt.wasm" | cut -d ' ' -f 1)
JS_SHA256=$(sha256sum "$OUT_DIR/libopenmpt.js" | cut -d ' ' -f 1)
WASM_BYTES=$(wc -c < "$OUT_DIR/libopenmpt.wasm" | tr -d ' ')
JS_BYTES=$(wc -c < "$OUT_DIR/libopenmpt.js" | tr -d ' ')

{
  echo '# libopenmpt build'
  echo
  echo 'Written by `tools/build-libopenmpt.sh`. Rerun the script instead of editing this file.'
  echo
  echo '## Inputs'
  echo
  echo "- libopenmpt $LIBOPENMPT_VERSION: tag \`$LIBOPENMPT_TAG\`, commit \`$LIBOPENMPT_COMMIT\`, from $LIBOPENMPT_REPO"
  echo "- emsdk $EMSDK_VERSION: commit \`$EMSDK_COMMIT\`, from $EMSDK_REPO"
  echo "- Compiler: \`$EMCC_VERSION\`"
  echo "- Built on $(date -u +%Y-%m-%d) (UTC)"
  echo "- Patches applied to libopenmpt, from \`tools/libopenmpt/\`:"
  for p in "$PATCH_DIR"/*.patch; do
    echo "  - \`$(basename "$p")\`"
  done
  echo
  echo '## Outputs'
  echo
  echo '| File | Bytes | SHA-256 |'
  echo '|---|---|---|'
  echo "| \`libopenmpt.wasm\` | $WASM_BYTES | \`$WASM_SHA256\` |"
  echo "| \`libopenmpt.js\` | $JS_BYTES | \`$JS_SHA256\` |"
  echo
  echo '`LICENSE` is libopenmpt'"'"'s license, copied from the source tree. `libopenmpt.d.ts` is'
  echo 'hand-written (the script leaves it alone); update it when the exported functions change.'
  echo
  echo '## Loading'
  echo
  echo 'The wasm is a separate file, not embedded in the loader (no `SINGLE_FILE`), so the'
  echo 'committed `libopenmpt.wasm` is the exact binary every environment runs and its SHA-256'
  echo 'above identifies the build. The loader finds it with'
  echo '`new URL("libopenmpt.wasm", import.meta.url)`: Node reads it from disk, and Vite emits it'
  echo 'as an asset and rewrites the URL. An AudioWorklet cannot fetch, so its caller fetches the'
  echo 'same file on the main thread and passes the bytes as `wasmBinary`.'
  echo
  echo 'Vite prints "Module \"node:module\" has been externalized for browser compatibility" for'
  echo 'this file. The loader imports `node:module` only when it runs in Node, so the warning is'
  echo 'harmless.'
  echo
  echo '## Determinism'
  echo
  echo '- No `-ffast-math`, no SIMD (so no relaxed SIMD), no threads, `FILESYSTEM=0`.'
  echo '- `deterministic-prng.patch` seeds each module'"'"'s playback PRNG with a fixed value. Without'
  echo '  it, IT random volume, panning and filter swing and the random vibrato waveforms render'
  echo '  differently on every load.'
  echo '- With volume ramping on (the default), the output depends on the frame counts passed to'
  echo '  `read_float_stereo`, by under 1e-6. Render in one fixed chunk size everywhere, or set'
  echo '  `volumeRampingStrength` to 0.'
  echo '- The 16-bit output functions dither with a PRNG seeded from the clock. The float'
  echo '  functions do not dither.'
  echo
  echo '## Compile flags'
  echo
  echo 'Paths are shown relative to the libopenmpt checkout.'
  echo
  echo '```'
  printf '%s\n' "${DEFINES[@]}" "-Isrc" "-Icommon" "-I." "${CXXFLAGS[@]}" \
    | sed -e "s|$SRC|<libopenmpt>|g" -e "s|$EMSDK|<emsdk>|g"
  echo '```'
  echo
  echo '## Link flags'
  echo
  echo 'The compile flags from `-std=c++20` on, plus:'
  echo
  echo '```'
  printf '%s\n' "${LDFLAGS[@]}" | grep -v '^-sEXPORTED_FUNCTIONS='
  echo '-sEXPORTED_FUNCTIONS=<the list below>'
  echo '```'
  echo
  echo '## Exported functions'
  echo
  echo '```'
  printf '_%s\n' "${EXPORTS[@]}"
  echo '```'
  echo
  echo '## Sources'
  echo
  echo '```'
  printf '%s\n' "${SOURCES[@]}"
  echo '```'
} > "$OUT_DIR/BUILD.md"

log "Done"
echo "libopenmpt.wasm  $WASM_BYTES bytes  sha256 $WASM_SHA256"
echo "libopenmpt.js    $JS_BYTES bytes  sha256 $JS_SHA256"
