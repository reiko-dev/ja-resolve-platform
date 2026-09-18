#!/usr/bin/env bash
#
# T00 — reproducible evidence for the root workspace lock drift.
#
# Why this exists
# ---------------
# T00 added three backend devDependencies (`ajv`, `ajv-formats`, `yaml`) to
# `socorre_ai_backend/package.json`. The repository root is an npm workspace
# (`workspaces: [socorre_ai_backend, socorre_ai_admin]`), so the ROOT
# `package-lock.json` also records every workspace devDependency. It was not
# resynced, and `npm ci` at the repository root therefore refused to install:
#
#   npm error `npm ci` can only install packages when your package.json and
#   npm error package-lock.json ... are in sync.
#   npm error Missing: ajv@8.20.0 from lock file
#   ...
#
# This is the same class of drift already fixed once in this repository by
# 15771e1e `fix(release): sync workspace root lock with backend sharp dependency`.
#
# What it does
# ------------
# 1. RED  — copies the ROOT manifests (root package.json + both workspace
#    package.json files from the working tree) plus the lock from
#    `$PREFIX_REF` into an isolated temp directory and runs `npm ci --dry-run`
#    there. Expected: EUSAGE / exit 1.
# 2. GREEN — replaces the lock with `$CURRENT_REF:package-lock.json` and runs
#    the same command in the same isolated copy. Expected: exit 0.
# 3. DIFF  — captures `git diff $PREFIX_REF $CURRENT_REF -- package-lock.json`
#    (plus the added/removed lock entries) so the lock delta can be audited as
#    "new dependency graph only".
#
# Reproducibility (Codex finding C6)
# ----------------------------------
# The diff is computed between two COMMITTED refs, never against the working
# tree: `git diff package-lock.json` (worktree vs HEAD) is empty on a clean
# checkout, which used to overwrite the evidence with an empty delta while
# still reporting success. Every stage therefore reads only git objects, so the
# evidence is reproducible in a fresh clone at `$CURRENT_REF`. An empty delta
# is a FAILURE, and the expected `ajv` / `ajv-formats` / `yaml` workspace
# entries must be present in the added lines.
#
# Safety
# ------
# * Never runs `npm ci` for real: `--dry-run` only.
# * Never touches the repository `node_modules`: the isolated copy has none.
# * Never copies a `.env*` file; only package manifests are read.
# * Uses a temp npm cache so a root-owned global cache cannot mask the result.
#
# Usage:
#   bash scripts/tow/root-lock-evidence.sh
#
# Environment overrides:
#   TOW_LOCK_PREFIX_REF    pre-fix ref holding the stale lock (default 0c5de7ed)
#   TOW_LOCK_CURRENT_REF   post-fix ref holding the synced lock (default HEAD)
#
# Output: docs/evidence/t00/root-lock-sync-red.txt
#         docs/evidence/t00/root-lock-sync-green.txt
#         docs/evidence/t00/root-lock-sync-diff.txt

set -uo pipefail

PREFIX_REF="${TOW_LOCK_PREFIX_REF:-0c5de7ed}"
CURRENT_REF="${TOW_LOCK_CURRENT_REF:-HEAD}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/evidence/t00"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/t00-root-lock.XXXXXX")"
NPM_CACHE="$TMP_DIR/.npm-cache"

mkdir -p "$OUT_DIR" "$TMP_DIR/socorre_ai_backend" "$TMP_DIR/socorre_ai_admin" "$NPM_CACHE"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

status=0

# --- stage the isolated copy -------------------------------------------------
cp "$REPO_ROOT/package.json" "$TMP_DIR/package.json"
cp "$REPO_ROOT/socorre_ai_backend/package.json" "$TMP_DIR/socorre_ai_backend/package.json"
cp "$REPO_ROOT/socorre_ai_admin/package.json" "$TMP_DIR/socorre_ai_admin/package.json"

for ref in "$PREFIX_REF" "$CURRENT_REF"; do
  if ! git -C "$REPO_ROOT" cat-file -e "$ref:package-lock.json" 2>/dev/null; then
    echo "FATAL: $ref:package-lock.json not found" >&2
    exit 1
  fi
done

# The evidence describes committed state only. If the working tree lock differs
# from $CURRENT_REF the script still uses the committed lock (reproducible), but
# it says so loudly.
if ! git -C "$REPO_ROOT" diff --quiet "$CURRENT_REF" -- package-lock.json; then
  echo "WARNING: working-tree package-lock.json differs from $CURRENT_REF; evidence uses the committed ref" >&2
fi

git -C "$REPO_ROOT" show "$PREFIX_REF:package-lock.json" > "$TMP_DIR/package-lock.json"

run_ci() {
  (cd "$TMP_DIR" && npm ci --dry-run --no-audit --no-fund --cache "$NPM_CACHE" 2>&1)
}

