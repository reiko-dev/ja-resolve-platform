# Environment anomaly observed during MVP-06 (external to this delivery)

Date: 2026-09-21 · Reported by: the MVP-06 executor

This note exists because something outside this delivery's scope changed on the Docker host during the run and
must not be silently ignored. It is **not** a delivery blocker and it does **not** affect the Tow repositories.

## What was observed

| Time (local, -05:00) | Observation |
| --- | --- |
| session start | `docker ps` showed 5 `akry-*` containers: `akry-products-e2e-edge-a-db-1`, `akry-products-e2e-edge-b-db-1`, `akry-products-e2e-edge-c-db-1`, `akry-products-e2e-cloud-db-1`, `akry-edge-pg` |
| end of session | only 4 `akry-*` containers exist, all `akry-products-e2e-*`, started ~7 minutes earlier; **`akry-edge-pg` no longer exists in any state** (`docker inspect akry-edge-pg` → `no such object`) |

Also present: three long-stopped containers `akry-pg-edgea`, `akry-pg-edgeb`, `akry-pg-cloud` (`Exited (255)`,
32 hours ago — predating this session).

## Why this delivery's tooling is not the cause

Every Docker operation performed by this delivery used the disposable Tow harness, which is scoped by
construction and by evidence:

- the compose file is `socorre_ai_backend/docker-compose.test.yml`, whose containers/network are derived from a
  per-run project name (`socorre-tow-test-55434-cb0d0933`);
- the only teardown command used is
  `docker compose -p socorre-tow-test-55434-cb0d0933 -f .../docker-compose.test.yml down --volumes --remove-orphans`;
- `docker-compose.test.yml` declares **no** fixed `container_name` and **no** fixed network name, so it cannot
  address another project's resources;
- every gate log in `docs/evidence/mvp-06/` shows only `socorre-tow-test-55434-*` resources being created and
  destroyed, and repeated `docker ps -a --filter name=socorre-tow-test` checks returned zero after every run;
- the `akry-*` containers belong to a **different** compose project (`akry-products-e2e`) defined in a
  **different workspace** (`/Volumes/Reiko/projects/akry-solutions/akry-edge/tests/Distributed`), which this
  session never referenced or invoked;
- `akry-edge-pg` was never named in any command executed by this delivery.

## What could not be established

The Docker daemon does not retain a long event history on this host: `docker events --since 720h --until 0s`
returned events only from the current moment, so the removal/restart of the `akry-*` resources cannot be
attributed from the daemon log. The restart of the four `akry-products-e2e-*` containers ~7 minutes before the
final check is consistent with activity in the akry workspace itself (its e2e suite manages exactly that
project, including `down --remove-orphans`) or with a daemon/VM restart; it is **not** consistent with any
command this delivery ran.

## Required operator action

1. Check whether `akry-edge-pg` matters locally (it may have been an `--rm`-style convenience container) and
   recreate it if needed.
2. Confirm whether the akry e2e suite was running concurrently on this machine.
3. No action is required for the Tow repositories: their trees are clean and the Tow disposable environment
   left 0 containers / 0 volumes / 0 networks.
