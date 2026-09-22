#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="${ROOT_DIR}/.gitleaks.toml"
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.30.1}"
MODE="dir"

usage() {
  echo "Usage: $0 [--history]" >&2
  echo "  (default)  scan the working tree" >&2
  echo "  --history  scan the full git history" >&2
  echo "Scanner binary can be overridden with GITLEAKS_BIN=/path/to/gitleaks" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --history) MODE="git" ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
  shift
done

run_local() {
  local bin="$1"
  "$bin" "$MODE" --no-banner --redact --config "$CONFIG_FILE" "$ROOT_DIR"
}

if [ -n "${GITLEAKS_BIN:-}" ] && [ -x "${GITLEAKS_BIN}" ]; then
  run_local "$GITLEAKS_BIN"
elif command -v gitleaks >/dev/null 2>&1; then
  run_local "$(command -v gitleaks)"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "${ROOT_DIR}:/repo" -w /repo "$GITLEAKS_IMAGE" "$MODE" --no-banner --redact --config /repo/.gitleaks.toml /repo
else
  echo "gitleaks is not installed and docker is unavailable." >&2
  echo "Install gitleaks (https://github.com/gitleaks/gitleaks#installing) or set GITLEAKS_BIN=/path/to/gitleaks." >&2
  exit 127
fi
