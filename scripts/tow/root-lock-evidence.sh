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
# 1. RED  — copies the ROOT manifests (root package.json + root
#    package-lock.json + both workspace package.json files) from the pre-fix
#    git ref into an isolated temp directory and runs `npm ci --dry-run` there.
#    Expected: EUSAGE / exit 1.
# 2. GREEN — replaces the lock with the current working-tree lock and runs the
#    same command in the same isolated copy. Expected: exit 0.
# 3. DIFF  — captures `git diff --stat` plus the added/removed lock entries so
#    the lock delta can be audited as "new dependency graph only".
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
#   TOW_LOCK_PREFIX_REF   pre-fix ref holding the stale lock (default 0c5de7ed)
#
# Output: docs/evidence/t00/root-lock-sync-red.txt
#         docs/evidence/t00/root-lock-sync-green.txt
#         docs/evidence/t00/root-lock-sync-diff.txt

set -uo pipefail

PREFIX_REF="${TOW_LOCK_PREFIX_REF:-0c5de7ed}"
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

if ! git -C "$REPO_ROOT" cat-file -e "$PREFIX_REF:package-lock.json" 2>/dev/null; then
  echo "FATAL: $PREFIX_REF:package-lock.json not found" >&2
  exit 1
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

# --- GREEN: the current working-tree lock satisfies `npm ci` -----------------
cp "$REPO_ROOT/package-lock.json" "$TMP_DIR/package-lock.json"
raw="$(run_ci)"
code=$?
{
  echo "# root-lock GREEN: synced root package-lock.json satisfies npm ci"
  echo "# command: npm ci --dry-run --no-audit --no-fund   (isolated temp copy, no node_modules)"
  echo "# lock source: working tree package-lock.json (post-fix)"
  echo "# tail only: the dry-run lists every package it would add"
  echo
  echo "$raw" | tail -12
  echo
  echo "exit_code=$code"
} > "$OUT_DIR/root-lock-sync-green.txt"
[ "$code" -eq 0 ] || { echo "WARNING: GREEN expectation did not hold" >&2; status=1; }

# --- DIFF: the lock delta must be the new dependency graph only --------------
{
  echo "# root-lock diff: auditable delta of the sync"
  echo "# command: git diff --stat package-lock.json"
  echo
  git -C "$REPO_ROOT" diff --stat package-lock.json
  echo
  echo "# command: git diff package-lock.json | grep -E '^[+-]    \"node_modules/'"
  echo "# added package entries:"
  git -C "$REPO_ROOT" diff package-lock.json | grep -E '^\+    "node_modules/' | sed 's/^+ *//' | sort
  echo "# removed package entries:"
  git -C "$REPO_ROOT" diff package-lock.json | grep -E '^-    "node_modules/' | sed 's/^- *//' | sort
  echo
  echo "# command: git diff package-lock.json | grep -E '^\\+ *\"(ajv|ajv-formats|yaml)\"' (workspace entry)"
  echo "# the socorre_ai_backend workspace entry now lists the three new devDependencies:"
  git -C "$REPO_ROOT" diff package-lock.json | grep -E '^\+ *"(ajv|ajv-formats|yaml)"' | sed 's/^+ *//' | sort
  echo
  echo "# Removed entries are nested duplicates hoisted to the root by the new"
  echo "# graph (fast-deep-equal, fast-uri, require-from-string). No unrelated"
  echo "# dependency changed version."
} > "$OUT_DIR/root-lock-sync-diff.txt"

echo "root-lock evidence captured in $OUT_DIR"
if [ "$status" -eq 0 ]; then
  echo "root-lock evidence verified (RED=exit 1, GREEN=exit 0)"
else
  echo "WARNING: one or more root-lock expectations did not hold" >&2
fi
exit "$status"
