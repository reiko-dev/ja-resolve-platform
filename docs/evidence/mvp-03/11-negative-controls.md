# MVP-03 — PHASE X negative controls

**Purpose.** A green suite only proves that the assertions currently pass. A
negative control proves that each safeguard is *load-bearing*: the guard is
removed from production source, the guarding suite must turn **RED**, and the
file must then be restored **byte-identically** and turn **GREEN** again.

Every control below mutates exactly one production file, never a test file, and
never the SQLite harness DDL. `tests/tow/mvp02/towRouteProviderBoundary.test.js`
is untouched by every control.

## Summary

| Control | Safeguard removed | File mutated | Mutated run | Restored run | Byte-identical restore |
|---|---|---|---|---|---|
| NC-MVP03-1 | Module gate (`assertNewBusinessAllowed`) | `application/tow-request-service.js` | **RED** 2 failed / 58 | **GREEN** 58/58 | ✅ |
| NC-MVP03-2 | MVP-01 eligibility composition | `domain/matching.js` | **RED** 8 failed / 86 | **GREEN** 86/86 | ✅ |
| NC-MVP03-3 | Geodesic radius filter | `domain/matching.js` | **RED** 2 failed / 86 | **GREEN** 86/86 | ✅ |
| NC-MVP03-4 | Idempotency: replay pre-read **and** unique-violation recovery | `adapters/persistence/tow-request-repository.js` | **RED** 5 failed / 9 | **GREEN** 9/9 | ✅ |
| NC-MVP03-4b | Idempotency: unique-violation recovery only (real PostgreSQL, true concurrency) | `adapters/persistence/tow-request-repository.js` | **RED** 1 failed / 7 | **GREEN** 7/7 | ✅ |

All five controls: **PASS**. No mutation survived into the frozen tree.

## File hashes (before mutation = after restore)

| File | sha256 (before and after) |
|---|---|
| `src/modules/tow/application/tow-request-service.js` | `5e43848c807f8f13dee5135eac0ccd7cae65bbd0196b1d9fab235d5831f629e1` |
| `src/modules/tow/domain/matching.js` | `a677859d3e4846f4f05a34924258d09418dc706c43a7d98bbd6bd5da188ed5ad` |
| `src/modules/tow/adapters/persistence/tow-request-repository.js` | `58ec46d6ce898685ae148e11fb8a8214b3853e9e3d1d001536c65cc9e3e5e110` |

The mutated hashes were, respectively, `dc0f1dc7…`/`d7bc61d6…`/`9f62dfdf…`/
`c132da49…` (offline) and `0d7e876e…` (PostgreSQL) — all discarded on restore.

## Raw evidence

Full transcripts: `/tmp/mvp03-negative-controls.txt` (offline driver),
`/tmp/mvp03-nc4b-pg.txt` (PostgreSQL driver), plus one jest log per run.

| Artifact | sha256 |
|---|---|
| `nc-NC-MVP03-1-red.log` | `8858b087f479765d06d0bea3b7ea1a1842784950481ca837d976a7fa22524883` |
| `nc-NC-MVP03-1-green.log` | `885e1967219d6d180e7637f863b0348e6422103168e91c814de7191ddf82e8fd` |
| `nc-NC-MVP03-2-red.log` | `63f859d450e105d21615d17c68e8e5fea49e16aba587f57515d7712b0f433f95` |
| `nc-NC-MVP03-2-green.log` | `05f103d574765ba30a57c7f11ff0a192dcac8e6d2e4b89c11795bf7b658b4f21` |
| `nc-NC-MVP03-3-red.log` | `e6baf2a29bc62f49762176306537a38950be258d98aaf88520b1ef15b215080c` |
| `nc-NC-MVP03-3-green.log` | `41a99e1cfdc831de40d9083aa0e2cc7bb86c82983d3cb5e84a30c76d94d6698a` |
| `nc-NC-MVP03-4-red.log` | `ce841e1a6b6456ea544cb84f3914c8c0295a7a21a9f69a522380e1421057a65e` |
| `nc-NC-MVP03-4-green.log` | `ae9895794168efbd5fb0c8b339565a2507c132d84137aa7b8123cf3e9e015848` |
| `nc-NC-MVP03-4b-red.log` | `3919592dc3dc6a94a07afe99dafe95f2f266c9faf533bdfdcf327f34aaa3b0a9` |
| `nc-NC-MVP03-4b-green.log` | `4c0bd6c5ad2bc06c3dc9d92f85cda71f761ebcccb1181c24ee06e3131af7088f` |

## Control detail

### NC-MVP03-1 — module gate bypass

Mutation: `await moduleService.assertNewBusinessAllowed();` →
`await Promise.resolve();` in `create()`.

