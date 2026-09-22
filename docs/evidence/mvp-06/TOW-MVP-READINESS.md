# TOW MVP READINESS

Issue: #18 — MVP-06 — CASH Payment & Lean End-to-End Ready Gate
Date: 2026-09-21
Branch: `feature/mvp-06-cash-readiness`
Execution base: `MVP06_EXECUTION_BASE` = `dbb7cef5bb110de16450d70441ea733f40fb31a6`

This report states the exact status of the 20 mandatory scenarios of Issue #18 and the exact consumer surface
that is ready for integration. It is deliberately narrower than the long-term target contract.

---

## 1. Scenario status — S01..S20

All 20 scenarios are GREEN in `tests/tow/mvp06/towMvp06Readiness.test.js` (one numbered test per scenario, no
collapsing). Each row names the test and the authority it proves.

| # | Scenario | Test | Result | Authority proven |
| --- | --- | --- | --- | --- |
| S01 | Module enabled allows a request | `S01 — Tow module enabled allows a customer to create a request` | **PASS** | module gate + `POST /tow/requests` 201 |
| S02 | Module disabled blocks a request | `S02 — Tow module disabled blocks a new request` | **PASS** | 409 `service_module_disabled`, zero rows |
| S03 | Partner without TowVehicle is not eligible | `S03 — a partner without a TowVehicle is not eligible` | **PASS** | empty feed, 0 provider calls |
| S04 | TowVehicle without valid approved docs is not eligible | `S04 — a TowVehicle without valid approved documents is not eligible` | **PASS** | empty feed, 0 provider calls |
| S05 | Incompatible TowVehicle is not eligible | `S05 — a TowVehicle incompatible with the request is not eligible` | **PASS** | empty feed, 0 provider calls |
| S06 | Compatible partner inside the radius is found | `S06 — a compatible partner inside the frozen radius sees the opportunity` | **PASS** | opportunity item + compatibility verdict |
| S07 | Google route quote is produced | `S07 — the Google route quote carries both legs and the authoritative total` | **PASS** | ONE provider call with `origin` (partner) + `pickup` (intermediate) + `destination`; `provider_to_pickup` and `pickup_to_destination` summed exactly to `total_distance_meters` (14350) |
| S08 | Server-side pricing is produced | `S08 — pricing is computed server-side and cannot be supplied by the client` | **PASS** | 18480 c server quote; a client price body is 422; the stored proposal price is the server's |
| S09 | One meter above included is charged proportionally | `S09 — one meter above the included distance is charged proportionally` | **PASS** | `excess_meters = 1` → `variable_charge_cents = 1`, `final_price_cents = 15001`, explicitly **not** 15800 (`ceil(km)`); plus a 625 m half-up case and an end-to-end 10 001 m quote |
| S10 | Eligible partner submits a proposal | `S10 — an eligible partner submits a proposal priced by the server` | **PASS** | 201 ACTIVE, server price + route snapshot, partner from auth |
| S11 | Two partners may propose | `S11 — two partners may propose and the request stays NEGOTIATING` | **PASS** | 2 proposals coexist, state `NEGOTIATING`, a third proposal still accepted, 3 listed |
| S12 | Customer accepts one proposal | `S12 — the customer accepts one proposal and it becomes the winner` | **PASS** | winner `ACCEPTED`, loser rejected 409, assignment price frozen |
| S13 | Two concurrent accepts do not create two assignments | `S13 — two proposals cannot produce two assignments` | **PASS** (offline sequential + replay) **+ real PostgreSQL authority: MVP-04 C1** | one `tow_assignments` row; second accept 409; winner replay returns the same assignment. Concurrent proof: `towMvp04Postgres.e2e.test.js` C1, re-run GREEN on this tree (`20-inherited-postgres.txt`) |
| S14 | Assigned partner enters EN_ROUTE | `S14 — the assigned partner starts EN_ROUTE` | **PASS** | `ASSIGNED → EN_ROUTE` |
| S15 | ARRIVED | `S15 — the assigned partner marks ARRIVED` | **PASS** | `EN_ROUTE → ARRIVED` |
| S16 | IN_TRANSIT | `S16 — the assigned partner starts IN_TRANSIT` | **PASS** | `ARRIVED → IN_TRANSIT` |
| S17 | Tracking is visible to the correct customer | `S17 — the assigned partner writes the current point and only the right reader sees it` | **PASS** | assigned partner writes (202), owner customer reads, foreign customer 403, foreign partner 403 |
| S18 | COMPLETED | `S18 — the assigned partner completes the service and the assignment is released` | **PASS** | `IN_TRANSIT → COMPLETED`, `released_at`/`release_reason` set, history retained, vehicle reusable |
| S19 | CASH received is recorded exactly once under retry | `S19 — cash confirmation under retry records exactly one payment` | **PASS** + real PostgreSQL authority: **MVP-06 F1/F2** | one row, one `received_at` (immutable across a clock advance), same DTO for same/different keys. Concurrent proof: `towMvp06Postgres.e2e.test.js` F1/F2 |
| S20 | Full happy path | `S20 — full happy path: request → proposal → assignment → tracking → COMPLETED → CASH → recovery` | **PASS** | one cohesive run with continuity asserted: `payment.tow_request_id == request`, `payment.assignment_id == winning assignment`, `payment.amount_cents == assignment.final_price_amount_cents`, `assignment.proposal_id == winning proposal`, then customer recovery and partner historical recovery |