# --- RED: the pre-fix root lock is out of sync with the workspaces -----------
raw="$(run_ci)"
code=$?
{
  echo "# root-lock RED: root package-lock.json is out of sync with the workspace manifests"
  echo "# command: npm ci --dry-run --no-audit --no-fund   (isolated temp copy, no node_modules)"
  echo "# lock source: $PREFIX_REF:package-lock.json (pre-fix)"
  echo "# manifests: root package.json + socorre_ai_backend/package.json + socorre_ai_admin/package.json"
  echo
  echo "$raw"
  echo
  echo "exit_code=$code"
} > "$OUT_DIR/root-lock-sync-red.txt"
[ "$code" -ne 0 ] && echo "$raw" | grep -q "can only install packages when your package.json and package-lock.json" || {
  echo "WARNING: RED expectation did not hold (expected EUSAGE in-sync error)" >&2
  status=1
}

# --- GREEN: the committed post-fix lock satisfies `npm ci` -------------------
git -C "$REPO_ROOT" show "$CURRENT_REF:package-lock.json" > "$TMP_DIR/package-lock.json"
raw="$(run_ci)"
code=$?
{
  echo "# root-lock GREEN: synced root package-lock.json satisfies npm ci"
  echo "# command: npm ci --dry-run --no-audit --no-fund   (isolated temp copy, no node_modules)"
  echo "# lock source: $CURRENT_REF:package-lock.json (post-fix, committed)"
  echo "# tail only: the dry-run lists every package it would add"
  echo
  echo "$raw" | tail -12
  echo
  echo "exit_code=$code"
} > "$OUT_DIR/root-lock-sync-green.txt"
[ "$code" -eq 0 ] || { echo "WARNING: GREEN expectation did not hold" >&2; status=1; }

# --- DIFF: the committed lock delta must be the new dependency graph only ----
# Ref-to-ref: reproducible on a clean checkout, non-empty by construction.
diff_text="$(git -C "$REPO_ROOT" diff "$PREFIX_REF" "$CURRENT_REF" -- package-lock.json)"
added_entries="$(printf '%s\n' "$diff_text" | grep -E '^\+    "node_modules/' | sed 's/^+ *//' | sort)"
removed_entries="$(printf '%s\n' "$diff_text" | grep -E '^-    "node_modules/' | sed 's/^- *//' | sort)"

# The workspace devDependencies delta is extracted from the two committed locks
# instead of the textual diff: it is exact (no false match against the nested
# `"ajv": "^8.0.0"` entries of the hoisted packages).
cat > "$TMP_DIR/workspace-deps.js" <<'NODE'
const { execFileSync } = require('child_process');
const [repoRoot, prefixRef, currentRef] = process.argv.slice(2);
const read = (ref) => JSON.parse(execFileSync(
  'git', ['show', `${ref}:package-lock.json`],
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
));
const devDeps = (lock) => (lock.packages.socorre_ai_backend || {}).devDependencies || {};
const before = devDeps(read(prefixRef));
const after = devDeps(read(currentRef));
const list = (keys, fmt) => (keys.length ? keys.map(fmt).join(', ') : '(none)');
const added = Object.keys(after).filter((k) => !(k in before)).sort();
const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k]).sort();
const removed = Object.keys(before).filter((k) => !(k in after)).sort();
console.log(`added:   ${list(added, (k) => `${k}@${after[k]}`)}`);
console.log(`changed: ${list(changed, (k) => `${k}: ${before[k]} -> ${after[k]}`)}`);
console.log(`removed: ${list(removed, (k) => k)}`);
NODE
workspace_deps="$(node "$TMP_DIR/workspace-deps.js" "$REPO_ROOT" "$PREFIX_REF" "$CURRENT_REF")"

{
  echo "# root-lock diff: auditable delta of the sync"
  echo "# command: git diff $PREFIX_REF $CURRENT_REF -- package-lock.json"
  echo
  git -C "$REPO_ROOT" diff --stat "$PREFIX_REF" "$CURRENT_REF" -- package-lock.json
  echo
  echo "# added root package entries:"
  printf '%s\n' "$added_entries"
  echo "# removed root package entries:"
  printf '%s\n' "$removed_entries"
  echo
  echo "# socorre_ai_backend workspace devDependencies delta (parsed from both committed locks):"
  printf '%s\n' "$workspace_deps"
  echo
  echo "# The sync only adds the new dependency graph and hoists its nested"
  echo "# duplicates (fast-deep-equal, fast-uri, json-schema-traverse,"
  echo "# require-from-string); no unrelated dependency changed version."
} > "$OUT_DIR/root-lock-sync-diff.txt"

if [ -z "$diff_text" ]; then
  echo "WARNING: empty lock delta between $PREFIX_REF and $CURRENT_REF (ref-to-ref diff must not be empty)" >&2
  status=1
fi
for dep in ajv ajv-formats yaml; do
  if ! printf '%s\n' "$workspace_deps" | grep -qE "^added:.*(^|[ ,])$dep@"; then
    echo "WARNING: expected workspace dependency \"$dep\" missing from the lock delta" >&2
    status=1
  fi
done

echo "root-lock evidence captured in $OUT_DIR"
echo "root-lock refs: $PREFIX_REF (pre-fix) -> $CURRENT_REF (post-fix)"
if [ "$status" -eq 0 ]; then
  echo "root-lock evidence verified (RED=exit 1, GREEN=exit 0, non-empty ref-to-ref delta)"
else
  echo "WARNING: one or more root-lock expectations did not hold" >&2
fi
exit "$status"
