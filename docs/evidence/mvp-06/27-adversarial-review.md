# Fresh-Context Adversarial Review — MVP-06 (Muse role)

> ## ERRATA (added by the executor, 2026-09-21, after this review was written)
>
> The disclosure below states that "no external Muse Sparks 1.3 Free tooling was available in this
> environment". **That statement was wrong.** The executor checked for a `muse` executable and for an
> opencode agent definition, but did not run `opencode models`; the model
> `opencode/muse-spark-1.3-contributor-free` WAS available on this machine all along.
>
> Consequences, stated plainly:
>
> - this R1 document is an **internal fresh-context substitute**, not an external review, exactly as its
>   own disclosure says — the body below is an honest record of what that substitute did;
> - the availability claim in its §0 is retracted by this errata;
> - the **authoritative external review is `28-muse-sparks-review-r2.md`**, executed by the real
>   Muse Sparks 1.3 Free model through `opencode run --model opencode/muse-spark-1.3-contributor-free`,
>   which returned `APPROVE_MVP06_FOR_MERGE` (`P0 = 0`, `P1 = 0`, `blocking P2 = 0`, `P3 = 3`) on the
>   functional tree `74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa`.

Review date: 2026-09-21
Reviewed artifact: `feature/mvp-06-cash-readiness` @ `f8dd9a08101514e307a9b889dcc852609f2c6c68`
Review document: `docs/evidence/mvp-06/27-adversarial-review.md` (the only repository file created by this review)

---

## 0. Reviewer identity and disclosure

This review was executed as a **fresh-context adversarial review via an opencode subagent** (the "Muse" role),
because **no external Muse Sparks 1.3 Free tooling was available in this environment**. The reviewer did not write
the delivered code, and every claim below was re-derived from the repository, the database and real test runs.

**This review must not be presented as an external Muse session.** It is an internal fresh-context substitute,
performed with the same adversarial intent, but it does **not** carry the independence, tooling or evidence
guarantees of a genuine external Muse Sparks run. Any downstream acceptance document that cites this file must
describe it exactly that way.

Transparency about the working tree: the tree was verified clean before and after the review. For section 13, two
files were mutated temporarily (negative controls) and restored **byte-identically**; the sha256 comparisons are
included. No other repository file was modified, and nothing was committed, checked out or stashed.

Environment notes:
- Offline suites: Node/jest with the in-memory SQLite harness (`tests/helpers/testDb.js`).
- PostgreSQL suites: the disposable opt-in harness (`docker-compose.test.yml` via `scripts/tow/test-env.js`).
  Container/network teardown was verified empty; the pre-existing `akry-*` containers were never touched
  (verified running before and after).
- The opencode subagent had to read the code, mutate files temporarily and run containers; the environment is a
  developer workstation, not a hermetic CI runner. Test results are quoted verbatim.

---

## 1. Frozen-tree verification

Commands and raw output:

```text
$ git rev-parse HEAD
f8dd9a08101514e307a9b889dcc852609f2c6c68

$ git status --short
(no output — working tree clean)

$ git log --oneline -5
f8dd9a08 feat(mvp06): CASH payment authority and lean end-to-end readiness (#18)
dbb7cef5 docs(tow): accept MVP-05 and release MVP-06 (#18)
1d9f04bf MVP-05 — Service Execution, Live Tracking & Basic Cancellation (#39)
a3aa1d75 docs(tow): accept MVP-04 and release MVP-05 (#16)
c7d1e8e7 MVP-04 — Proposal Lifecycle & Atomic Assignment (#38)

$ git branch --show-current
feature/mvp-06-cash-readiness
```

The reviewed commit is HEAD; no functional file changed after it (`git status --short` empty, `git log` shows no
later commit). Re-verified after every mutation, container run and test sweep: tree remained clean and HEAD
remained `f8dd9a08…`.

---

## 2. Amount authority

**Verdict: claim verified.**

- The only two places a `tow_payments` row is created both read the amount from the canonical assignment **inside
  the transaction**:
  - `src/modules/tow/application/payment-service.js:111-133` (`selectMethod`): `assignments.findByRequestId(request.id)`
    → `amount_cents: assignment.final_price_amount_cents`, `currency: assignment.final_price_currency`
    (`payment-service.js:121-122`).
  - `src/modules/tow/application/payment-service.js:186-210` (`markCashReceived`): same fields at
    `payment-service.js:189-190`.
- `tow_assignments.final_price_amount_cents` is itself a copy made at accept time from the locked winning
  proposal (`src/modules/tow/application/assignment-service.js:117`, `src/modules/tow/domain/assignment.js:102`),
  and the assignment row is released, never deleted, so the authority survives completion.