Raw run:

```text
PASS tests/tow/mvp06/towMvp06Readiness.test.js
Tests:       20 passed, 20 total
```

### Scope note for S07

The readiness gate uses the deterministic fake `RouteProvider` (no network, no Google key). Live-provider
certification is explicitly **not** part of the automated business gate (Issue #18, §"Lean readiness gate");
the real Google Routes adapter and its two-leg parsing are covered by the accepted MVP-02 suites
(`tests/tow/mvp02/towGoogleRoutesAdapter.test.js`), which remain GREEN on this tree.

---

## 2. Implemented MVP consumer surface

### Operations that are implemented and ready

| Method + path | Behaviour |
| --- | --- |
| `PUT /tow/requests/{requestId}/payment-method` | owning customer selects `cash`; creates the payment as `CASH_SELECTED`; `card`/`pix` → 422 |
| `POST /tow/requests/{requestId}/cash-received` | assigned partner confirms receipt on a `COMPLETED` tow; idempotent; **no body** |
| `GET /tow/requests/{requestId}/payment` | owning customer or assigned partner rehydrates the canonical summary |
| `GET /tow/requests/{requestId}/route` | owning customer OR assigned partner reads the `TowRouteSnapshot` (draft.11, B5): request pickup -> destination `route_quote` + Google-compatible `encoded_polyline`, recomputed on read, zero pricing |
| `TowRequest.payment` (embedded in every recovery path) | truthful projection of the same single row |
| `OPTIONS` — not applicable | — |

### Runtime dependency: partner presence (matching requires legacy writes)

Geographic matching is not self-contained. `GET /tow/partner/opportunities` decides from
`partners.is_available`, `partners.is_online` and the partner's `latitude`/`longitude`
(`src/modules/tow/domain/matching.js:79-89`). The accepted Tow module exposes **no `/tow/*` writer for those
columns**: they are written only by the legacy partner surface `PUT /api/partners/:id/online-status`
(`is_online`) and `PUT /api/partners/:id/location` (`latitude`/`longitude`), plus the legacy partner update for
`is_available`. A partner with a false/absent availability flag or null coordinates sees an empty opportunity
feed (no error). This is a hard prerequisite for any end-to-end partner demo and is recorded here because a
contract-only consumer cannot infer it.

### Runtime-only routes now declared (draft.10)

Three routes the accepted runtime serves were absent from the frozen contract and are now declared additively
in canonical `1.0.0-draft.10`: `POST /tow/vehicles/{vehicleId}/deactivate` (`deactivateTowVehicle`),
`GET /tow/vehicles/{vehicleId}/documents/{documentId}/download` (`downloadTowVehicleDocument`, owning partner)
and `GET /admin/tow/vehicle-documents/{documentId}/download` (`adminDownloadTowVehicleDocument`, admin). The
downloads return private bytes (`application/octet-stream`, `Content-Disposition: attachment`) and are proven by
`tests/tow/mvp01/towDocumentDownload.test.js`. The same revision records that six routed operations declare the
`Idempotency-Key` header in the long-term contract while the accepted runtime accepts and ignores it
(`activateTowVehicle`, `deleteTowVehicleDocument`, `adminToggleTowModule`, `adminPatchTowSettings`,
`adminApproveTowVehicleDocument`, `adminRejectTowVehicleDocument`); the declaration is not narrowed.

### End-to-end capability

```text
Tow module enable/disable
Tow partner eligibility, TowVehicle, required documents, vehicle compatibility
customer TowRequest creation (idempotent)
lean geographic matching inside the frozen radius
Google Routes authoritative road-distance quote (provider -> pickup -> destination)
authoritative server pricing (integer cents, proportional beyond included distance)
partner opportunity discovery
partner proposal creation (server-priced, no client input)
multiple proposals (NEGOTIATING)
customer proposal selection
atomic assignment (exactly one, ever)
partner/customer assignment rehydration
ASSIGNED, EN_ROUTE, ARRIVED, IN_TRANSIT, COMPLETED, CANCELLED
current partner tracking (single current point, monotonic)
customer tracking visibility
basic pre-IN_TRANSIT cancellation
assignment release and partner/TowVehicle reuse
CASH payment, cash_received confirmation, payment rehydration
route visualization (authoritative pickup -> destination distance/duration + Google-compatible polyline)
```

### Contract

| Item | Value |
| --- | --- |
| initial canonical version | `1.0.0-draft.8` |
| MVP-06 canonical version | `1.0.0-draft.9` (revision note records the implemented subset) |
| T5 canonical version | `1.0.0-draft.10` (declares the three runtime-only routes and records the idempotency delta; no runtime change) |
| current canonical version | `1.0.0-draft.11` (B5: `getTowRequestRoute` is implemented; declared-but-unrouted annotation replaced) |
| base contract | byte-identical to the reviewed artifact (`1.0.0-draft.2`) |
| OpenAPI validation | PASS, 69 operations, 0 unresolved refs, 0 dropped base methods |
| implemented payment subset | `cash` only; `PaymentStatus` reachable: `NOT_SELECTED → CASH_SELECTED → CASH_RECEIVED` |
| contract revision required? | no shapes changed; only the documented subset note |

### Schema

| Item | Value |
| --- | --- |
| migrations | `001..007` (one additive migration) |
| new table | `tow_payments` |
| tables | 37 |
| fingerprint (twice identical) | `a5605ba9d71f214fb9b289e4d57001099119a2052a2ff5d4d67d66500446e999` |
| fresh DB from zero + seed | PASS |

---

## 3. Explicitly NOT READY

The following are **not** implemented in the Tow MVP. They do not block
`TOW MVP BACKEND READY FOR INTEGRATION`, but they do block claiming a production-complete Tow.

```text
counteroffer
CARD
PIX
real Stripe
real Mercado Pago
real PagSeguro
PSP webhooks
refund orchestration
partner platform fee debt
customer financial debt
wallet
settlement
payout
disputes
reviews
admin override
no-show
automatic rematch
advanced cancellation economics
full telemetry history
live ETA / rerouting
Phase 2 reliability and performance hardening
historical credential remediation (#31)
```

Also deliberately not advertised: `TowRequest.allowed_actions` does **not** list `select_payment_method` or
`mark_cash_received`; the authoritative signal is `TowRequest.payment.status`. See
`docs/evidence/mvp-06/05-payment-authority.md` §9.

Route visualization is **implemented** (draft.11, B5): `GET /tow/requests/{requestId}/route`
(`getTowRequestRoute`, canonical `docs/tow/tow-api-contract.openapi.yaml`, `TowRouteSnapshot` incl.
`encoded_polyline`) is served to the owning customer or the assigned partner. The route is recomputed on read
through the same backend RouteProvider the quote uses, carries no pricing member of any kind, and a provider
failure is `503 external_dependency_unavailable` with no fabricated geometry. The tracking read still carries
only `{ pickup, destination }` and remains the current-position read.

---

## 4. Verdict

```text
TOW MVP BACKEND READY FOR INTEGRATION
```

for the explicitly listed MVP consumer subset only. This is **not** the full production-hardening milestone
(`TOW BACKEND READY FOR INTEGRATION`, reserved for Phase 2 / #33), and it does not clear the deferred security
work of #31.
