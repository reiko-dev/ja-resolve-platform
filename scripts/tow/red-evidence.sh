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
# RED-5 differs from RED-1..RED-4 on purpose. RED-1..RED-4 prove *absence* at
# the execution base (no gate, no validator, no foundation, non-deterministic
# gateways). RED-5 proves *detection*: it takes the committed harness, mutates
# the frozen contract into the explicitly prohibited pre-freeze form
# (`TowSettingsPatch` as `allOf: [TowSettings, {...}]`,
# TOW-OPENAPI-CONTRACT-DECISIONS.md §2) and shows the T00 contract suite failing
# with a real assertion error. That is the deficiency class the frozen decision
# forbids, and the guard must provably catch it.
#
# Usage:
#   bash scripts/tow/red-evidence.sh
#
# Output: docs/evidence/t00/red-*.txt (raw, unedited command output)
#
# Safety: read-only with respect to the main working tree. Both temporary
# worktrees are removed on exit, including on failure. The mutation happens
# only inside the throwaway RED-5 worktree.

set -uo pipefail

EXECUTION_BASE="${TOW_EXECUTION_BASE:-e1e7dd2d20d5da25df00d8106a904f14041654a1}"
RED5_REF="${TOW_RED5_REF:-HEAD}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/socorre_ai_backend"
OUT_DIR="$REPO_ROOT/docs/evidence/t00"
WORKTREE="$REPO_ROOT/.t00-red-worktree"
RED5_WORKTREE="$REPO_ROOT/.t00-red5-worktree"
JEST_BIN="$BACKEND_DIR/node_modules/jest/bin/jest.js"

mkdir -p "$OUT_DIR"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git -C "$REPO_ROOT" worktree remove --force "$RED5_WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" "$RED5_WORKTREE"
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

# --- RED-5: the frozen TowSettingsPatch decision is provably guarded ---------
# Mutation proof, not an absence proof: the harness exists (RED5_REF), the
# contract is mutated into the prohibited form, the contract suite must fail.
rm -rf "$RED5_WORKTREE"
git -C "$REPO_ROOT" worktree add --detach "$RED5_WORKTREE" "$RED5_REF" >/dev/null 2>&1 || {
  echo "FATAL: cannot create RED-5 worktree at $RED5_REF" >&2
  exit 1
}
# Jest, ajv, ajv-formats and yaml resolve through the main checkout's
# node_modules; the throwaway worktree installs nothing.
ln -sfn "$BACKEND_DIR/node_modules" "$RED5_WORKTREE/socorre_ai_backend/node_modules"

RED5_CONTRACT="$RED5_WORKTREE/docs/tow/tow-api-contract.openapi.yaml"
mutation="$(node -e '
const fs = require("fs");
const YAML = require(process.argv[2]);
const file = process.argv[1];
const doc = YAML.parse(fs.readFileSync(file, "utf8"));
const before = JSON.stringify(doc.components.schemas.TowSettingsPatch);
doc.components.schemas.TowSettingsPatch = {
  allOf: [
    { $ref: "#/components/schemas/TowSettings" },
    { type: "object", additionalProperties: false, minProperties: 1 },
  ],
};
fs.writeFileSync(file, YAML.stringify(doc));
process.stdout.write("before: " + before + "\nafter:  " + JSON.stringify(doc.components.schemas.TowSettingsPatch) + "\n");
' "$RED5_CONTRACT" "$BACKEND_DIR/node_modules/yaml")"
[ -n "$mutation" ] || { echo "FATAL: RED-5 contract mutation did not apply" >&2; exit 1; }

raw="$(cd "$RED5_WORKTREE/socorre_ai_backend" && node "$JEST_BIN" --rootDir . tests/contract --runInBand 2>&1)"
code=$?
{
  echo "# RED-5: the T00 contract gate provably detects the prohibited pre-freeze"
  echo "# TowSettingsPatch form (allOf over TowSettings)."
  echo "#"
  echo "# This is a MUTATION proof, not an absence proof: the harness is present at"
  echo "# $RED5_REF and the contract is mutated inside a throwaway worktree."
  echo "# Normative rule: docs/tow/TOW-OPENAPI-CONTRACT-DECISIONS.md §2"
  echo "#   'The previous allOf: TowSettings + object form is prohibited because"
  echo "#    TowSettings requires the complete object and would make generated"
  echo "#    clients treat PATCH as a full replacement.'"
  echo "#"
  echo "# command: node -e '<mutate TowSettingsPatch into allOf form>'"
  echo "#          node <backend>/node_modules/jest/bin/jest.js --rootDir . tests/contract --runInBand"
  echo "# cwd: socorre_ai_backend @ $RED5_REF (detached worktree)"
  echo "# mutation applied to: docs/tow/tow-api-contract.openapi.yaml"
  echo
  echo "$mutation"
  echo
  echo "$raw"
  echo
  echo "exit_code=$code"
  echo
  echo "# Verdict: the guard FAILS the mutated contract (expected). Restoring the"
  echo "# frozen standalone schema makes the same command exit 0 — see"
  echo "# docs/evidence/t00/green-contract-suite.txt."
} > "$OUT_DIR/red-5-tow-settings-patch-mutation.txt"

[ "$code" -ne 0 ] || { echo "WARNING: RED-5 expected a failing contract suite" >&2; status=1; }
echo "$raw" | grep -q "the contract does not compose the patch with allOf over TowSettings" || {
  echo "WARNING: RED-5 did not observe the TowSettingsPatch allOf assertion failing" >&2
  status=1
}
echo "$raw" | grep -q "can't resolve reference #/components/schemas/TowSettings" || {
  echo "WARNING: RED-5 did not observe the inherited-required consequence" >&2
  status=1
}

echo "RED evidence captured in $OUT_DIR"
ls -1 "$OUT_DIR"
if [ "$status" -eq 0 ]; then
  echo "RED evidence verified"
else
  echo "WARNING: one or more RED expectations did not hold" >&2
fi
exit "$status"