- The repository never computes money; it inserts the record it is given
  (`src/modules/tow/adapters/persistence/tow-payment-repository.js:112-138`, `COLUMNS` at :24-36).
- The domain refuses anything but a non-negative safe integer (`src/modules/tow/domain/tow-payment.js:216`,
  `src/modules/tow/domain/integers.js:20-27`) and has no decimal arithmetic (`tow-payment.js:27-28`).
- Client amount paths are closed:
  - `POST /cash-received` accepts **no body at all**: `validateCashReceivedInput` rejects every key
    (`tow-payment.js:178-189`), and the controller deliberately forwards `req.body`
    (`src/modules/tow/http/payment-controller.js:37-45`).
  - `PUT /payment-method` only accepts `method` and `payment_source_token` (`tow-payment.js:135-166`); the amount
    is not part of the input schema.
  - Query strings are never read by the controllers (no `req.query` in `payment-controller.js`).
- Independent runtime proof (my own harness, section 13 methodology): body `{amount_cents: 1, currency: 'USD'}` →
  `422` and zero rows; `?amount_cents=1&currency=USD` → `200` with the authoritative amount; persisted amount
  equals the assignment.
- No functional file references the legacy decimal `payments` table, `final_price` decimal, PSP gateways or the
  legacy payment service (grep in section 7 and the architecture suite).

---

## 3. Authz

**Verdict: claim verified; no bypass found on the three endpoints.**

| Endpoint | Required actor | Mechanism | Evidence |
|---|---|---|---|
| `PUT /requests/{id}/payment-method` | owning customer only | `lockRequestForCustomer` → `not_request_owner` 403 | `payment-service.js:100`; `job-lock.js:41-51` |
| `POST /requests/{id}/cash-received` | **assigned** partner only | `lockJobForPartner` → `assertAssignedPartner` → `not_assigned_partner` 403 **before any state check** | `payment-service.js:157-170`; `job-lock.js:59-69`; `domain/assignment.js:131-139` |
| `GET /requests/{id}/payment` | owning customer OR assigned partner | customer id compare, else `assertAssignedPartner` | `payment-service.js:222-239`; controller forwards exactly one identity (`payment-controller.js:51-58`) |

Route-level role gates: `requireCustomer` (PUT), `requireTowPartner` (POST), `requireCustomerOrTowPartner` (GET)
at `src/modules/tow/http/routes.js:116-118`. Customer JWT on the partner route is 403; partner JWT on the customer
route is 403. A foreign customer gets 403 `not_request_owner`; a wrong partner gets 403 `not_assigned_partner`
(no state oracle: ownership is checked before the state).

Independent probes (my harness, section 13): D1 foreign customer PUT → 403; D2 foreign customer GET → 403;
D3 wrong partner POST → 403; D4 wrong partner GET → 403; D5 customer POST → 403; D7 no `RECEIVED` row created by
any denied actor. The delivered PostgreSQL F3 (wrong partner racing the assigned partner) is green.

One behavioural nuance, not an authz hole: `lockJobForPartner` returns the assignment even if it was released;
`assertAssignedPartner` uses `assignment.partner_id`, so the ex-assigned partner can still confirm after release
(only reachable on `COMPLETED`, which is intended). A **non-assigned** partner remains 403.

---

## 4. Idempotency and PostgreSQL uniqueness

**Verdict: claim verified.**

Schema authority (`database/migrations/007_mvp06_cash_payment.js:52-88`):
- `UNIQUE(tow_request_id)` and `UNIQUE(assignment_id)` (`:68-69`);
- FKs to `tow_requests` (CASCADE), `tow_assignments` (CASCADE), `partners` (RESTRICT) (`:70-72`);
- CHECKs `method='CASH'`, `amount_cents >= 0`, `currency='BRL'`, `status IN ('PENDING','RECEIVED')`,
  and receipt coherence `(PENDING ⇒ no received_at/received_by) XOR (RECEIVED ⇒ both)` (`:74-87`).

Application authority:
- `markCashReceived` is idempotent by canonical row, not by `Idempotency-Key`: a replay with a **different**
  valid key returns the same row (`payment-service.js:172-184`).
- The guarded CAS `WHERE status = 'PENDING'` (`tow-payment-repository.js:150-164`) is what makes `received_at`
  immutable: identity columns are never in the update list; once `RECEIVED`, the service returns early.
- `createForAssignment` inserts and classifies a unique violation instead of pre-reading
  (`tow-payment-repository.js:112-138`).
