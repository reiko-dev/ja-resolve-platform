# Tow MVP — Integration handoff (Mobile Cliente / Mobile Parceiro)

Date: 2026-09-21
MVP-06 accepted: PR #40 merged at `c5ca8cc112f39ca8b1d0952b7c1a9305619f24b4`
Milestone: `TOW MVP BACKEND READY FOR INTEGRATION` (MVP subset only)
Base URL: `/api` (contract `servers: [/api]`)
Auth: `Authorization: Bearer <JWT>` on every operation below

This is the concise consumer handoff. The durable capability list is
`docs/evidence/mvp-06/TOW-MVP-READINESS.md`; the normative shapes are
`docs/tow/tow-api-contract.openapi.yaml` (canonical, `1.0.0-draft.9`).

---

## 1. Implemented endpoints

### Module & partner onboarding
| Method | Path | Who |
| --- | --- | --- |
| GET | `/tow/module-status` | public |
| GET/POST/PATCH/DELETE | `/tow/vehicles`, `/tow/vehicles/{vehicleId}`, `.../activate`, `.../deactivate` | Tow partner |
| GET/POST/DELETE | `/tow/vehicles/{vehicleId}/documents`, `.../documents/{documentId}` | Tow partner |
| GET | `/tow/vehicles/{vehicleId}/documents/{documentId}/download` | Tow partner (authenticated bytes) |
| GET/PATCH | `/admin/tow/module`, `/admin/tow/settings` | admin |
| GET | `/admin/tow/vehicle-documents`, `/admin/tow/vehicle-documents/{documentId}` | admin |
| POST | `/admin/tow/vehicle-documents/{documentId}/approve`, `.../reject` | admin |

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

`Idempotency-Key` (8–128 chars) is required on: create request, create proposal, accept, withdraw, tracking
write, method selection and cash confirmation. For every operation the canonical row/state — not the key — is
the idempotency authority, so a retry with a different valid key still returns the same canonical result.

## 8. Error envelope

```json
{ "success": false, "message": "...", "error": { "code": "..." } }
```

Relevant codes: `validation_error` (422), `unauthorized` (401), `forbidden`/`not_request_owner`/
`not_assigned_partner`/`partner_not_operational` (403), `not_found` (404), `service_module_disabled`,
`request_already_assigned`, `proposal_not_actionable`, `invalid_tow_state`, `invalid_tow_transition`,
`stale_tracking_update`, `idempotency_conflict` (409).

## 9. Known MVP exclusions (do not build against these)

counteroffer · CARD · PIX · real Stripe / Mercado Pago / PagSeguro · PSP webhooks · refunds · partner platform
fee debt · customer debt · wallet · settlement · payout · disputes · reviews · admin override · no-show ·
rematch · advanced cancellation economics · tracking history · live ETA/rerouting · Phase 2 hardening · the
deferred security work of #31 (required before production go-live).

`TowRequest.allowed_actions` does **not** advertise payment actions in this delivery; derive the cash UI from
`payment.status` and the caller's role.