Detected by (2 failures):

- `MVP-03 — Tow request creation › module gate › a disabled module refuses creation with 409 service_module_disabled`
- `MVP-03 — Tow request creation › module gate › the module gate runs before payload validation`

This is the MVP-03 hard stop *"a disabled module must not persist a request"*.
The suite proves both halves: the request is refused with
`service_module_disabled`, **and** the gate is evaluated before validation (so a
disabled module cannot leak validation detail) and before the idempotent replay.

### NC-MVP03-2 — eligibility bypass

Mutation: the `if (!eligibility.eligible) return excluded(...)` branch in
`evaluateTowMatch` is deleted, so every partner is treated as eligible.

Detected by (8 failures): the whole exclusion matrix plus the inclusion
counter-example —

- inactive vehicle excluded, pending document excluded, rejected document
  excluded, expired document excluded, no vehicle document excluded,
  unsupported vehicle class excluded, insufficient capacity excluded,
- and `a partner with no vehicle sees an empty feed and never reaches the provider`.

This is the MVP-03 hard stop *"a partner must never see an ineligible
opportunity"*. The composition itself is MVP-01's `evaluateEligibility`; the
control proves MVP-03 wires it in rather than re-implementing it.

### NC-MVP03-3 — radius bypass

Mutation: the `if (!isWithinRadius(...)) return excluded(OUTSIDE_RADIUS, ...)`
branch in `evaluateTowMatch` is deleted.

Detected by (2 failures):

- `MVP-03 — partner opportunities › exclusion — no opportunity and no provider call › an out-of-radius partner is excluded`
- `MVP-03 — partner opportunities › request lifecycle scope › only the in-radius eligible request reaches the provider among several`

The second failure matters most: it proves the filter is applied against the
**frozen per-request** `matching_radius_km` (a farther request does not leak into
a nearer partner's feed), not against a global or live setting.

### NC-MVP03-4 — idempotency bypass (both layers)

Mutation: the replay pre-read (`findByCustomerAndKey` + early return) **and** the
unique-violation recovery are both removed, so `createIdempotent` degenerates
into a bare `INSERT`.

Detected by (5 failures):

- `a retry with the same key and payload returns the same request`
- `a retry after a zero-match search returns the same SEARCHING request`
- `the same key with a different payload is a 409 idempotency_conflict`
- `a change in the pickup, vehicle or observations is also a conflict`
- `concurrent retries of the same key create exactly one request`

**Defence-in-depth finding (recorded deliberately).** Removing *either* layer
alone leaves the offline suite GREEN: the pre-read alone satisfies every
sequential retry, and the constraint recovery alone satisfies them too because
the losing `INSERT` is caught and the winner is re-read. Both layers were
therefore removed together in NC-MVP03-4 — that is the only offline mutation
that can produce a second row. The necessity of the recovery layer by itself is
proven separately, under real concurrency, by NC-MVP03-4b.

### NC-MVP03-4b — unique-violation recovery, real PostgreSQL

Mutation: only the recovery branch is removed —
`if (!isUniqueViolation(error)) throw error; …` → `throw error;` — leaving the
replay pre-read intact.

Run inside the disposable PostgreSQL environment with `TOW_POSTGRES_E2E=1`, five
identical requests issued via `Promise.all`:

- Mutated: **RED** — 1 failed / 7 total, exactly
  `MVP-03 PostgreSQL — canonical TowRequest and matching › concurrent identical requests collapse to exactly one row`.
- Restored: **GREEN** — 7/7, byte-identical file.

This is the MVP-03 hard stop *"idempotency must be concurrency-safe"*. It also
documents why the SQLite harness cannot carry this control: `better-sqlite3` is
synchronous, so the three `Promise.all` posts are serialized and the pre-read
always wins the race — the constraint path is unreachable there. The
PostgreSQL leg is the authority for that claim.

## Teardown

After NC-MVP03-4b the disposable environment was destroyed and independently
verified: **0 containers, 0 volumes, 0 networks** for the tow test project
(`docker ps -a` / `docker volume ls` / `docker network ls` filtered by
`tow-test` all empty). The only containers left on the host belong to an
unrelated pre-existing project (`akry-*`) and were never touched.

## Reproduction

```
python3 /tmp/mvp03-negative-controls.py                     # NC-1 .. NC-4 (offline)
TOW_POSTGRES_E2E=1 DB_PORT=55434 node /tmp/mvp03-nc4b-run.js # NC-4b (real PostgreSQL)
```

Both drivers are self-restoring: they copy the file to `/tmp` first and copy it
back before running the GREEN leg, and they abort before mutating if the anchor
text does not appear exactly once (so a drifted source can never be silently
half-mutated).