- The `Idempotency-Key` header is validated before the transaction opens (`payment-service.js:91,148`;
  `domain/idempotency.js`) and is not the idempotency authority — truthfully documented.

Raw PostgreSQL evidence (section 10 for the command):
- F1 (4 concurrent confirmations): one row, one `received_at`, all four responses identical and 200.
- F2 (different keys): one row, identical DTO.
- F4: raw duplicate INSERTs rejected by PostgreSQL itself with `23505`, both request and assignment identities.

My own SQLite harness additionally ran four parallel confirmations with four different keys: all 200, exactly one
row, all `CASH_RECEIVED`; and a retry after +7 min kept `received_at` byte-identical while the DTO stayed equal.

Latent defect found in the unique-violation recovery path — see finding **M6-01**.

---

## 5. Completion requirement and cancellation

**Verdict: claim verified.**

- The completion gate is a service-level guard inside the transaction: `payment-service.js:164-170`
  (line numbers of the REVIEWED artifact `f8dd9a08`; after the M6-03 correction the guard sits at
  `payment-service.js:170-176` on the corrected tree, which is also the line MUSE R2's negative control
  cites — `28-muse-sparks-review-r2.md` NC-2)
  (`request.state !== 'COMPLETED'` → 409 `invalid_tow_state`), evaluated after ownership and after the request
  row lock, so it cannot race an uncommitted completion on PostgreSQL (`lockJobForPartner` locks the
  `tow_requests` row `FOR UPDATE`; `row-lock.js:30-32`).
- Cancellation: a `CANCELLED` request can never produce a `RECEIVED` payment. F6 on PostgreSQL: select cash →
  cancel → `cash-received` 409, existing row stays `PENDING` with null receipt fields.
- The `GET` is read-only: it never writes (no insert/update in `getSummary`), so a cancelled/never-paid request
  reports `NOT_SELECTED` truthfully.
- Cancel-vs-confirm serializes on the same request row lock; since cancellation is only legal before `IN_TRANSIT`
  and confirmation only on `COMPLETED`, no interleaving can produce a receipt on a cancelled tow.

Negative control NC-1 (section 13) proves the delivered state tests actually fail when this guard is removed:
two tests go RED, one of them the cancelled-tow test.

---

## 6. Rehydration

**Verdict: claim verified on the offline harness; the fresh-root PostgreSQL variant was not separately
reproduced (stated explicitly).**

- The payment is never in-memory state: `paymentSummaryFor`/`paymentSummariesFor` read the single row per request
  (`src/modules/tow/application/payment-summary.js:25-46`); list endpoints batch one query
  (`tow-payment-repository.js:98-103`).
- DTO producers project the same row in one place: `buildTowRequestDto` falls back to the truthful empty summary
  (`src/modules/tow/domain/tow-request.js:418-424`), and the request service injects the projection into
  create-replay, get, list and partner-jobs paths (`tow-request-service.js` diff).
- Delivered test A4 builds a **brand-new composition root and a brand-new HTTP server** and gets the identical
  DTO; my independent harness E1/E2 reproduced exactly that: status 200, `JSON.stringify` equal to the original
  confirmation response.
- On PostgreSQL, cross-request reads of the persisted row are exercised by F2/F4 (second confirmation reads via
  `findByRequestId`), so the PG read mapping is covered; what I did **not** reproduce is a new composition root
  against PostgreSQL. A synthetic attempt was abandoned because minimal raw rows violate the assignment FK on the
  disposable container, and the read path contains no per-root state (every call is a query), so the risk is
  assessed as negligible. This is a declared coverage gap, not a proven issue.

---

## 7. Zero PSP calls

**Verdict: claim verified.**

- `payment-service.js` requires only domain helpers and `job-lock`; no gateway, no HTTP client, no legacy payment
  service.
- Architecture suite (green, raw below) asserts the module never imports a PSP gateway or the legacy payment
  service, never references the legacy financial table, and has no timer/scheduler/randomness in the payment path.
- The delivered `RED-MVP06-6` test spies on `stripeGateway.processPayment`, `mercadopagoGateway.processPayment`,
  `pagseguroGateway.processPayment`, `paymentService.processPayment|confirmPayment|createTowEmergencyPayment` and
  asserts **zero calls** across method selection + confirmation.
- `payment_source_token` (a PSP authorization token) is rejected with 422 instead of being silently accepted
  (`tow-payment.js:158-163`), which is consistent with "no gateway exists".

---

## 8. S01–S20

Raw output of the mandatory readiness gate:

```text
$ npx jest tests/tow/mvp06/towMvp06Readiness.test.js --runInBand
...
  MVP-06 readiness gate — S01..S20
    ✓ S01 — Tow module enabled allows a customer to create a request
    ✓ S02 — Tow module disabled blocks a new request
    ✓ S03 — a partner without a TowVehicle is not eligible
    ✓ S04 — a TowVehicle without valid approved documents is not eligible
    ✓ S05 — a TowVehicle incompatible with the request is not eligible
    ✓ S06 — a compatible partner inside the frozen radius sees the opportunity
    ✓ S07 — the Google route quote carries both legs and the authoritative total
    ✓ S08 — pricing is computed server-side and cannot be supplied by the client
    ✓ S09 — one meter above the included distance is charged proportionally
    ✓ S10 — an eligible partner submits a proposal priced by the server
    ✓ S11 — two partners may propose and the request stays NEGOTIATING
    ✓ S12 — the customer accepts one proposal and it becomes the winner
    ✓ S13 — two proposals cannot produce two assignments (PG authority: MVP-04 C1)
    ✓ S14 — the assigned partner starts EN_ROUTE
    ✓ S15 — the assigned partner marks ARRIVED
    ✓ S16 — the assigned partner starts IN_TRANSIT
    ✓ S17 — the assigned partner writes the current point and only the right reader sees it
    ✓ S18 — the assigned partner completes the service and the assignment is released
    ✓ S19 — cash confirmation under retry records exactly one payment
    ✓ S20 — full happy path: request -> proposal -> assignment -> tracking -> COMPLETED -> CASH -> recovery
Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
```

The other claimed suites, re-run by the reviewer:

```text
tests/tow/mvp06/towMvp06CashPayment.test.js   Tests: 23 passed, 23 total
tests/tow/mvp06/towMvp06Attack.test.js        Tests:  9 passed,  9 total
tests/tow/mvp06/towMvp06Architecture.test.js  Tests: 23 passed, 23 total
tests/tow/mvp05/towMvp05ExecutionApi.test.js  Tests: 15 passed, 15 total   (inherited, stays green)
```

Broader regression sweep I added on my own initiative:

```text
$ npx jest tests/tow tests/contract --runInBand
Test Suites: 7 skipped, 69 passed, 69 of 76 total
Tests:       90 skipped, 1304 passed, 1394 total
```

The 7 skipped suites are the opt-in PostgreSQL e2e files (skipped unless `TOW_POSTGRES_E2E=1`):
`tests/tow/baseline/dbBaseline.e2e.test.js` (33), `tests/tow/mvp06/towMvp06Postgres.e2e.test.js` (9),
`tests/tow/g3TowPostgres.e2e.test.js` (7), `tests/tow/mvp05/towMvp05Postgres.e2e.test.js` (6),
`tests/tow/mvp01/towPersistence.e2e.test.js` (6), `tests/tow/mvp01/towVehicleConcurrency.e2e.test.js` (4),
`tests/tow/towPostgres.e2e.test.js` (2) — 67 of the 90 skipped tests; the remaining 23 are conditional tests
inside otherwise-running suites. The two suites claimed by this delivery were run separately in section 10.
No `.only`, no unexplained `.skip`, no TODO/FIXME in the MVP-06 sources.

One inherited flake was observed and is disclosed rather than hidden. In a JSON output run of the sweep
(`npx jest tests/tow tests/contract --runInBand --json --outputFile=…`) that later hung and was killed,
`tests/tow/mvp04/towPartnerJobs.test.js` failed once:

```text
FAILED SUITE: tests/tow/mvp04/towPartnerJobs.test.js
  - MVP-04 EXT — partner job list (EXT-MVP04-1) filters and pagination > an out-of-range limit or page is a 422
    Error: thrown: "Exceeded timeout of 5000 ms for a test.
```

