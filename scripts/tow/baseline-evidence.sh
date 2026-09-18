#!/usr/bin/env bash
#
# T00 — reproducible pre-T00 baseline capture (M-6).
#
# The audit (docs/tow/T00-CURRENT-STATE-AUDIT.md §3.15) and the work result
# claim a pre-T00 baseline ("focused: 2 skipped/8 passed suites, 9 skipped/195
# passed of 204; full: 2 skipped/35 passed suites, 9 skipped/550 passed of 559;
# exit 0, captured twice and identical"). Until this script existed, that claim
# had no in-repo artifact.
#
# This script materialises the baseline from a detached worktree pinned at the
# T00 execution base, runs the focused Tow suite and the full suite twice each,
# and commits the summary lines + exit codes under docs/evidence/t00/.
#
# Usage:
#   bash scripts/tow/baseline-evidence.sh
#
# Output:
#   docs/evidence/t00/baseline-focused.txt
#   docs/evidence/t00/baseline-full.txt
#
# Safety: read-only with respect to the main working tree. The throwaway
# worktree is removed on exit, including on failure.

set -uo pipefail

EXECUTION_BASE="${TOW_EXECUTION_BASE:-e1e7dd2d20d5da25df00d8106a904f14041654a1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/socorre_ai_backend"
OUT_DIR="$REPO_ROOT/docs/evidence/t00"
WORKTREE="$REPO_ROOT/.t00-baseline-worktree"
JEST_BIN="$BACKEND_DIR/node_modules/jest/bin/jest.js"

mkdir -p "$OUT_DIR"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

rm -rf "$WORKTREE"
git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" "$EXECUTION_BASE" >/dev/null 2>&1 || {
  echo "FATAL: cannot create worktree at $EXECUTION_BASE" >&2
  exit 1
}

# The base worktree installs nothing: jest and every test dependency resolve
# through the main checkout's node_modules, exactly like red-evidence.sh.
ln -sfn "$BACKEND_DIR/node_modules" "$WORKTREE/socorre_ai_backend/node_modules"
BASE_BACKEND="$WORKTREE/socorre_ai_backend"

status=0

# $1 = label, $2 = jest target, $3 = output file
capture_baseline() {
  local label="$1"
  local target="$2"
  local out="$3"
  local run1_fp run2_fp raw code run

  run1_fp="$(mktemp)"
  run2_fp="$(mktemp)"

  {
    echo "# T00 pre-T00 baseline — $label"
    echo "# execution base: $EXECUTION_BASE"
    echo "# command: node <backend>/node_modules/jest/bin/jest.js --rootDir . $target --runInBand"
    echo "# cwd: socorre_ai_backend @ $EXECUTION_BASE (detached worktree, node_modules symlinked)"
    echo "# two runs are captured to make the 'captured twice, identical' claim reproducible."
    echo
  } > "$out"

  for run in 1 2; do
    raw="$(cd "$BASE_BACKEND" && node "$JEST_BIN" --rootDir . $target --runInBand 2>&1)"
    code=$?
    {
      echo "=== run $run ==="
      echo "$raw" | grep -E '^(PASS|FAIL) |^Test Suites: |^Tests: |^Snapshots: '
      echo "exit_code=$code"
      echo
    } >> "$out"

    # Deterministic fingerprint: suite outcome set + counters + exit code.
    {
      echo "$raw" | grep -E '^(PASS|FAIL) ' | sort -u
      echo "$raw" | grep -E '^Test Suites: '
      echo "$raw" | grep -E '^Tests: '
      echo "$raw" | grep -E '^Snapshots: '
      echo "exit_code=$code"
    } > "$run1_fp.tmp"
    if [ "$run" -eq 1 ]; then mv "$run1_fp.tmp" "$run1_fp"; else mv "$run1_fp.tmp" "$run2_fp"; fi

    [ "$code" -eq 0 ] || status=1
  done

  if diff -u "$run1_fp" "$run2_fp" > /dev/null 2>&1; then
    echo "determinism: IDENTICAL (suite/test counts + suite outcome set + exit code)" >> "$out"
  else
    echo "determinism: DIFFERENT" >> "$out"
    diff -u "$run1_fp" "$run2_fp" >> "$out" || true
    status=1
  fi

  rm -f "$run1_fp" "$run2_fp"
}

capture_baseline "focused Tow suite" "tests/tow" "$OUT_DIR/baseline-focused.txt"
capture_baseline "full backend suite" "" "$OUT_DIR/baseline-full.txt"

echo "Baseline evidence captured in $OUT_DIR"
if [ "$status" -eq 0 ]; then
  echo "BASELINE GREEN (both commands exit 0; both runs identical)"
else
  echo "BASELINE RED (a run failed or the two runs differ)" >&2
fi
exit "$status"
