#!/usr/bin/env bash
# Build the addon (and QuickFIX) with ThreadSanitizer into build-tsan/, run the
# test suite against it, and fail if a TSan report races in this addon's code
# or is a QuickFIX race not known to be upstream's.
#
#   scripts/tsan.sh [test files...]      (default: the whole suite)
#
# Node itself is not instrumented, so the run is expected to produce reports in
# node / V8 / libstdc++ frames; those are noise. QuickFIX v1.16.0 has races of
# its own (FIX::Mutex's recursion bookkeeping, SessionState's enabled flag,
# logon flags and heartbeat timestamps), reached from any thread that calls
# into a session or stops the engine;
# they are listed but do not fail the run. scripts/tsan-gate.py classifies
# each report by its two racing accesses and holds that list.
#
# Linux only. Requires gcc with libtsan (gcc -print-file-name=libtsan.so),
# binutils (nm, addr2line) and python3.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT=build-tsan
LOGS=${TSAN_LOGS:-$OUT/logs}
QF_SRC=${QUICKFIX_SOURCE_DIR:-}
mkdir -p "$LOGS"
rm -f "$LOGS"/tsan.*

LIBTSAN=$(gcc -print-file-name=libtsan.so)
if [ ! -f "$LIBTSAN" ]; then
  echo "libtsan.so not found (gcc -print-file-name=libtsan.so -> $LIBTSAN)" >&2
  exit 2
fi

extra=()
if [ -n "$QF_SRC" ]; then
  extra+=("--CDFETCHCONTENT_SOURCE_DIR_QUICKFIX=$QF_SRC")
fi

# The sanitizer flags go through the per-config variables: cmake-js passes its
# own -DCMAKE_CXX_FLAGS=-DBUILDING_NODE_EXTENSION AFTER the --CD defines on
# Linux, so a --CDCMAKE_CXX_FLAGS (or CXXFLAGS) is silently replaced and only
# the linker flag gets through. QuickFIX writes its archive to
# QUICKFIX_LIB_OUTPUT_DIR (default: <repo>/lib, shared with the regular build):
# keep the instrumented one apart so it is never linked into build/.
# configure, then build: `cmake-js compile`/`build` skip the configure step
# for an already-configured $OUT, so changed --CD values would never reach
# its cache.
san="-fsanitize=thread -fno-omit-frame-pointer"
npx cmake-js configure --out "$OUT" \
  --CDCMAKE_BUILD_TYPE=RelWithDebInfo \
  --CDCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  "--CDCMAKE_CXX_FLAGS_RELWITHDEBINFO=-O2 -g -DNDEBUG $san" \
  "--CDCMAKE_C_FLAGS_RELWITHDEBINFO=-O2 -g -DNDEBUG $san" \
  "--CDCMAKE_SHARED_LINKER_FLAGS=-fsanitize=thread" \
  "--CDQUICKFIX_LIB_OUTPUT_DIR=$PWD/$OUT/lib" \
  "${extra[@]}"
npx cmake-js build --out "$OUT"

# An uninstrumented build runs the suite fine and reports nothing in our
# frames, so the gate would pass vacuously: refuse it.
for bin in "$OUT/Release/napi_quickfix.node" "$OUT/lib/libquickfix.a"; do
  # grep -c, not -q: an early grep exit would SIGPIPE nm and, with pipefail,
  # fail the pipeline for an instrumented binary.
  if [ "$(nm "$bin" 2>/dev/null | grep -c ' U __tsan_' || true)" -eq 0 ]; then
    echo "$bin is not instrumented with ThreadSanitizer (no __tsan_ symbols)" >&2
    exit 2
  fi
done

# The loader resolves build/Release/napi_quickfix.node: swap the TSan binary
# in for the run and restore the regular one afterwards.
mkdir -p build/Release
restore=""
if [ -f build/Release/napi_quickfix.node ]; then
  cp build/Release/napi_quickfix.node "$OUT/napi_quickfix.node.orig"
  restore="$OUT/napi_quickfix.node.orig"
fi
cp "$OUT/Release/napi_quickfix.node" build/Release/napi_quickfix.node
trap 'if [ -n "$restore" ]; then cp "$restore" build/Release/napi_quickfix.node; fi' EXIT

files=("$@")
if [ ${#files[@]} -eq 0 ]; then
  files=(test/*.test.ts)
fi

status=0
LD_PRELOAD="$LIBTSAN" \
TSAN_OPTIONS="log_path=$LOGS/tsan exitcode=0 halt_on_error=0 report_signal_unsafe=0" \
  node --test --import tsx "${files[@]}" || status=$?

echo
echo "== ThreadSanitizer summary (logs in $LOGS) =="
gate=0
python3 scripts/tsan-gate.py "$OUT/Release/napi_quickfix.node" "$LOGS" || gate=$?
if [ "$gate" -ne 0 ]; then
  echo "TSan: reports with a racing access in this addon or an unknown QuickFIX race (above)" >&2
  exit 1
fi
if [ "$status" -ne 0 ]; then
  echo "tests failed under TSan (exit $status)" >&2
  exit "$status"
fi
echo "TSan: no race in this addon's code, no unknown QuickFIX race"