Immediate isolated rerun (the delivery's own documented flake policy: rerun the exact suite):

```text
$ npx jest tests/tow/mvp04/towPartnerJobs.test.js --runInBand
Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Time:        1.527 s
```

and the full sweep was then re-run twice end-to-end, GREEN both times (69/69, 1304 passed) — the first sweep
result quoted above and a second confirmation run. This is an inherited MVP-04 timing flake under a hung/killed
batch (the only failing observation was a 5 s timeout, not a financial, authz or state assertion); it is not
MVP-06 and it is not silently accepted.

Honesty note: S13 and S19 on the offline harness are **sequential** proofs; the true concurrency proofs are the
PostgreSQL C1 and F1/F2, and the test header says so explicitly. The delivery does not overclaim those two.

---

## 9. S09 one-meter pricing

Formula read at `src/modules/tow/domain/pricing.js:199-234`:

```text
excess_meters = max(0, total_distance_meters - included_meters)
variable_charge_cents = ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)   // BigInt :209-212
final_price_cents = minimum_charge_cents + variable_charge_cents
```

It is proportional to the exact excess metres and there is no `ceil` anywhere (the only rounding primitive is
`roundHalfUpDivide`, `pricing.js:142-144`). My own one-liner evaluation:

```text
$ node -e "... computeTowPrice ..."
total_m=5000 excess_m=0    variable_cents=0    final=10000
total_m=5001 excess_m=1    variable_cents=1    final=10001   <- 1 m above included: 1 cent, NOT 800
total_m=5004 excess_m=4    variable_cents=3    final=10003   <- 3.2 c half-up = 3 c, NOT ceil(4 c)
total_m=5435 excess_m=435  variable_cents=348  final=10348   <- 4.350 km * 800 c/km = R$34,80
total_m=9350 excess_m=4350 variable_cents=3480 final=13480   <- documented no-whole-km-rounding case
```

The `5004` case is decisive against a whole-kilometre/ceil implementation: `ceil` would bill 4 cents (or 800
cents if ceiled to the km). The delivered S09 test also asserts `final_price_cents).not.toBe(15800)`.

---

## 10. S13/C1 concurrent assignment

**Verdict: green on real PostgreSQL.**

Raw output of the required PostgreSQL command (both suites in one disposable container):

```text
$ DB_PORT=55434 node /var/folders/.../run-pg-suite.js \
    tests/tow/mvp06/towMvp06Postgres.e2e.test.js \
    tests/tow/mvp04/towMvp04Postgres.e2e.test.js
...
PASS tests/tow/mvp06/towMvp06Postgres.e2e.test.js
...
PASS tests/tow/mvp04/towMvp04Postgres.e2e.test.js

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
[pg-suite] GREEN
EXIT=0
```

Tests included (from the suite files, all green in this run):
F1 concurrent cash confirmations produce ONE payment and ONE received_at;
F2 different valid keys still produce exactly one payment;
F3 a wrong partner racing the assigned partner can never win;
F4 PostgreSQL itself rejects a duplicate payment authority;
F5 cash cannot be RECEIVED before COMPLETED is committed;
F6 a cancelled Tow can never produce a RECEIVED payment;
plus the migration-007 guards (UNIQUE/CHECK names, incoherent receipt and non-CASH method rejected with `23514`,
empty-schema application).
Inherited MVP-04 C1–C9 (two concurrent accepts → one assignment; same-proposal collapse; UNIQUE rejection;
occupancy index; disable×accept serialization; concurrent proposal creation; RESTRICT; C8/C9 blocked-writer
recovery) all green in the same container.

Teardown and isolation, verified immediately after:

```text
$ docker ps -a --filter name=socorre-tow-test --format '{{.Names}}'
(empty)

$ docker ps --format '{{.Names}}' | grep akry
akry-products-e2e-edge-b-db-1
akry-products-e2e-cloud-db-1
akry-products-e2e-edge-a-db-1
akry-products-e2e-edge-c-db-1
akry-edge-pg
```

The harness only ever creates/removes the `socorre-tow-test-<port>-<hash>` compose project
(`scripts/tow/test-env.js:74-94`); no `akry-*` container was touched.

---

## 11. Contract truthfulness

**Verdict: the version move and the base immutability claim are verified; the draft.9 note contains one inexact
sentence (finding M6-02).**

```text
$ git diff dbb7cef5..f8dd9a08 -- docs/tow/tow-api-contract.base.openapi.yaml | wc -l
0

$ grep -n "version:" docs/tow/tow-api-contract.openapi.yaml docs/tow/tow-api-contract.base.openapi.yaml
docs/tow/tow-api-contract.openapi.yaml:4:  version: 1.0.0-draft.9
docs/tow/tow-api-contract.base.openapi.yaml:4:  version: 1.0.0-draft.2

$ npm run validate:openapi
Tow OpenAPI contract validation
  Contract version:                 1.0.0-draft.9
  Canonical paths:                  56
  Composed operations:              66
  Unresolved refs:                  0
  Missing operationId:              0
VALIDATE_EXIT=0
```

The full canonical delta is exactly two things: the version string and the draft.9 description paragraph
(`git diff` shows only those added lines). The base contract is byte-identical.

The draft.9 note (`docs/tow/tow-api-contract.openapi.yaml:80-102`) is accurate on: only `cash` implemented;
`card`/`pix` answer 422 with `method_not_supported_in_mvp`; `payment_source_token` rejected; `can_start_service`
true for `CASH_SELECTED`/`CASH_RECEIVED`; the bodyless `cash-received` and the assignment price authority; and
`allowed_actions` deliberately not advertising the payment actions (test `no MVP-05 or counteroffer action is
ever advertised` asserts exactly that). The one inexact sentence is "The implemented `PaymentStatus` transitions
are exactly `NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED`" (finding M6-02).

The three payment operations in the canonical entrypoint remain `$ref`s to the base contract
(`openapi:283-286, 477-478`), so their declared response surface is the base subset (select: 200/409/422;
get: 200/404; cash-received: 200/409). This under-declares 401/403/404/422 but makes no false claim, and the
task explicitly required the base untouched — see finding M6-04 (informational).

---

## 12. Scope discipline

**Verdict: no out-of-scope runtime was added.**

Functional delta `git diff --name-only dbb7cef5..f8dd9a08` contains, for runtime code, only:

```text
socorre_ai_backend/database/migrations/007_mvp06_cash_payment.js
socorre_ai_backend/scripts/tow/db-baseline.js
socorre_ai_backend/scripts/tow/run-db-baseline-gate.js
socorre_ai_backend/src/modules/tow/adapters/persistence/tow-payment-repository.js
socorre_ai_backend/src/modules/tow/application/{assignment,cancellation,execution,index,payment-summary}.js
socorre_ai_backend/src/modules/tow/application/payment-service.js
socorre_ai_backend/src/modules/tow/application/ports.js
socorre_ai_backend/src/modules/tow/application/tow-request-service.js
socorre_ai_backend/src/modules/tow/composition.js
socorre_ai_backend/src/modules/tow/domain/{index,tow-payment,tow-request}.js
socorre_ai_backend/src/modules/tow/http/{payment-controller,routes}.js
```

plus tests, `tests/helpers/testDb.js` (the SQLite `tow_payments` mirror) and docs. No file outside the Tow module
except tests/docs; `package.json` is untouched (no new dependency).

Search for forbidden runtime across the whole Tow module: `card`, `pix`, `debt`, `wallet`, `payout`,
`settlement`, `refund`, `dispute`, `counteroffer`, `no-show`, `rematch` appear **only** as comments or as
contract-required neutral placeholders inherited from earlier MVPs (`pix: null` in `PaymentSummary`,
`customer_debt_created: false` and "no refund" cancellation semantics from MVP-05, `counteroffer: null` from
MVP-04). `routes.js` registers exactly three new routes (`:116-118`); no CARD/PIX/debt/payout/refund/dispute/
no-show/rematch route exists. The architecture suite independently asserts the module imports no legacy financial
service and writes `tow_payments` from exactly one adapter.

---

## 13. Independent negative controls (with hashes and RED test names)

All mutations were performed on two files, each backed up to the temp directory, and restored with `cp`. Final
sha256 comparison (before/restore) — identical:

```text
$ shasum -a 256 src/modules/tow/application/payment-service.js src/modules/tow/application/job-lock.js
21c082061a2fdb00ca45caa659f77210216afdf01318152170033f31fb10d128  .../payment-service.js
840aa736728118ee265d9f3457aeb82755f5b852ffb62cddbf1dd472f2381640  .../job-lock.js

(after restore)
21c082061a2fdb00ca45caa659f77210216afdf01318152170033f31fb10d128  .../payment-service.js
840aa736728118ee265d9f3457aeb82755f5b852ffb62cddbf1dd472f2381640  .../job-lock.js

$ git status --short
(empty)
```

### NC-1 — deleted the COMPLETED guard

Mutated: `src/modules/tow/application/payment-service.js:164-170` — deleted the block
`if (request.state !== 'COMPLETED') { throw new TowError('invalid_tow_state', …) }`.

Command: `npx jest tests/tow/mvp06/towMvp06CashPayment.test.js --runInBand` → `EXIT=1`.

```text
      ✕ the confirmation is rejected while the tow is not COMPLETED (13 ms)
      ✕ a cancelled tow can never receive cash (11 ms)
Tests:       2 failed, 21 passed, 23 total
```

Restored; sha256 back to `21c082061a2f…`; tree clean.

### NC-2 — amount sourced from the request body

Mutated: `payment-service.js:149` — deleted `validateCashReceivedInput(payload);`; and
`payment-service.js:189-190` — replaced the assignment amount/currency in the `markCashReceived` creation record
with `payload.amount_cents` / `payload.currency` when present (fallback to the assignment otherwise).

Command: `npx jest tests/tow/mvp06/towMvp06CashPayment.test.js --runInBand` → `EXIT=1`.

```text
      ✕ a client-supplied amount is rejected and never becomes authority (15 ms)
Tests:       1 failed, 22 passed, 23 total
```

(My independent harness additionally rejects the same mutation via C1/C2/C3, but this is the delivered test
that would have caught it.) Restored; sha256 `21c082061a2f…`; tree clean.

### NC-3 — removed `assertAssignedPartner`

Mutated: `src/modules/tow/application/job-lock.js:66` and `src/modules/tow/application/payment-service.js:234` —
deleted both `assertAssignedPartner(...)` calls (partner confirmation and payment read; the customer path was left
intact).

Commands and results:

```text
$ npx jest tests/tow/mvp06/towMvp06CashPayment.test.js --runInBand   -> EXIT=1
      ✕ another partner cannot confirm cash (15 ms)
      ● MVP-06 — CASH payment › RED-MVP06-3 — authz › another partner cannot confirm cash
        expect(received).toBe(expected) // Object.is equality
        Expected: 403
        Received: 200
Tests:       1 failed, 22 passed, 23 total

$ npx jest tests/tow/mvp06/towMvp06Attack.test.js --runInBand        -> EXIT=1
      ✕ A8 — a non-assigned partner cannot read the payment and sees no partner id (18 ms)
      ● MVP-06 — Gauntlet attack pass › A8 — a non-assigned partner cannot read the payment and sees no partner id
        expect(received).toBe(expected) // Object.is equality
        Expected: 403
        Received: 200
Tests:       1 failed, 8 passed, 9 total
```

Restored both files; sha256 back to `21c082061a2f…` / `840aa736…`; tree clean. This confirms both the write and
the read authorization tests are real (they fail to 200 when the guard is removed).

### Independent attack harness (my own, outside the repo)

Run from `/var/folders/.../opencode/review/attack-run.js` (plain Node + real JWTs + real HTTP + the repo's SQLite
schema; **not** the delivered test files). Result:

```text
MUSE-ATTACK SUMMARY: 31/31 passed, failures=0
```

with, among others:

```text
PASS | A1 cancelled tow -> 409 invalid_tow_state | status=409 code=invalid_tow_state
PASS | A2 cancelled tow never creates a RECEIVED row | row=absent
PASS | B3 received_at is immutable across retry | first=2026-01-15T12:00:00.000Z second=2026-01-15T12:00:00.000Z
PASS | B2 exactly one row after different-key retry | rows=1
PASS | C1 body amount is 422 and inserts nothing | status=422 code=validation_error
PASS | C2 query amount is ignored, response 200 with authoritative amount | amount=18480 authoritative=18480
PASS | D1 foreign customer PUT payment-method -> 403 | code=not_request_owner
PASS | D3 wrong partner POST cash-received -> 403 | code=not_assigned_partner
PASS | D4 wrong partner GET payment -> 403 | code=not_assigned_partner
PASS | E1 fresh composition root returns the same row | status=200
PASS | G1 all parallel confirmations resolve 200 | statuses=200,200,200,200
PASS | G2 exactly one payment row | rows=1
```

### PostgreSQL probe for finding M6-01

```text
PROBE1 (no savepoint): caught 23505 -> read FAILED 25P02: select * from "muse_probe" where "k" = $1 limit $2 - current transaction is aborted, commands ignored until end of transaction block
PROBE2 (savepoint):    caught 23505 -> read ok: {"id":1,"k":"a"}
```

---

## 14. Findings

### M6-01 — P2 (non-blocking): the unique-violation recovery in the payment repository crashes on PostgreSQL

- **Evidence:** `src/modules/tow/adapters/persistence/tow-payment-repository.js:126-137`. The `catch` classifies a
  `23505` and then immediately issues another statement (`findByAssignmentId` / `findByRequestId`) **on the same
  transaction**. PostgreSQL aborts the transaction on the failed insert; the follow-up SELECT raises `25P02`.
- **Reproduction:** disposable-container probe (raw output in section 13): `caught 23505 -> read FAILED 25P02 …
  current transaction is aborted`. The same probe wrapped in a savepoint reads the winner successfully.
- **Reachability today: not reachable through the runtime.** Both writers lock the same `tow_requests` row
  `FOR UPDATE` before touching `tow_payments` (`payment-service.js:100,157`; `job-lock.js:41-69`;
  `row-lock.js:30-32`), so concurrent writers serialize and the loser sees the committed row instead of a
  constraint violation. The 4-way concurrent PostgreSQL F1 all-200 result confirms the lock is effective.
- **Impact:** the adapter's stated contract ("the loser learns which identity conflicted instead of crashing",
  `tow-payment-repository.js:8-14, 105-111`) is false on the production dialect. Any future writer that inserts
  without taking the request lock, or any change to the lock strategy, turns this into a 500 for a legitimate
  concurrent retry. Financial outcomes are not affected today.
