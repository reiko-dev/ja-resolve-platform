#!/usr/bin/env bash
#
# T00 — normalize captured command output before committing it as evidence.
#
# Why this exists (Muse M4-3)
# ---------------------------
# Docker Compose prints progress lines with trailing padding ("Creating ",
# "Created ", "Removing "), so a raw capture makes
# `git diff --check <base>..<head>` report trailing whitespace in the committed
# evidence. This filter strips trailing whitespace on every line, in place, so
# the artifact is clean without altering the command output:
#
#   cmd > /tmp/raw.txt
#   bash scripts/tow/normalize-evidence.sh /tmp/raw.txt
#
# The worktree check (`git diff --check`) and the range check
# (`git diff --check <base>..<head>`) must both be clean after normalization.
#
# Usage: normalize-evidence.sh <file> [<file>...]
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: normalize-evidence.sh <file> [<file>...]" >&2
  exit 2
fi

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "normalize-evidence.sh: not a file: $file" >&2
    exit 2
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/tow-evidence.XXXXXX")"
  # Strip spaces/tabs before every line end; keep the content otherwise intact.
  sed -e 's/[[:space:]]*$//' "$file" > "$tmp"
  mv "$tmp" "$file"
done
