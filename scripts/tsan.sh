#!/usr/bin/env bash
# Build the addon (and QuickFIX) with ThreadSanitizer into build-tsan/, run the
# test suite against it, and fail if any TSan report has a frame in this
# addon's store or bridge code.
#
#   scripts/tsan.sh [test files...]      (default: the whole suite)
#
# Node itself is not instrumented, so the run is expected to produce reports in
# node / V8 / libstdc++ frames; those are noise. The gate is on reports whose
# stacks mention napi_quickfix:: or cpp/ frames of ours. QuickFIX's own frames
# are listed in the summary but do not fail the run (the baseline before the
# store work had none).
#
# Linux only. Requires gcc with libtsan (gcc -print-file-name=libtsan.so).
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

npx cmake-js compile --out "$OUT" \
  --CDCMAKE_BUILD_TYPE=RelWithDebInfo \
  --CDCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  "--CDCMAKE_CXX_FLAGS=-DBUILDING_NODE_EXTENSION -fsanitize=thread -fno-omit-frame-pointer" \
  "--CDCMAKE_SHARED_LINKER_FLAGS=-fsanitize=thread" \
  "${extra[@]}"

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
echo "== ThreadSanitizer summary =="
reports=$(cat "$LOGS"/tsan.* 2>/dev/null | grep -c '^WARNING: ThreadSanitizer' || true)
echo "reports: $reports (logs in $LOGS)"
cat "$LOGS"/tsan.* 2>/dev/null | grep '^SUMMARY' | sort | uniq -c | sort -rn || true

ours=$(cat "$LOGS"/tsan.* 2>/dev/null | grep -E -c 'napi_quickfix::|/cpp/[a-z_]+\.(cpp|h):' || true)
echo "frames in this addon's code: $ours"
if [ "$ours" -gt 0 ]; then
  echo "TSan reports touch napi_quickfix frames:" >&2
  cat "$LOGS"/tsan.* | grep -E -B12 -A3 'napi_quickfix::|/cpp/[a-z_]+\.(cpp|h):' >&2 || true
  exit 1
fi
if [ "$status" -ne 0 ]; then
  echo "tests failed under TSan (exit $status)" >&2
  exit "$status"
fi
echo "TSan: clean on napi_quickfix frames"
