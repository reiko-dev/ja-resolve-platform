#!/usr/bin/env bash
#
# T00 — negative controls for the four central harness findings (Codex review).
#
# A regression test is only worth its name if it FAILS when the fix is undone.
# For each finding this script re-creates the pre-fix state in a throwaway copy
# of `socorre_ai_backend/` (node_modules symlinked, repository untouched) and
# runs the new regression suite against it:
#
#   NC-C1  `.env.test` never loaded        -> revert pg-guard.js, test-env.js and
#                                             postgres.js to the pre-fix fixture
#   NC-C2  compose/client port divergence  -> revert docker-compose.test.yml
#   NC-C3  up() outside the cleanup scope  -> revert test-env.js, then (a) run the
#                                             lifecycle suite and (b) run a probe
#                                             that reports whether `down()` ran
#   NC-C4  Express/PG test false positive  -> run the pre-fix version of the e2e
#                                             suite with the app pointed away
#                                             from the disposable database
#                                             (DB_SSL=true, no TLS in tmpfs)
#
# Pre-fix fixture (Muse finding M3-1 / Codex thread 4047474342)
# -------------------------------------------------------------
# The pre-fix files come from `TOW_NC_PREFIX_REF` (default 74e44590, the commit
# the Codex correction series was built on), NEVER from `HEAD`: once the fixes
# are committed, `HEAD` holds the fixed files, so restoring from `HEAD` would
# silently turn every control into a no-op and the script would exit red.
# The script fails fast when the pinned ref does not resolve to a real commit,
# when it equals `HEAD`, or when it does not actually differ from `HEAD` in the
# controlled files — the fixture cannot silently degrade again.
#
# Every control asserts that Jest really ran (a script error must never be
# mistaken for a red suite) and, where possible, that the failure is the one
# under review.
#
# NC-C4 needs the disposable container: this script starts it with the FIXED
# compose definition and destroys it again (also when a control fails).
#
# Nothing here is a substitute for the gates: it is the proof that the gates
# would have caught the reviewed defects.
#
# Output: docs/evidence/t00/negative-controls/*.txt
#
# Usage:
#   bash scripts/tow/negative-controls.sh
#
# Environment overrides:
#   TOW_NC_PREFIX_REF   pre-fix ref used as the fixture (default 74e44590)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$REPO_ROOT/socorre_ai_backend"
OUT_DIR="$REPO_ROOT/docs/evidence/t00/negative-controls"
PREFIX_REF="${TOW_NC_PREFIX_REF:-74e44590}"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/t00-negative-controls.XXXXXX")"
COPY="$WORK/backend"
FAKE_BIN="$WORK/fakebin"
PROBE="$WORK/probe-lifecycle.js"
NODE_BIN="$(command -v node)"

# Files reverted to the pre-fix fixture; each one backs at least one control.
CONTROLLED_FILES=(
  scripts/tow/pg-guard.js
  scripts/tow/test-env.js
  tests/helpers/tow/postgres.js
  docker-compose.test.yml
  tests/tow/foundation/towPostgresFoundation.e2e.test.js
)

mkdir -p "$OUT_DIR" "$COPY" "$FAKE_BIN"

