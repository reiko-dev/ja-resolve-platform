#!/usr/bin/env bash
#
# T00 — reproducible RED evidence capture.
#
# Proves, from a detached worktree pinned at the T00 execution base, that the
# Tow contract/validation harness did NOT exist and that the legacy payment
# gateways were non-deterministic. This is the "before" half of the RED -> GREEN
# evidence pair; the "after" half is produced by the canonical commands
# (npm run verify:tow, npx jest tests/tow --runInBand).
#
# Usage:
#   bash scripts/tow/red-evidence.sh
#
# Output: docs/evidence/t00/red-*.txt (raw, unedited command output)
#
# Safety: read-only with respect to the main working tree. The temporary
# worktree is removed on exit, including on failure.

set -uo pipefail

EXECUTION_BASE="${TOW_EXECUTION_BASE:-e1e7dd2d20d5da25df00d8106a904f14041654a1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/socorre_ai_backend"
OUT_DIR="$REPO_ROOT/docs/evidence/t00"
WORKTREE="$REPO_ROOT/.t00-red-worktree"
JEST_BIN="$BACKEND_DIR/node_modules/jest/bin/jest.js"

mkdir -p "$OUT_DIR"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

rm -rf "$WORKTREE"
git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" "$EXECUTION_BASE" >/dev/null 2>&1 || {
  echo "FATAL: cannot create worktree at $EXECUTION_BASE" >&2
  exit 1
}

BASE_BACKEND="$WORKTREE/socorre_ai_backend"
status=0

# --- RED-1: the contract gate does not exist at the base ---------------------
raw="$(cd "$BASE_BACKEND" && node "$JEST_BIN" --rootDir . tests/contract --runInBand 2>&1)"
code=$?
{
  echo "# RED-1: no in-repo OpenAPI/consumer contract gate at the execution base"
  echo "# command: node <backend>/node_modules/jest/bin/jest.js --rootDir . tests/contract --runInBand"
  echo "# cwd: socorre_ai_backend @ $EXECUTION_BASE"
  echo
  echo "$raw"
  echo
  echo "exit_code=$code"
} > "$OUT_DIR/red-1-contract-gate-absent.txt"
[ "$code" -ne 0 ] && echo "$raw" | grep -q "No tests found" || status=1

# --- RED-2: the OpenAPI validator does not exist at the base -----------------
raw="$(cd "$BASE_BACKEND" && node scripts/tow/validate-openapi.js 2>&1)"
code=$?
{
  echo "# RED-2: no in-repo OpenAPI 3.1 validator at the execution base"
  echo "# command: node scripts/tow/validate-openapi.js"
  echo "# cwd: socorre_ai_backend @ $EXECUTION_BASE"
  echo
  echo "$raw"
  echo
  echo "exit_code=$code"
} > "$OUT_DIR/red-2-openapi-validator-absent.txt"
[ "$code" -ne 0 ] && echo "$raw" | grep -q "Cannot find module" || status=1

# --- RED-3: the deterministic foundation does not exist at the base ----------
{
  echo "# RED-3: no deterministic Tow test foundation at the execution base"
  echo "# command: ls tests/helpers/ tests/tow/ ; test -e <each expected new path>"
  echo "# cwd: socorre_ai_backend @ $EXECUTION_BASE"
  echo
  (cd "$BASE_BACKEND" && ls tests/helpers/ && echo "---" && ls tests/tow/)
  echo
  for missing in \
    tests/helpers/towContract.js \
    tests/helpers/towConsumerFlows.js \
    tests/helpers/tow \
    tests/contract \
    tests/tow/foundation \
    docker-compose.test.yml \
    .env.test.example; do
    if [ -e "$BASE_BACKEND/$missing" ]; then
      echo "UNEXPECTED (present at base): $missing"
      status=1
    else
      echo "absent at base: $missing"
    fi
  done
} > "$OUT_DIR/red-3-deterministic-foundation-absent.txt"

# --- RED-4: legacy payment gateways are non-deterministic --------------------
raw="$(cd "$BASE_BACKEND" && grep -n 'Date\.now()\|Math\.random()\|setTimeout(' src/services/gateways/*.js)"
code=$?
{
  echo "# RED-4: legacy payment gateways are non-deterministic (real sleeps, wall clock, RNG)"
  echo "# command: grep -n 'Date\.now()|Math\.random()|setTimeout(' src/services/gateways/*.js"
  echo "# cwd: socorre_ai_backend @ $EXECUTION_BASE"
  echo
  echo "$raw"
  echo
  echo "grep_exit_code=$code"
  echo
  echo "# Consequence: any Tow test that exercises a gateway is slow, flaky and"
  echo "# cannot be replayed. T00 replaces them with deterministic port doubles"
  echo "# (tests/helpers/tow/gateways/) without changing production behavior."
} > "$OUT_DIR/red-4-legacy-gateway-nondeterminism.txt"
[ "$code" -eq 0 ] && echo "$raw" | grep -q "Math.random()" || status=1

echo "RED evidence captured in $OUT_DIR"
ls -1 "$OUT_DIR"
if [ "$status" -eq 0 ]; then
  echo "RED evidence verified"
else
  echo "WARNING: one or more RED expectations did not hold" >&2
fi
exit "$status"
