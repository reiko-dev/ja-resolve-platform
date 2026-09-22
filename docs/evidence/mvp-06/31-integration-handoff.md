# Tow MVP — Integration handoff (Mobile Cliente / Mobile Parceiro)

Date: 2026-09-21
MVP-06 accepted: PR #40 merged at `c5ca8cc112f39ca8b1d0952b7c1a9305619f24b4`
Milestone: `TOW MVP BACKEND READY FOR INTEGRATION` (MVP subset only)
Base URL: `/api` (contract `servers: [/api]`)
Auth: `Authorization: Bearer <JWT>` on every operation below

This is the concise consumer handoff. The durable capability list is
`docs/evidence/mvp-06/TOW-MVP-READINESS.md`; the normative shapes are
`docs/tow/tow-api-contract.openapi.yaml` (canonical, now `1.0.0-draft.10`: the
draft.9 MVP-06 surface plus the T5 draft.10 declarations of the three
runtime-only routes and the recorded idempotency delta; the base contract stays
byte-identical).

---

## 1. Implemented endpoints

### Module & partner onboarding
| Method | Path | Who |
| --- | --- | --- |
| GET | `/tow/module-status` | public |
| GET/POST/PATCH/DELETE | `/tow/vehicles`, `/tow/vehicles/{vehicleId}`, `.../activate`, `.../deactivate` | Tow partner |
| GET/POST/DELETE | `/tow/vehicles/{vehicleId}/documents`, `.../documents/{documentId}` | Tow partner |
| GET | `/tow/vehicles/{vehicleId}/documents/{documentId}/download` | Tow partner (authenticated bytes; declared in draft.10) |
| GET/PATCH | `/admin/tow/module`, `/admin/tow/settings` | admin |
| GET | `/admin/tow/vehicle-documents`, `/admin/tow/vehicle-documents/{documentId}` | admin |
| POST | `/admin/tow/vehicle-documents/{documentId}/approve`, `.../reject` | admin |
| GET | `/admin/tow/vehicle-documents/{documentId}/download` | admin (authenticated bytes; declared in draft.10) |

### Customer request flow
| Method | Path | Who |
| --- | --- | --- |
| POST | `/tow/requests` (`Idempotency-Key` required) | customer |
| GET | `/tow/requests` | customer |
| GET | `/tow/requests/{requestId}` | customer (owner) |
| GET | `/tow/requests/{requestId}/proposals` | customer (owner) |
| POST | `/tow/proposals/{proposalId}/accept` (`Idempotency-Key`) | customer (owner) |

### Partner flow
| Method | Path | Who |
| --- | --- | --- |
| GET | `/tow/partner/opportunities` | Tow partner |
| POST | `/tow/requests/{requestId}/proposals` (`Idempotency-Key`) | Tow partner |
| GET | `/tow/partner/proposals` | Tow partner |
| POST | `/tow/proposals/{proposalId}/withdraw` (`Idempotency-Key`) | owning partner |
| GET | `/tow/partner/jobs` | Tow partner (own jobs, historical) |

### Execution, tracking, cancellation
| Method | Path | Who |
| --- | --- | --- |
| POST | `/tow/requests/{requestId}/en-route` | assigned partner |
| POST | `/tow/requests/{requestId}/arrived` (`LocationInput`) | assigned partner |
| POST | `/tow/requests/{requestId}/in-transit` | assigned partner |
| POST | `/tow/requests/{requestId}/finish` (`LocationInput`) | assigned partner |
| GET | `/tow/requests/{requestId}/tracking` | owner customer OR assigned partner |
| POST | `/tow/requests/{requestId}/tracking` (`Idempotency-Key`) | assigned partner |
| POST | `/tow/requests/{requestId}/cancel` (optional `reason`) | customer (owner) |
| POST | `/tow/requests/{requestId}/cancel-partner` (`reason` required) | assigned partner |

### CASH payment
| Method | Path | Who |
| --- | --- | --- |
| PUT | `/tow/requests/{requestId}/payment-method` (`{ method: "cash" }`, `Idempotency-Key`) | customer (owner) |
| POST | `/tow/requests/{requestId}/cash-received` (**no body**, `Idempotency-Key`) | assigned partner |
| GET | `/tow/requests/{requestId}/payment` | owner customer OR assigned partner |

