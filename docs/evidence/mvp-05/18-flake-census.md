# MVP-05 — 18 Flake Census

> The `socket hang up` / stale-401 transport artifact of this repository is
> **pre-existing**, documented since MVP-03 and measured on the untouched base
> commit by MVP-04 (`docs/evidence/mvp-04/18-flake-census.md`). This file records
> the MVP-05 measurement so the artifact is neither hidden nor mistaken for a
> regression.

## Method

`npx jest --runInBand` (single worker, sequential suites) on the branch, idle
machine, PostgreSQL container **not** required for the offline runs:

| context | runs | command |
| --- | --- | --- |
| MVP-05 directory (offline) | 1 | `npx jest tests/tow/mvp05 --runInBand` |
| Tow directory (offline) | 3 | `npx jest tests/tow --runInBand` |
| `towMvp05Tracking.test.js` (offline, single file) | 3 | `npx jest tests/tow/mvp05/towMvp05Tracking.test.js --runInBand` |
| Tow directory (PostgreSQL enabled) | 1 | canonical PG env, `DB_PORT=55434` |
| **full jest (all 99 suites, offline)** | 3 | `npx jest --runInBand` |

## Result

| context | runs | clean | failed runs |
| --- | --- | --- | --- |
| `tests/tow/mvp05` (offline) | 1 | 1 | 0 — 89 passed, 6 skipped (the PostgreSQL-gated file) |
| `tests/tow` (offline) | 3 | **3 / 3** | 0 — 1134 passed, 81 skipped, 0 failed in every run |
| `towMvp05Tracking.test.js` | 3 | **3 / 3** | 0 — 14/14 in every run |
| `tests/tow` (PostgreSQL enabled) | 1 | 1 | 0 — 64 suites, 1212 passed, 0 failed |
| full jest — before the hardening | 2 | 0 | 2 — one legacy flake, then two transport artifacts in the MVP-05 contract suite |
| full jest — after the hardening | 1 | **1 / 1** | 0 — 93 suites, **1591 passed, 81 skipped, 0 failed** |

## The two full-jest artifact runs, and the fix

Running the **whole** repository in one process (99 suites) exposed the artifact
twice, in two different shapes:

| run | failure | shape |
| --- | --- | --- |
| 1 | `tests/tow/towDocumentFlow.test.js` → *“par válido responde 200 com o parceiro atualizado”* | the documented legacy flake (MVP-03 §11, MVP-04 review) |
| 2 | `tests/contract/towMvp05OperationContract.test.js` → 401 body empty, and `Parse Error` on the partner cancel | stale-401 + parse artifact, both in the MVP-05 contract suite |

For run 2 the **server-side proof** is in the same log: the server answered
`POST /api/tow/requests/1/en-route` with `401` and a **60-byte** body while the
client saw `undefined` — the response existed and the client misread it.

**Fix (not a waiver).** The MVP-05 suites (8 files, including the contract suite)
now create **one real listening server per suite**
(`app = createApp({...}).listen(0)`, closed with `closeAllConnections()` in
`afterAll`) instead of letting supertest open and close an ephemeral server for
every single request. The churn of hundreds of ephemeral servers in one process is
what produces stale responses and truncated bodies. **No assertion changed** — the
same statuses, bodies, schemas and DB rows are asserted, and the transport simply
delivers them reliably. After the change: full jest green on the first attempt
(`19-full-jest-artifacts.txt`, `20-full-jest.txt`).

## The one observed occurrence (during the negative-control batch)

| where | test | symptom |
| --- | --- | --- |
| `towMvp05Tracking.test.js`, GREEN attempt of `NC-MVP05-5` | *“RED-MVP05-2 — the assigned partner writes a point and both parties read it”* | `socket hang up` |

The file had already been restored byte-for-byte (SHA-256 matched the pristine
copy) when that run started, and the PostgreSQL E4 GREEN passed in the same batch.
The three reruns above (3 × 14/14) and the three clean Tow-directory runs confirm
the artifact is transport-level and intermittent, exactly as MVP-04 measured on
the base commit.

## Policy applied

Per the delivery's transport policy, only the documented signatures
(`socket hang up`, `Parse Error`, stale `401`) may be rerun, and only with
server-side proof — never an assertion failure on PostgreSQL concurrency,
tracking leakage, idempotency, release or the state machine. No MVP-05 assertion
was waived anywhere in this delivery: the single occurrence above failed on the
**happy path** (a 202/200 write-then-read), not on any of the safety assertions,
and every clean run recorded here exercises the same test.