cleanup() {
  ( cd "$BACKEND" && node scripts/tow/test-env.js down >/dev/null 2>&1 ) || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- pre-fix fixture guard (Muse finding M3-1 / Codex thread 4047474342) -----
# `HEAD` holds the fixed files, so the fixture must come from a pinned pre-fix
# ref. Refuse to run when that ref is missing, is HEAD, or matches HEAD in any
# controlled file: in those cases the controls would exercise fixed code while
# expecting failures, i.e. the fixture would silently be a no-op.
if ! PREFIX_SHA="$(git -C "$REPO_ROOT" rev-parse --verify --quiet "${PREFIX_REF}^{commit}")"; then
  echo "FATAL: TOW_NC_PREFIX_REF=$PREFIX_REF does not resolve to a commit in this repository" >&2
  exit 1
fi
if [ "$PREFIX_SHA" = "$HEAD_SHA" ]; then
  echo "FATAL: TOW_NC_PREFIX_REF=$PREFIX_REF resolves to HEAD ($HEAD_SHA); the pre-fix fixture would be a no-op" >&2
  exit 1
fi
identical_fixtures=()
for file in "${CONTROLLED_FILES[@]}"; do
  if git -C "$REPO_ROOT" diff --quiet "$PREFIX_SHA" "$HEAD_SHA" -- "socorre_ai_backend/$file"; then
    identical_fixtures+=("$file")
  fi
done
if [ "${#identical_fixtures[@]}" -gt 0 ]; then
  echo "FATAL: pre-fix fixture $PREFIX_REF is identical to HEAD for: ${identical_fixtures[*]}; the fixture would be a no-op" >&2
  exit 1
fi

# Throwaway copy of the backend: real sources, shared node_modules.
rsync -a --exclude node_modules --exclude .git --exclude coverage --exclude '.env*' \
  "$BACKEND/" "$COPY/"
ln -s "$BACKEND/node_modules" "$COPY/node_modules"

restore_prefix() { # $1 = path relative to socorre_ai_backend
  git -C "$REPO_ROOT" show "$PREFIX_REF:socorre_ai_backend/$1" > "$COPY/$1"
}
restore_worktree() { # $1 = path relative to socorre_ai_backend
  cp "$BACKEND/$1" "$COPY/$1"
}

# A fake Docker that always fails `up` and records every invocation, so the
# probe below can prove whether the harness tore the environment down again.
cat > "$FAKE_BIN/docker" <<'FAKE'
#!/bin/sh
[ -n "${DOCKER_LOG:-}" ] && echo "$@" >> "$DOCKER_LOG"
for arg in "$@"; do
  if [ "$arg" = "up" ]; then
    echo "fake docker: refusing to start" >&2
    exit 1
  fi
done
echo "fake docker: $@"
exit 0
FAKE
chmod 755 "$FAKE_BIN/docker"

# Lifecycle probe: run the REAL `runWithEnvironment()` against a Docker that
# refuses `up`, then report whether a teardown was attempted. This is the exact
# C3 scenario: startup fails part-way and the environment must not leak.
cat > "$PROBE" <<'JS'
'use strict';
const fs = require('fs');
const modulePath = process.argv[2];
const testEnv = require(modulePath);
testEnv
  .runWithEnvironment(async () => { /* workload never runs: up() fails */ })
  .then(
    () => console.log('outcome=resolved'),
    (error) => console.log(`outcome=rejected reason=${error.message}`)
  )
  .finally(() => {
    const log = process.env.DOCKER_LOG && fs.existsSync(process.env.DOCKER_LOG)
      ? fs.readFileSync(process.env.DOCKER_LOG, 'utf8')
      : '';
    const has = (word) => new RegExp(`(^|\\s)${word}(\\s|$)`, 'm').test(log);
    console.log(`docker_up=${has('up')} docker_down=${has('down')}`);
    console.log('--- docker invocations ---');
    console.log(log.trim());
  });
JS

status=0
summary=()

# run_jest <log-name> [env pairs...] -- <jest args...>
run_jest() {
  local log="$1"; shift
  local envs=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do envs+=("$1"); shift; done
  [ "$#" -gt 0 ] && shift
  if [ "${#envs[@]}" -gt 0 ]; then
    ( cd "$COPY" && env "${envs[@]}" "$NODE_BIN" "$COPY/node_modules/jest/bin/jest.js" "$@" --runInBand ) \
      > "$OUT_DIR/$log.txt" 2>&1
  else
    ( cd "$COPY" && "$NODE_BIN" "$COPY/node_modules/jest/bin/jest.js" "$@" --runInBand ) \
      > "$OUT_DIR/$log.txt" 2>&1
  fi
  return $?
}

# run_probe <log-name> <path to test-env.js>
run_probe() {
  local log="$1" module_path="$2"
  ( cd "$COPY" && PATH="$FAKE_BIN" DOCKER_LOG="$WORK/$log.docker.log" \
      TOW_POSTGRES_E2E=1 DB_HOST=127.0.0.1 DB_PORT=55432 \
      DB_NAME_TEST=socorre_ai_tow_test DB_USER=tow_test DB_PASSWORD=tow_test_password \
      "$NODE_BIN" "$PROBE" "$module_path" ) > "$OUT_DIR/$log.txt" 2>&1
  return $?
}

jest_ran() { grep -q '^Test Suites:' "$OUT_DIR/$1.txt"; }
jest_had_failures() { grep -qE '^Tests:.*failed' "$OUT_DIR/$1.txt"; }
jest_was_green() {
  grep -qE '^Tests:.*[0-9]+ passed' "$OUT_DIR/$1.txt" && ! jest_had_failures "$1"
}

# expect <label> <ok 0|1> <log-name> <detail>
expect() {
  local label="$1" ok="$2" log="$3" detail="$4"
  if [ "$ok" -eq 1 ]; then
    summary+=("PASS  $label -> docs/evidence/t00/negative-controls/$log.txt")
  else
    summary+=("FAIL  $label -> docs/evidence/t00/negative-controls/$log.txt")
    status=1
  fi
  printf '%s — %s\n' "$label" "$detail"
}

echo "== T00 negative controls =="
echo "pre-fix fixture: TOW_NC_PREFIX_REF=$PREFIX_REF ($PREFIX_SHA) — differs from HEAD in all ${#CONTROLLED_FILES[@]} controlled files"
echo "current HEAD:    $HEAD_SHA (fixed code under control; the fixture is never read from HEAD)"
echo

echo "== NC-C1: .env.test was never loaded (pre-fix entrypoints) =="
restore_prefix scripts/tow/pg-guard.js
restore_prefix scripts/tow/test-env.js
restore_prefix tests/helpers/tow/postgres.js
run_jest nc-c1-env-file-not-loaded -- tests/tow/foundation/towHarnessEnvFile.test.js
c1_exit=$?
c1_ok=0
if jest_ran nc-c1-env-file-not-loaded && jest_had_failures nc-c1-env-file-not-loaded && [ "$c1_exit" -ne 0 ]; then c1_ok=1; fi
expect "NC-C1 the env-file regression suite fails on the pre-fix loader" "$c1_ok" nc-c1-env-file-not-loaded \
  "jest exit $c1_exit; reverted: pg-guard.js, test-env.js, postgres.js"
grep -E '^  ● ' "$OUT_DIR/nc-c1-env-file-not-loaded.txt" | sed 's/^/    failing: /' | head -6

echo "== NC-C2: compose port diverges from the client port =="
restore_worktree scripts/tow/pg-guard.js
restore_worktree scripts/tow/test-env.js
restore_worktree tests/helpers/tow/postgres.js
restore_prefix docker-compose.test.yml
run_jest nc-c2-compose-port -- tests/tow/foundation/towPostgresGuard.test.js
c2_exit=$?
c2_ok=0
if jest_ran nc-c2-compose-port && jest_had_failures nc-c2-compose-port && [ "$c2_exit" -ne 0 ]; then c2_ok=1; fi
expect "NC-C2 the port regression suite fails on the pre-fix compose file" "$c2_ok" nc-c2-compose-port \
  "jest exit $c2_exit; reverted: docker-compose.test.yml"
grep -E '^  ● ' "$OUT_DIR/nc-c2-compose-port.txt" | sed 's/^/    failing: /' | head -6

echo "== NC-C3: up() outside the cleanup scope =="
restore_worktree docker-compose.test.yml
restore_prefix scripts/tow/test-env.js
# Same conditions for both runs: Docker exists but always refuses `up`.
run_jest nc-c3a-lifecycle-prefix PATH="$FAKE_BIN" TOW_POSTGRES_E2E=1 \
  DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME_TEST=socorre_ai_tow_test DB_USER=tow_test DB_PASSWORD=tow_test_password \
  -- tests/tow/foundation/towHarnessLifecycle.test.js
c3_exit=$?
c3_ok=0
if jest_ran nc-c3a-lifecycle-prefix && jest_had_failures nc-c3a-lifecycle-prefix && [ "$c3_exit" -ne 0 ]; then c3_ok=1; fi
expect "NC-C3a the lifecycle regression suite fails on the pre-fix teardown scope" "$c3_ok" nc-c3a-lifecycle-prefix \
  "jest exit $c3_exit; reverted: test-env.js"

run_probe nc-c3b-probe-prefix "$COPY/scripts/tow/test-env.js"
if grep -q 'docker_up=true docker_down=false' "$OUT_DIR/nc-c3b-probe-prefix.txt"; then c3b_ok=1; else c3b_ok=0; fi
expect "NC-C3b the pre-fix harness leaves the environment behind when up() fails" "$c3b_ok" nc-c3b-probe-prefix \
  "$(grep -E '^outcome=|^docker_up=' "$OUT_DIR/nc-c3b-probe-prefix.txt" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

restore_worktree scripts/tow/test-env.js
run_jest nc-c3c-lifecycle-fixed PATH="$FAKE_BIN" TOW_POSTGRES_E2E=1 \
  DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME_TEST=socorre_ai_tow_test DB_USER=tow_test DB_PASSWORD=tow_test_password \
  -- tests/tow/foundation/towHarnessLifecycle.test.js
c3c_exit=$?
c3c_ok=0
if jest_ran nc-c3c-lifecycle-fixed && jest_was_green nc-c3c-lifecycle-fixed && [ "$c3c_exit" -eq 0 ]; then c3c_ok=1; fi
expect "NC-C3c the same suite is green on the fixed harness (control of the control)" "$c3c_ok" nc-c3c-lifecycle-fixed \
  "jest exit $c3c_exit; fixed test-env.js, identical Docker stub"

run_probe nc-c3d-probe-fixed "$COPY/scripts/tow/test-env.js"
if grep -q 'docker_up=true docker_down=true' "$OUT_DIR/nc-c3d-probe-fixed.txt"; then c3d_ok=1; else c3d_ok=0; fi
expect "NC-C3d the fixed harness tears the environment down after the same failure" "$c3d_ok" nc-c3d-probe-fixed \
  "$(grep -E '^outcome=|^docker_up=' "$OUT_DIR/nc-c3d-probe-fixed.txt" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

echo "== NC-C4: Express/PostgreSQL test accepted a 404 as proof of boot =="
git -C "$REPO_ROOT" show "$PREFIX_REF:socorre_ai_backend/tests/tow/foundation/towPostgresFoundation.e2e.test.js" \
  > "$COPY/tests/tow/foundation/towPostgresFoundation.e2e.prefix.test.js"

( cd "$BACKEND" && node scripts/tow/test-env.js up ) > "$OUT_DIR/nc-c4-container-up.txt" 2>&1
up_status=$?
if [ "$up_status" -ne 0 ]; then
  summary+=("FAIL  NC-C4 could not start the disposable container (exit $up_status)")
  status=1
else
  # The app is pointed away from the disposable database (DB_SSL=true against a
  # container without TLS) while the Knex helper still connects: exactly the
  # situation in which the pre-fix assertion returned 404 and passed.
  app_diverged=(NODE_ENV=test TOW_POSTGRES_E2E=1 DB_SSL=true
    DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME_TEST=socorre_ai_tow_test
    DB_USER=tow_test DB_PASSWORD=tow_test_password)
  run_jest nc-c4a-new-e2e-fails "${app_diverged[@]}" -- tests/tow/foundation/towPostgresFoundation.e2e.test.js
  c4a_exit=$?
  c4a_ok=0
  if jest_ran nc-c4a-new-e2e-fails && jest_had_failures nc-c4a-new-e2e-fails && [ "$c4a_exit" -ne 0 ]; then c4a_ok=1; fi
  expect "NC-C4a the new e2e assertion fails when the app cannot reach the database" "$c4a_ok" nc-c4a-new-e2e-fails \
    "jest exit $c4a_exit; app connection forced to fail (DB_SSL=true)"
  run_jest nc-c4b-old-e2e-false-positive "${app_diverged[@]}" -- tests/tow/foundation/towPostgresFoundation.e2e.prefix.test.js
  c4b_exit=$?
  c4b_ok=0
  if jest_ran nc-c4b-old-e2e-false-positive && jest_was_green nc-c4b-old-e2e-false-positive && [ "$c4b_exit" -eq 0 ]; then c4b_ok=1; fi
  expect "NC-C4b the pre-fix e2e assertion passes under the same failure (false positive)" "$c4b_ok" nc-c4b-old-e2e-false-positive \
    "jest exit $c4b_exit; pre-fix version of the suite ($PREFIX_REF), same broken app connection"
  ( cd "$BACKEND" && node scripts/tow/test-env.js down ) > "$OUT_DIR/nc-c4-container-down.txt" 2>&1
fi

echo
echo "== summary =="
printf '%s\n' "${summary[@]}"
{
  echo "# T00 negative controls — re-create the pre-fix state, expect the regression suite to fail"
  echo "# generated by scripts/tow/negative-controls.sh"
  echo "# pre-fix fixture: TOW_NC_PREFIX_REF=$PREFIX_REF ($PREFIX_SHA)"
  echo "# current HEAD:    $HEAD_SHA (fixed code; the fixture is NOT read from HEAD)"
  echo
  printf '%s\n' "${summary[@]}"
} > "$OUT_DIR/summary.txt"

exit "$status"