## 2. Canonical state path

```text
SEARCHING → NEGOTIATING → ASSIGNED → EN_ROUTE → ARRIVED → IN_TRANSIT → COMPLETED
                                 ↘ CANCELLED (customer or assigned partner, before IN_TRANSIT only)
```

`TowRequest.state` on `GET /tow/requests/{requestId}` is the authority. Milestone instants are not exposed in
the MVP DTO; `assignment.released_at` is likewise internal.

## 3. Tracking contract

- The partner writes the **current** point (`POST .../tracking`, 202 Accepted) with
  `{ latitude, longitude, recorded_at }`; `recorded_at` is the client instant and a strictly older point is
  rejected with `409 stale_tracking_update`.
- The customer reads the latest point (`GET .../tracking`); the response is
  `{ latest: { latitude, longitude, recorded_at } | null, route: { pickup, destination } }`.
- There is **no history** and **no ETA** in the MVP. Only the owning customer and the assigned partner can read.

## 4. Proposal / assignment recovery

- `GET /tow/requests` (customer) and `GET /tow/partner/jobs` (partner) return `TowRequest` items whose
  `assignment` member is the same canonical object for both parties
  (`{ partner_id, tow_vehicle_id, final_price: { amount_cents, currency }, assigned_at }`).
- `POST /tow/proposals/{proposalId}/accept` is idempotent by proposal id: a replay returns the **same**
  assignment even with a different valid key.
- A second proposal can never be accepted for the same request (`409 request_already_assigned`).

## 5. CASH confirmation

- The customer selects cash while the job exists and is not cancelled
  (`PUT .../payment-method` → `payment.status = CASH_SELECTED`, `amount_cents` = accepted assignment price).
- The **assigned partner** confirms receipt only after `COMPLETED`:
  `POST .../cash-received` → `payment.status = CASH_RECEIVED`. Any other state → `409 invalid_tow_state`.
- The confirmation takes **no body**: there is no field in which a client could send an amount. A body is
  rejected with `422`.
- Retries are safe: same key, a different valid key, or concurrent retries all return the same payment with
  the same `received_at`.

## 6. Payment recovery

- `GET /tow/requests/{requestId}/payment` returns `PaymentSummary`:
  `{ request_id, method, status, amount_cents, currency, can_start_service, pix }`.
- The same object is embedded as `TowRequest.payment` in `GET /tow/requests/{requestId}`,
  `GET /tow/requests`, `GET /tow/partner/jobs`, the accept response and the execution/cancellation responses.
- Status vocabulary reachable in the MVP: `NOT_SELECTED → CASH_SELECTED → CASH_RECEIVED`
  (plus the lazy direct `NOT_SELECTED → CASH_RECEIVED` when the partner confirms on a completed job that never
  had a selection). `pix` is always `null`.

## 7. Idempotency keys

`Idempotency-Key` (8–128 chars) is REQUIRED and validated with `422 validation_error` **before any mutation**
on these 13 routed operations. A missing, shorter-than-8 or longer-than-128 key changes nothing:

- `POST /tow/requests` — create request
- `POST /tow/requests/{requestId}/proposals` — create proposal
- `POST /tow/proposals/{proposalId}/accept` — accept
- `POST /tow/proposals/{proposalId}/withdraw` — withdraw
- `POST /tow/requests/{requestId}/en-route` — execution milestone
- `POST /tow/requests/{requestId}/arrived` — execution milestone
- `POST /tow/requests/{requestId}/in-transit` — execution milestone
- `POST /tow/requests/{requestId}/finish` — execution milestone
- `POST /tow/requests/{requestId}/cancel` — customer cancellation
- `POST /tow/requests/{requestId}/cancel-partner` — partner cancellation
- `POST /tow/requests/{requestId}/tracking` — tracking write
- `PUT /tow/requests/{requestId}/payment-method` — method selection
- `POST /tow/requests/{requestId}/cash-received` — cash confirmation