- **Fix:** `ON CONFLICT (tow_request_id) DO NOTHING RETURNING …` then read the winner, or wrap the insert in a
  savepoint (`trx.transaction(...)`), as PROBE2 demonstrates.
- **Blocks merge: no** (latent; unreachable behind the current lock, no wrong-money or authz impact).

### M6-02 — P2 (non-blocking): the draft.9 note's transition claim is inexact

- **Evidence (doc):** `docs/tow/tow-api-contract.openapi.yaml:91-92` states "The implemented `PaymentStatus`
  transitions are exactly `NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED`".
- **Evidence (runtime):** `src/modules/tow/application/payment-service.js:139-146, 186-200` creates the row
  lazily as `RECEIVED` when the partner confirms and no row exists ("even if the customer never tapped 'cash'").
  The delivered test `tests/tow/mvp06/towMvp06CashPayment.test.js:91-105` runs exactly that path (completed
  fixture, no `selectPaymentMethod`), and my harness B0–B4 persisted a `RECEIVED` row with no `PENDING` row ever
  existing. So `NOT_SELECTED -> CASH_RECEIVED` is an implemented transition.
- **Impact:** a consumer reading "exactly" could build a client that assumes a confirmation is impossible before
  a method is selected. No runtime error, money or access consequence. The status enum and response shapes are
  otherwise truthful.
