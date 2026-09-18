#!/usr/bin/env bash
#
# T00 — determinism comparison evidence (M-5).
#
# M-5 finding: "deterministic: true" was asserted in
# docs/evidence/t00-work-result.yaml while the committed run pairs are not
# byte-identical (morgan timestamps, response byte sizes, jest durations and
# PASS-line ordering differ). This script fixes the claim by:
#   1. defining determinism explicitly (exit code + counters + suite outcome
#      set), and
#   2. emitting a committed normalized diff that shows the deterministic
#      observables are identical across the raw pairs.
#
# Raw logs are never rewritten: the comparison reads them and writes a
# separate artifact.
#
# Usage:
#   bash scripts/tow/determinism-evidence.sh
#
# Output:
#   docs/evidence/t00/determinism-normalized-diff.txt

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/evidence/t00"
OUT="$OUT_DIR/determinism-normalized-diff.txt"

# Extract only the deterministic observables from a raw run log.
fingerprint() {
  local file="$1"
  {
    grep -E '^(PASS|FAIL) ' "$file" 2>/dev/null | sort -u
    grep -E '^Test Suites: ' "$file" 2>/dev/null
    grep -E '^Tests: ' "$file" 2>/dev/null
    grep -E '^Snapshots: ' "$file" 2>/dev/null
    grep -E '^Ran all test suites' "$file" 2>/dev/null
    grep -E '^  (PASS|FAIL)  ' "$file" 2>/dev/null
    grep -E '^\[verify:tow\] (GREEN|RED)' "$file" 2>/dev/null
    grep -E '^exit_code=' "$file" 2>/dev/null
  } || true
}

status=0

{
  echo "# T00 determinism comparison (M-5)"
  echo "#"
  echo "# Definition — two runs of the same gate are DETERMINISTIC when:"
  echo "#   1. the exit code is identical;"
  echo "#   2. the 'Test Suites:' counter line is identical;"
  echo "#   3. the 'Tests:' counter line is identical;"
  echo "#   4. the set of suite outcomes (PASS/FAIL + suite path) is identical,"
  echo "#      independent of print order;"
  echo "#   5. for verify:tow, every stage result and the final verdict are identical."
  echo "#"
  echo "# Explicitly outside the definition (non-deterministic observables):"
  echo "#   - morgan access-log timestamps and response byte sizes (payload fields"
  echo "#     such as generated ids/timestamps vary between runs);"
  echo "#   - jest per-test/per-suite durations and the 'Time:' lines;"
  echo "#   - the order in which jest prints PASS lines (completion order)."
  echo "#"
  echo "# The raw run logs are kept byte-for-byte; this artifact only diffs the"
  echo "# extracted fingerprint. Reproduce with:"
  echo "#   bash scripts/tow/determinism-evidence.sh"
  echo
} > "$OUT"

compare_pair() {
  local label="$1"
  local a="$2"
  local b="$3"
  local fa fb

  fa="$(mktemp)"
  fb="$(mktemp)"

  {
    echo "==============================================================================="
    echo "## $label"
    echo "==============================================================================="
    echo "# left : ${a#$REPO_ROOT/}"
    echo "# right: ${b#$REPO_ROOT/}"
    echo
  } >> "$OUT"

  if [ ! -f "$a" ] || [ ! -f "$b" ]; then
    echo "MISSING LOG FILE — cannot compare" >> "$OUT"
    echo >> "$OUT"
    status=1
    rm -f "$fa" "$fb"
    return
  fi

  fingerprint "$a" > "$fa"
  fingerprint "$b" > "$fb"

  {
    echo "--- deterministic observables (normalized) ---"
    cat "$fa"
    echo
    echo "--- normalized diff (empty means identical) ---"
    if diff -u "$fa" "$fb"; then
      echo "(no differences)"
    fi
    echo
  } >> "$OUT"

  if diff -q "$fa" "$fb" > /dev/null 2>&1; then
    echo "RESULT: IDENTICAL" >> "$OUT"
  else
    echo "RESULT: DIFFERENT" >> "$OUT"
    status=1
  fi
  echo >> "$OUT"

  rm -f "$fa" "$fb"
}

compare_pair "focused Tow suite — run 1 vs run 2" \
  "$OUT_DIR/green-tow-focused.txt" \
  "$OUT_DIR/green-tow-focused-run2.txt"

compare_pair "verify:tow — run 1 vs run 2" \
  "$OUT_DIR/green-verify-tow-run1.txt" \
  "$OUT_DIR/green-verify-tow-run2.txt"

if [ "$status" -eq 0 ]; then
  echo "DETERMINISM CONFIRMED — deterministic observables identical in every pair"
else
  echo "DETERMINISM CHECK FAILED — see $OUT" >&2
fi
exit "$status"