Proof (runtime): `validateIdempotencyKey` runs in the corresponding application
services (`execution-service.js:85`, `cancellation-service.js:80`,
`tracking-service.js:80`, `payment-service.js:91,154`, `proposal-service.js:132,315`,
`assignment-service.js:164`, `tow-request-service.js:111`) and the suites assert the 422
(`tests/tow/mvp05/towMvp05Idempotency.test.js:82` covers all four milestones, both cancellations and the
tracking write; `tests/tow/mvp05/towMvp05ExecutionApi.test.js:316`; the MVP-04/MVP-06 key suites).

For every one of them the canonical row/state — not the key — is the idempotency authority, so a retry with a
different valid key still returns the same canonical result.

Six routed operations declare the header in the long-term contract but the accepted MVP runtime does **not**
validate it: `POST /tow/vehicles/{vehicleId}/activate`,
`DELETE /tow/vehicles/{vehicleId}/documents/{documentId}`, `PATCH /admin/tow/module`,
`PATCH /admin/tow/settings`, `POST /admin/tow/vehicle-documents/{documentId}/approve` and
`POST /admin/tow/vehicle-documents/{documentId}/reject`. The header is **accepted and ignored** there — sending
it is harmless, omitting it is never a 422, and no dedupe is applied. This delta is recorded in the canonical
draft.10 revision note; the long-term declaration is deliberately not narrowed.

## 8. Partner presence prerequisite (matching is data-dependent)

The opportunity feed is not "open the app and you are matchable": `GET /tow/partner/opportunities` evaluates the
authenticated partner against `partners.is_available`, `partners.is_online` and the partner's
`partners.latitude`/`partners.longitude` (`src/modules/tow/domain/matching.js:79-89`; the projection is read
from the same row in `src/modules/tow/adapters/persistence/partner-repository.js`). A partner whose row is not
available+online, or has no operational coordinates, sees an **empty feed** and no error.

The accepted runtime exposes **no `/tow/*` writer for those columns**. They are written only by the legacy
partner routes `PUT /api/partners/:id/online-status` (`is_online`) and `PUT /api/partners/:id/location`
(`latitude`/`longitude`), plus the legacy partner update (`is_available`); the canonical Tow module never
writes them as a side effect. Consequence for Mobile Parceiro: before the Tow feed can return anything, the
partner must become available/online and have coordinates through those legacy endpoints (or the database seed
used by the E2E evidence), and the client must not assume the Tow module provides that toggle yet. This is a
documented dependency, not a hidden one.

## 9. Error envelope

```json
{ "success": false, "message": "...", "error": { "code": "..." } }
```

Relevant codes: `validation_error` (422), `unauthorized` (401), `forbidden`/`not_request_owner`/
`not_assigned_partner`/`partner_not_operational` (403), `not_found` (404), `service_module_disabled`,
`request_already_assigned`, `proposal_not_actionable`, `invalid_tow_state`, `invalid_tow_transition`,
`stale_tracking_update`, `idempotency_conflict` (409).

## 10. Known MVP exclusions (do not build against these)

counteroffer · CARD · PIX · real Stripe / Mercado Pago / PagSeguro · PSP webhooks · refunds · partner platform
fee debt · customer debt · wallet · settlement · payout · disputes · reviews · admin override · no-show ·
rematch · advanced cancellation economics · tracking history · live ETA/rerouting · Phase 2 hardening · the
deferred security work of #31 (required before production go-live).

One declared operation is **not routed**: `GET /tow/requests/{requestId}/route` (`getTowRequestRoute`,
canonical `docs/tow/tow-api-contract.openapi.yaml:247-265`) has no route in
`src/modules/tow/http/routes.js` and answers **404**. It stays declared because the contract is the long-term
target (and `TowRouteSnapshot`/`encoded_polyline` are Phase 2 / #33 scope); route geometry must not be built
against it in the MVP. The tracking read carries the only route data the MVP exposes
(`{ pickup, destination }`).

`TowRequest.allowed_actions` does **not** advertise payment actions in this delivery; derive the cash UI from
`payment.status` and the caller's role.