- **Fix:** amend the sentence to include the direct lazy-confirmation transition (canonical doc only; the base
  contract stays untouched).
- **Blocks merge: no.**

### M6-03 — P3: `PUT /payment-method` on a cancelled tow replays 200 when a row already exists

- **Evidence:** `payment-service.js:102-109` returns `existing` before the `CANCELLED` check, while the same
  method's comment and the 409 path claim a cancelled request cannot select a method.
- **Reproduction (my harness F0–F4):** select cash on an assigned tow → 200; cancel → 200; select again →
  `status=200 body={"status":"CASH_SELECTED",…}`; a second probe with `method:"card"` after cancellation → 422;
  the stored row stays one `PENDING` row, unmoved.
- **Impact:** read-only idempotent replay; no mutation and no financial consequence. Defensible, but the
  behaviour deserves an explicit line in the contract/comment if intentional.
- **Blocks merge: no.**

### M6-04 — P3 (informational): canonical payment operations keep the base response surface

- **Evidence:** `docs/tow/tow-api-contract.openapi.yaml:283-286` and `:477-478` are `$ref`s to the base; the base
  declares no 401/403 for `selectTowPaymentMethod`/`getTowPaymentSummary`/`markTowCashReceived`
  (`tow-api-contract.base.openapi.yaml:217-251, 427-441`), unlike draft.8, which re-declared the execution
  operations with the truthful status surface in the canonical.
