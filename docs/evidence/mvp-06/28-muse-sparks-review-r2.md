# MUSE SPARKS 1.3 FREE — MVP-06 Adversarial Review (R2, authoritative)

## 0. Reviewer identity, scope and method

I am Muse Sparks 1.3 Free, the external reviewer for this delivery. I did not
write this code. The earlier internal review (R1,
`docs/evidence/mvp-06/27-adversarial-review.md`, produced by an executor
subagent) is a distrusted draft: it is NOT authoritative, I did not rely on its
conclusions, and this R2 review supersedes it for acceptance purposes. Every
claim below was verified independently from the repository, the database and
real test runs I executed myself.

Scope: Issue #18 "MVP-06 CASH Payment & Lean End-to-End Ready Gate",
branch `feature/mvp-06-cash-readiness`, functional commit
`74ab62e3d5da36db6c4bd4bd10f6f6ef4da50ffa`.

Working tree state: `git status --short` was EMPTY before my work and is EMPTY
after it. The only file I created is this review document (the one file the
task permits). Negative controls used `cp` backup/restore with
`shasum -a 256` comparison (all byte-identical). Throwaway scripts lived only
under `/var/folders/tj/v4pyr7mx54j09ps94lqs8qyh0000gn/T/opencode/`; no file
inside the repository was modified. No commit/checkout/stash/reset was
performed. No `akry-*` container was touched (none was running; the disposable
PG harness managed only its own `socorre-tow-test-*` project and destroyed it).

## 1. Frozen-tree verification

Raw output (quoted):

```
e0a7aa5183ea520fa1f40cf36e1aa51863055e8f
---STATUS---
(empty)
---LOG---
e0a7aa51 docs(mvp06): session handoff, ledger update and post-correction PG evidence (#18)
74ab62e3 fix(mvp06): contain the unique-violation savepoint and correct the draft.9 note (#18)
f8dd9a08 feat(mvp06): CASH payment authority and lean end-to-end readiness (#18)
dbb7cef5 docs(tow): accept MVP-05 and release MVP-06 (#18)
1d9f04bf MVP-05 — Service Execution, Live Tracking & Basic Cancellation (#39)
---DIFFNAMES---
docs/evidence/mvp-06/29-session-handoff.md
docs/evidence/tow-autonomous-finish/LEDGER.md
```

- `rev-parse HEAD` = `e0a7aa5183ea520fa1f40cf36e1aa51863055e8f` (matches the brief).
- `status --short` empty; branch `feature/mvp-06-cash-readiness`.
- `git diff --name-only 74ab62e3..HEAD` = exactly the two docs files above:
  docs-only, no functional file changed after the functional commit.
- Functional tree under review is therefore `74ab62e3`. Confirmed.

## 2. Amount authority

VERIFIED. `tow_payments.amount_cents` can only ever be
`tow_assignments.final_price_amount_cents`, read inside the transaction.

- `src/modules/tow/application/payment-service.js:124-132` (`selectMethod`):
  `amount_cents: assignment.final_price_amount_cents`,
  `currency: assignment.final_price_currency`, inside `unitOfWork.run`.
  The assignment itself comes from `assignments.findByRequestId` (the
  transaction-bound repository) at line 117.
- `payment-service.js:192-202` (`markCashReceived` lazy path): identical
  authority, same transaction.
- `src/modules/tow/http/payment-controller.js:37-45`: `markCashReceived`
  forwards `req.body` into `validateCashReceivedInput`, and
  `src/modules/tow/domain/tow-payment.js:178-189` rejects ANY non-empty body
  with 422 — a client amount is impossible rather than ignored. There is no
  `req.query` read anywhere in the payment path (controller passes only
  `req.body`; the service never touches `query`), so a query-string amount is
  inert. Proven live in §G3/G (§7 attack run: body `{"amount_cents":1}` →
  422; `?amount_cents=1` → 200 with the canonical `18480`).
- `tow-payment.js:206-264` (`buildTowPaymentRecord`) only validates shape;
  no tariff/route/decimal input exists in the file.
- My own attack G3 confirmed the stored amount equals the accepted
  assignment's frozen final price (`18480`), never `1`.

## 3. Authz

VERIFIED, with file:line evidence for every branch:

- `cash-received` = assigned partner only:
  `payment-service.js:163-168` via `lockJobForPartner`
  (`src/modules/tow/application/job-lock.js:59-69`), which calls
  `assertAssignedPartner(assignment, partnerId)`
  (`src/modules/tow/domain/assignment.js:131-139`; null/mismatch → 403
  `not_assigned_partner`). Ownership is checked BEFORE state, so no state
  oracle. Routes pin the principal:
  `src/modules/tow/http/routes.js:118` (`requireTowPartner`) and the
  controller uses only `req.user.partner_id` (`payment-controller.js:39`).
- `payment-method` = owning customer only: `payment-service.js:100` via
  `lockRequestForCustomer` (`job-lock.js:41-51`, mismatch → 403
  `not_request_owner`); route `:116` (`requireCustomer`); controller uses
  only `req.user.id` (`payment-controller.js:26`).
- `payment` read = owner OR assigned partner: `payment-service.js:228-245`
  (customer branch compares `customer_id`, else `assertAssignedPartner`);
  controller forwards exactly one identity based on `req.user.role`
  (`payment-controller.js:51-58`); route `:117`
  (`requireCustomerOrTowPartner`).
- Status codes proven live by my G4 run: foreign select 403, wrong-partner
  cash 403, foreign read 403, wrong-partner read 403, owner read 200,
  assigned read 200. Anonymous 401 and unknown/non-canonical 404 are covered
  by the suites I re-ran (§8: cash suite lines "an anonymous caller is
  rejected", "an unknown request is 404 and a non-canonical id is 404").

## 4. Idempotency and PostgreSQL uniqueness (incl. the savepoint fix and F4b)

VERIFIED.

- Application rule: `payments.findByRequestId` replay-first in both writes
  (`payment-service.js:108-109` select; `:178-180` cash), guarded
  `PENDING -> RECEIVED` transition (`tow-payment-repository.js:165-179`,
  `WHERE status='PENDING'` so a retry matches zero rows and cannot restamp
  `received_at`).
- Database rule: `UNIQUE(tow_request_id)` + `UNIQUE(assignment_id)`
  (`database/migrations/007_mvp06_cash_payment.js:68-69`) plus CHECKs
  (method `:74`, amount `:75`, currency `:76`, status `:77-81`, receipt
  coherence `:82-87`).
- Savepoint fix is real: `tow-payment-repository.js:133-142` wraps the INSERT
  in `connection.transaction(...)` (knex savepoint) so a caught `23505`
  does not abort the outer transaction (`25P02`); the winner is resolved at
  `:146-152`. My negative control NC-3 (savepoint removed) turned F4b RED,
  proving the fix is load-bearing (§13).
- Live PG proof: F1, F2, F3, F4, F4b green (§5).

## 5. Completion requirement and cancellation

VERIFIED.

- `payment-service.js:170-176`: `if (request.state !== 'COMPLETED')` → 409
  `invalid_tow_state`. My negative control NC-2 (gate disabled) turned both
  "rejected while not COMPLETED" and "cancelled tow can never receive cash"
  RED, proving the gate is load-bearing (§13).
- My own G1 attack: select cash (200) → customer cancel (200) → cash-received
  → `409 {"code":"invalid_tow_state","details":{"state":"CANCELLED"}}`, row
  stays `PENDING` (1 row, no RECEIVED). A CANCELLED tow can never produce a
  RECEIVED payment (also F6 on PG).

## 6. Rehydration

VERIFIED.

- `TowRequest.payment` is an injected projection, never a second truth:
  `src/modules/tow/domain/tow-request.js:384-422` (`options.payment ??
  emptyPaymentSummary`), produced centrally by
  `src/modules/tow/application/payment-summary.js:25-46`
  (`paymentSummaryFor`/`paymentSummariesFor`, batched via
  `findByRequestIds`), wired into every DTO producer from the composition
  root (`composition.js:110-173`, `paymentRepository: towPaymentRepository`
  in towRequest/assignment/execution/cancellation services).
- `GET /payment` with no row returns truthful `NOT_SELECTED` with null
  amount (`payment-service.js:243-244`).
- My own G5 attack: after a FRESH `buildTowServices({db...})` (new
  composition root, same database), `getSummary` returned
  `CASH_RECEIVED 18480`, identical to the stored row (`RECEIVED 18480`).

## 7. Zero PSP calls

VERIFIED. `grep -rniE "stripe|mercadopago|pagseguro|gateway|psp|webhook"`
over `src/modules/tow/` returns ONLY comments and the intentional 422 reason
string `gateway_not_implemented` (`tow-payment.js:126-161`); no import, no
HTTP call, no gateway client. The cash suite's "the whole CASH flow makes
zero gateway calls" passed in my re-run. The DTO carries `pix: null`
(`tow-payment.js:118`) as contract shape, not runtime.

## 8. S01-S20

Genuinely green — re-run by me, raw summary lines quoted:

- `towMvp06Readiness.test.js`: `Tests: 20 passed, 20 total` — S01..S20 all
  ✓ (incl. S09 proportional-meter, S13 concurrent-accept, S19 cash-retry,
  S20 full happy path).
- `towMvp06CashPayment.test.js`: `Tests: 24 passed, 24 total`.
- `towMvp06Attack.test.js`: `Tests: 9 passed, 9 total` (A1..A9).
- `towMvp06Architecture.test.js`: `Tests: 23 passed, 23 total`.
- `tests/tow/mvp05`: `Test Suites: 1 skipped, 7 passed, 7 of 8 total` /
  `Tests: 6 skipped, 89 passed, 95 total` (inherited stays green).
- `npm run validate:openapi`: exit 0 —
  `Contract version: 1.0.0-draft.9`, `JSON Schema definition errors: 0`.

## 9. S09 one-meter pricing

VERIFIED independently. Formula in
`src/modules/tow/domain/pricing.js:199-234`: proportional
`ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)` via
BigInt (`roundHalfUpDivide`, `:142-144`); no `ceil`, no whole-km rounding
anywhere in the file. My own node evaluation:

```
{"total_distance_meters":10001,"included_meters":10000,"excess_meters":1,
 "variable_charge_cents":1,"final_price_cents":15001,"currency":"BRL"}
PROPORTIONAL-OK (15001, not 15800)
```

and `14350m → excess 4350 → variable 3480 → final 18480` (the value the
suites and my attacks observe as the frozen assignment price). S09 is
proportional and never `ceil(excess_km)`.

## 10. S13/C1 concurrent assignment and S19/F1-F2 cash retry

VERIFIED on both engines:

- SQLite (re-run): S13 "two proposals cannot produce two assignments" ✓;
  S19 "cash confirmation under retry records exactly one payment" ✓.
- PostgreSQL (my disposable run, `DB_PORT=55434`, exact harness
  `run-pg-suite.js` I created under `/tmp/opencode` since the referenced
  path did not exist — same up→jest→down semantics via
  `scripts/tow/test-env.js`):
  `Test Suites: 2 passed, 2 total` / `Tests: 20 passed, 20 total`, including
  `F1 concurrent confirmations: ONE payment and ONE received_at` ✓,
  `F2 different valid keys: exactly one payment` ✓,
  `F3 wrong partner can never win` ✓, `F4 PG rejects duplicate` ✓,
  `F5 no RECEIVED before COMPLETED committed` ✓,
  `F6 cancelled never RECEIVED` ✓, `F4b savepoint recovery` ✓, the three
  migration-guard tests ✓, and the inherited `towMvp04Postgres` C1-C9 suite
  (10 tests) ✓.
- Teardown verified: `docker ps -a --filter name=socorre-tow-test` → empty;
  `docker ps` → empty (no `akry-*` container existed to disturb; colima was
  started by me only to provide the daemon).

## 11. Contract truthfulness

VERIFIED.

- Canonical contract `docs/tow/tow-api-contract.openapi.yaml:4`:
  `version: 1.0.0-draft.9`.
- The draft.9 note (`:80-103`) states exactly what the runtime does: only
  `cash` implemented (`card`/`pix` → 422 `method_not_supported_in_mvp`,
  `payment_source_token` rejected — matches `tow-payment.js:152-163`);
  `can_start_service` true once cash chosen (matches `:89-91`);
  transitions `NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED` AND the lazy
  `NOT_SELECTED -> CASH_RECEIVED` confirmation path (matches
  `payment-service.js:144-219`); bodyless cash-received with the amount as
  the frozen final price (matches `:178-189` + §2); `allowed_actions`
  deliberately omits payment actions — true
  (`tow-request.js:81-88`, no payment members).
- `cash-received` declares NO `requestBody` in the base contract
  (`tow-api-contract.base.openapi.yaml:427-442`: parameters only), and the
  composed file `$ref`s it — the amount can never be client-supplied.
- `git diff dbb7cef5..74ab62e3 -- docs/tow/tow-api-contract.base.openapi.yaml`
  → 0 lines: base byte-identical. Confirmed.

## 12. Scope discipline

VERIFIED. `git diff --name-only dbb7cef5..74ab62e3` (src/database/scripts):
exactly the payment module files (migration 007, repository, service,
summary, domain, controller, routes, composition wiring + DTO injection
touch-points in assignment/cancellation/execution/tow-request services) plus
test/support scripts. New routes: EXACTLY the three payment routes
(`routes.js` diff: `PUT payment-method`, `GET payment`,
`POST cash-received`). A grep for
`card|pix|debt|wallet|settlement|payout|refund|dispute|counteroffer|no-show|rematch|stripe|mercadopago|pagseguro|webhook|capture|authorization`
over the src+ migration diff returns ONLY comments/contract text and the
`pix: null` DTO shape field — no CARD/PIX/debt/wallet/payout/settlement/
refund/dispute/counteroffer/no-show/rematch runtime. `allowed_actions`
unchanged (no payment advertising).

## 13. Negative controls you executed (mutated line, RED test names, before/after hashes)

All backups via `cp` to `/tmp/opencode/*.bak` FIRST; restore via `cp`;
`shasum -a 256` identical before/after; `git status --short` clean after
each.

- NC-1 (authz): removed `assertAssignedPartner(assignment, partnerId);`
  (`src/modules/tow/application/job-lock.js:66`, replaced with a no-op
  two-liner). Hash before `840aa736…2381640`, after restore `840aa736…2381640`.
  RED: `towMvp06CashPayment` → `✕ another partner cannot confirm cash`
  (`Tests: 1 failed, 23 passed, 24 total`). All other tests stayed green,
  proving the suite isolates this branch.
- NC-2 (completion gate): `if (request.state !== 'COMPLETED')` →
  `if (false && request.state !== 'COMPLETED')`
  (`src/modules/tow/application/payment-service.js:170`). Hash before
  `ae192889…91f7e5a04`, after restore identical. RED:
  `✕ the confirmation is rejected while the tow is not COMPLETED` and
  `✕ a cancelled tow can never receive cash`
  (`Tests: 2 failed, 22 passed, 24 total`).
- NC-3 (savepoint): replaced the savepoint INSERT
  (`src/modules/tow/adapters/persistence/tow-payment-repository.js:136-138`)
  with a direct
  `[inserted] = await connection('tow_payments').insert(payload).returning(COLUMNS);`.
  Hash before `2d70a612…8969de154a`, after restore identical. RED on PG:
  `✕ F4b — a duplicate insert inside a transaction recovers without aborting
  it` (`Tests: 1 failed, 9 passed, 10 total`; F1-F6 unaffected), proving the
  savepoint — not application logic — contains the `23505`.

## 14. Findings

- P3-1 — `markCashReceived` SQLite-only fallback can theoretically answer an
  empty summary. `payment-service.js:189` / `:215`:
  `return payments.findByRequestId(request.id)` may return `null` if the row
  vanished, and `buildTowPaymentDto(null)` yields `NOT_SELECTED/200`.
  Unreachable in practice (request row is locked in the same transaction; a
  FK cascade cannot fire mid-transaction). Reproduction: none found; code
  inspection only. Does NOT block merge.
- P3-2 — Unknown query parameters on `cash-received` are silently ignored
  (200) rather than rejected. Only the body is strictly validated (422).
  Harmless: no code path reads `req.query`, proven by G3 (amount unchanged,
  canonical `18480`). A stricter contract purist could 422 unknown query,
  but Express convention is to ignore it. Does NOT block merge.
- P3-3 — Re-selecting a method on a CANCELLED tow replays the old payment
  (200) instead of 409 (`payment-service.js:108-115`, documented M6-03
  decision). Deliberate replay philosophy, consistent with execution
  milestones; first-time selection on CANCELLED is still 409. Reviewed and
  accepted. Does NOT block merge.

No missing `await` found in the payment path; no swallowed errors found
(`createForAssignment` rethrows non-unique errors; all service errors are
`TowError`s mapped by the shared error mapper). No authz branch lets a
foreign customer or non-assigned partner read or mutate financial data. No
second-row creation path exists outside the UNIQUE-backstopped insert. No
read-then-write race is unbackstopped (DB UNIQUEs + guarded
`WHERE status='PENDING'` update + `SELECT ... FOR UPDATE` locks on PG).

`P0 = 0`, `P1 = 0`, `blocking P2 = 0`, `P3 = 3`.

## 15. Verdict

APPROVE_MVP06_FOR_MERGE
