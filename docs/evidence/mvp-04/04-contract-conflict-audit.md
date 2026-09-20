# MVP-04 — 04 Contract Conflict Audit

> Delivery: MVP-04 Proposal Lifecycle & Atomic Assignment (Issue #16)
> Scope: every place where the MVP-04 requirement, the frozen OpenAPI contract,
> the business-rule matrix and the **accepted** MVP-01/02/03 implementation
> disagree — and the decision taken for each.
> Rule: an accepted MVP delivery is never silently tightened or loosened by a
> later one. A genuine disagreement is recorded here as `CONTRACT_CONFLICT` with
> an explicit authority.

---

## CONTRACT_CONFLICT-1 — partner eligibility: matrix vs accepted MVP-03

**Matrix** (`TOW-BUSINESS-RULE-MATRIX.md:49`):

```text
TOW-PARTNER-002 | Matching exige partner `approved`, `online` e `available`. | P0
```

**Accepted MVP-03 implementation** (`src/modules/tow/domain/eligibility.js`,
`src/modules/tow/domain/matching.js`, MVP-03 evidence
`docs/evidence/mvp-03/…`): the matching pipeline is

```text
module enabled → partner.type === 'tow' → partner.is_available → partner.is_online
              → operational coordinates → evaluateEligibility(...) → radius
```

and `evaluateEligibility` uses **module → partner type → `vehicle.active === true`
→ required document present → `areRequiredDocumentsSatisfied` → `isCompatible`.
It deliberately does **not** use `is_verified` or `approval_status` as a
blocker; `is_verified` is projected by `partner-repository.js` for observability
only, and an inclusion test proves an unverified partner can still match.

**Nature of the conflict**: `approved` in the matrix has no canonical partner
column. The baseline `partners` table exposes `is_verified`; the legacy
`approval_status` column is not part of the canonical projection. Treating
`is_verified` as the matrix's `approved` would (a) invent an equivalence the
matrix does not state, and (b) **tighten** an accepted behaviour, silently
excluding partners who match today.

**Decision (MVP-04)**: `CONTRACT_CONFLICT` recorded, not resolved.
Proposal creation authorization uses **exactly** the accepted MVP-03 semantics —
the same `evaluateTowMatch` pipeline with the same inputs. MVP-04 adds no new
partner criterion and removes none. `is_verified` stays observability-only.

**Why this is the correct call**: MVP-04's job is the proposal lifecycle and the
atomic assignment. Changing who is eligible would change the meaning of every
existing MVP-03 test and could invalidate the accepted MVP-03 receipt. The
matrix line is a Phase-2 candidate (partner approval workflow) and is tracked as
such, not smuggled into MVP-04.

**Observable consequence**: a partner with `is_verified = false` who is
available, online, has an active compatible vehicle with valid required
documents, and is inside the frozen radius **can** create a proposal in MVP-04.
This is asserted by a dedicated test so the behaviour is pinned rather than
accidental.

---

## CONTRACT_CONFLICT-2 — `proposal_already_active` is not in the frozen error enum

**Requirement**: a second proposal by the same partner for the same request while
an `ACTIVE` one exists must fail with the stable code `proposal_already_active`.

**Contract before MVP-04** (`ErrorResponse.error.code.enum`, base line 1833):
the enum contains `proposal_expired`, `proposal_not_actionable`,
`request_already_assigned`, `idempotency_conflict`, `conflict`, … but **not**
`proposal_already_active`.

**Options considered**:

1. reuse `conflict` and put `proposal_already_active` in `details.reason` —
   loses the stable code the requirement names, and forces every consumer to
   parse `details`;
2. **add `proposal_already_active` to the enum** (chosen);
3. map it to `proposal_not_actionable` — semantically wrong: the existing
   proposal is perfectly actionable; the *new* one is the problem.

**Decision**: contract **revision** `1.0.0-draft.5` → `1.0.0-draft.6`, adding one
enum member. This is additive (no consumer that handled `conflict` breaks), it is
declared in `04-contract-conflict-audit.md` and in the OpenAPI revision note, and
it is covered by the contract suite (the canonical error-code list stays a
*subset* requirement, so the validator keeps passing). `CANONICAL_ERROR_CODES`
in `tests/helpers/towContract.js` gains the code so the "must be present"
assertion now protects it too.

---

## CONTRACT_CONFLICT-3 — `EnvelopeTowProposal.data` points at `PayoutBatch`

**Defect** (`docs/tow/tow-api-contract.base.openapi.yaml`, `EnvelopeTowProposal`):

```yaml
EnvelopeTowProposal:
  properties:
    data: { $ref: '#/components/schemas/PayoutBatch' }   # ← wrong
```

`PayoutBatch` requires `[id, status, total_amount, created_at]` with
`status ∈ {CREATED, PROCESSING, PROCESSED, PARTIAL_FAILURE, FAILED}`. A real
`TowProposal` response therefore **cannot** validate against the declared
envelope. This is a copy-paste defect, not a business disagreement: every other
envelope in the document points at its own payload.

**Impact**: `createTowProposal` (201) and `withdrawTowProposal` (200) both return
`EnvelopeTowProposal`, so live HTTP→OpenAPI validation for MVP-04 would fail on a
defect that has nothing to do with the implementation.

**Decision**: **fix** the `$ref` to `#/components/schemas/TowProposal` as part of
the same documented contract revision (draft.6). Evidence: the pre-fix live
validation failure is captured, the fix is applied, and the post-fix live
validation passes — a contract-level negative control.

---

## CONTRACT_CONFLICT-4 — `TowProposalStatus.COUNTERED` exists but MVP-04 must never produce it

The canonical enum is
`['ACTIVE','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED','CLOSED']`.
MVP-04 has **no counteroffer**. `COUNTERED` is retained in the enum and in the
migration CHECK (so a later delivery needs no re-migration) but:

* no code path writes `COUNTERED`;
* `allowed_actions` never exposes `create_counteroffer` / `accept_counteroffer` /
  `reject_counteroffer`;
* `createTowCounteroffer`, `acceptTowCounteroffer`, `rejectTowCounteroffer`
  remain unimplemented — a request to those paths is a 404, not a fake success;
* a test asserts that `COUNTERED` is unreachable from any MVP-04 operation.

---

## CONTRACT_CONFLICT-5 — `allowed_actions` enumerates MVP-05+ actions

`allowed_actions` in the contract enum lists actions the module cannot perform
yet (`start_en_route`, `mark_arrived`, `start_in_transit`, `finish_service`,
`select_payment_method`, `cancel_request`, `confirm_completion`, …). MVP-04 must
emit **only** what is actually executable right now, otherwise the field lies.

**Decision**: `allowed_actions` is computed from live state, not from the enum:

| State | Emitted actions |
|---|---|
| request `SEARCHING`/`NEGOTIATING`, viewer = owner, ≥1 actionable proposal | `accept_proposal` |
| request `SEARCHING`/`NEGOTIATING`, viewer = owner, 0 proposals | `[]` |
| request `ASSIGNED` | `[]` (MVP-05 actions are **not** advertised) |
| viewer = partner with an `ACTIVE` non-expired proposal | `withdraw_proposal` |
| viewer = partner with no actionable proposal | `[]` |

This is a strict subset of the contract enum, so schema validation still passes,
and it is the honest reading of the field's purpose.

---

## CONTRACT_CONFLICT-6 — request state on first proposal: `SEARCHING` vs `NEGOTIATING`

`TOW-PROP-001` requires multiple partners to be able to propose on the same open
request. The request state machine already has `NEGOTIATING` (migration 004,
`TOW_REQUEST_STATES`), and the natural reading is "a request with at least one
proposal is `NEGOTIATING`".

But `listSearchingCandidates` (MVP-03) filters `state = 'SEARCHING'`. If the first
proposal moved the request to `NEGOTIATING` **and** the candidate query were left
alone, the first proposal would hide the request from every other partner —
directly violating `TOW-PROP-001`.

**Decision**: first proposal moves `SEARCHING → NEGOTIATING` **and** the candidate
set is widened to `state IN ('SEARCHING','NEGOTIATING')`. Both halves are
required; a test proves the second partner still sees the opportunity after the
first proposal exists, and that the request state is `NEGOTIATING`.

---

## CONTRACT_CONFLICT-7 — `TowRequest.assignment` was hard-coded `null`

`buildTowRequestDto` (MVP-03) emits `assignment: null` unconditionally and
`allowed_actions: []` unconditionally. The contract's `TowRequest.assignment` is
`oneOf [Assignment, null]`, so `null` is *valid* — but after MVP-04 it would be
**false**: a request in `ASSIGNED` must rehydrate its assignment.

**Decision**: populate `assignment` from `tow_assignments` when one exists
(`serializeAssignment`), and keep `null` otherwise. This is not a contract change;
it is the field finally telling the truth. The MVP-03 tests that assert
`assignment: null` remain valid because they only exercise un-assigned requests —
verified by re-running the MVP-03 floor.

---

## CONTRACT_CONFLICT-8 — money: legacy decimal vs canonical integer cents

The legacy proposal flow accepts `proposed_price` as a decimal from the caller and
stores `decimal(10,2)`. The canonical contract uses `Money { amount_cents:
integer, currency: 'BRL' }` and the pricing contract forbids float money.

**Decision**: canonical only. The proposal body is **rejected** if it carries
`proposed_price`, `price`, `amount`, `amount_cents`, `estimated_price`,
`route_distance`, `tariff`, `partner_id` or `tow_vehicle_id`
(`additionalProperties: false` in the contract, plus explicit unknown-key
rejection in the domain). The price is computed server-side from the frozen
tariff and the provider route, and persisted as integer cents.

---

## Summary table

| # | Conflict | Authority chosen | Contract file changed |
|---|---|---|---|
| 1 | matrix `approved` vs MVP-03 eligibility | **accepted MVP-03 semantics** (no tightening) | no |
| 2 | `proposal_already_active` absent from enum | additive enum member | yes (draft.6) |
| 3 | `EnvelopeTowProposal.data → PayoutBatch` | fix the `$ref` | yes (draft.6) |
| 4 | `COUNTERED` in enum, no counteroffer in MVP-04 | keep enum, never write it | no |
| 5 | `allowed_actions` enum over-declares | emit truthful subset | no |
| 6 | `SEARCHING` filter hides request after first proposal | `NEGOTIATING` + widened candidate set | no |
| 7 | `assignment` hard-coded `null` | populate truthfully | no |
| 8 | legacy decimal money vs integer cents | canonical integer cents | no |