- **Impact:** under-declaration only (no false claim); generated clients must handle 401/403 defensively. The
  task explicitly forbade changing the base, and the draft.9 note does not claim the status surface was
  re-declared.
- **Blocks merge: no.**

---

## 15. Verdict

**P0 = 0**, **P1 = 0**, **P2 = 2** (both non-blocking), **blocking P2 = 0**, P3 = 2 (informational),
**verdict = APPROVE**.

Everything the delivery claims that I could reproduce is true: the amount authority is the assignment's frozen
`final_price_amount_cents` read inside the transaction and no client/query/tariff/legacy path can influence it;
the three endpoints enforce customer-owner and assigned-partner authorization without a state oracle; uniqueness
is a database constraint and idempotency is a canonical-row property with an immutable `received_at`; cash cannot
be received before `COMPLETED` or on a cancelled tow; the flow makes zero PSP calls; S01–S20, F1–F6 and the
inherited C1–C9 are green on the dialects they claim; S09 is proportional and never `ceil`s; canonical is
`1.0.0-draft.9` with an untouched base; no out-of-scope runtime exists. All three of my negative controls went
RED in the delivered tests and the files were restored byte-identically. A 69-suite regression sweep passed.

The two non-blocking findings should be tracked as follow-ups before any writer is added without the request-row
lock (M6-01) and as a one-sentence contract correction (M6-02). Neither justifies holding this merge.

Explicitly unverified in this review: an external Muse Sparks 1.3 session (unavailable, section 0); a fresh
composition root rehydrating against PostgreSQL specifically (section 6 — verified on SQLite and via
cross-request PG reads instead); and live Google Routes provider behaviour (declared out of scope by the
delivery).
