# MVP-05 — 02. Contract audit and draft.8 revision

* Contract entrypoint: `docs/tow/tow-api-contract.openapi.yaml` (overlay)
* Composed base: `docs/tow/tow-api-contract.base.openapi.yaml` (draft.2, **frozen — not touched**)
* Overlay at the base commit: `1.0.0-draft.7`
* Overlay after this delivery: `1.0.0-draft.8`

The audit below was performed **before** writing any MVP-05 code. It records the
canonical operation shape for every MVP-05 operation, so nothing in this delivery is
invented: paths, operationIds, request bodies, response envelopes and error codes are
all taken from the composed contract at draft.7.

---

## 1. Canonical operations in scope (draft.7 declaration)

| # | method + path | operationId | declared body | declared success | declared errors (draft.7) |
| --- | --- | --- | --- | --- | --- |
| 1 | `POST /tow/requests/{requestId}/en-route` | `startTowEnRoute` | none | `200` `TowRequestResponse` | `409` |
| 2 | `POST /tow/requests/{requestId}/arrived` | `markTowArrived` | `LocationInput` (required) | `200` `TowRequestResponse` | `409` |
| 3 | `POST /tow/requests/{requestId}/in-transit` | `startTowInTransit` | none | `200` `TowRequestResponse` | `409` |
| 4 | `POST /tow/requests/{requestId}/finish` | `finishTowService` | `LocationInput` (required) | `200` `TowRequestResponse` | `409` |
| 5 | `POST /tow/requests/{requestId}/cancel` | `cancelTowRequestByCustomer` | optional `{reason?: string\|null ≤1000}` | `200` `CancellationResponse` | `409` |
| 6 | `POST /tow/requests/{requestId}/cancel-partner` | `cancelTowRequestByPartner` | `RequiredReasonInput` (`reason` 1..2000) | `200` `CancellationResponse` | `409` |
| 7 | `GET /tow/requests/{requestId}/tracking` | `getTowTracking` | — | `200` `TrackingResponse` | `404` |
| 8 | `POST /tow/requests/{requestId}/tracking` | `postTowTrackingPoint` | `TrackingPoint` (required) | `202` `TrackingPointResponse` | `409` |

All eight operations declare `security: [{ bearerAuth: [] }]` and the
`Idempotency-Key` header parameter, **except** `GET .../tracking` which has no key (it
is a read).

Relevant frozen schema facts used verbatim:

* `LocationInput` = `{location: GeoPoint}`, `additionalProperties: false`, `location` required.
* `TrackingPoint` = `{latitude, longitude, recorded_at}`, `additionalProperties: false`,
  all three required, `recorded_at` is the **only** client-supplied instant.
* `TrackingResponse.data` = `{latest: TrackingPoint|null, route: {pickup, destination}}`.
* `CancellationResponse.data` = `{request: TowRequest, financial_consequence}`, and
  `financial_consequence` **requires** `fee_due_cents`, `currency`, `customer_debt_created`;
  `refund_status` is optional.
* `TowRequest` declares `state`, `terminal_reason`, `allowed_actions` — and **no
  milestone field of any kind**.

## 2. `PUT /tow/partner/location` — audit result

The overlay declares `/tow/partner/location` (`updateTowPartnerLocation`) and
`/tow/partner/status`, but **neither is routed** by `src/modules/tow/http/routes.js`
at the base, and both `tests/tow/mvp03/towMvp03Architecture.test.js` and
`tests/tow/mvp04/towMvp04Architecture.test.js` assert that the canonical router does
not contain the `/partner/location` token.

Classification: **`PHASE2_ONLY / NOT_THIS_DELIVERY`.** A partner position broadcast is
pre-assignment availability (matching input), not per-request tracking; MVP-05 does not
route it, does not store it, and keeps the architecture bans. Per-request tracking is
served only by operation 7/8 above.

## 3. Declared vs. runtime status surfaces (why draft.8 is required)

The runtime obligations for these operations are **not** expressible with `200`/`202`
+ `409` alone:

| situation | runtime status | draft.7 declares it? |
| --- | --- | --- |
| missing/expired token | `401` | **no** |
| authenticated with the wrong role (customer on a partner route, partner on a customer route) | `403 forbidden` | **no** |
| authenticated partner who is not the assigned partner | `403 not_assigned_partner` | **no** |
| authenticated customer who does not own the request | `403 not_request_owner` | **no** |
| unknown / non-canonical request id | `404 not_found` | only on `GET .../tracking` |
| missing/short/over-long `Idempotency-Key`, malformed body | `422 validation_error` | **no** |
| illegal transition, terminal write, stale tracking point | `409` | yes (`409` only) |
| `GET .../tracking` with no live assignment | `403 not_assigned_partner` | **no** |

The delivery therefore makes a **consumer-visible contract revision**, draft.7 →
draft.8, following the exact precedent of draft.5/draft.6/draft.7 (additive only,
documented in `info.description`, never a silent mutation):

1. `info.version` becomes `1.0.0-draft.8` with a revision paragraph.
2. The eight MVP-05 operations stop being plain `$ref`s into the frozen base and are
   re-declared **in the overlay** with their full, truthful status surfaces
   (`200`/`202`, `401`, `403`, `404`, `409`, `422`) while keeping the same paths,
   operationIds, request bodies and success schemas. Nothing is renamed, removed or
   narrowed.
3. The overlay `ErrorResponse.error.code` enum gains **`stale_tracking_update`**, the
   code returned when a tracking write carries an `observed_at` older than the stored
   one. This mirrors the draft.6 `proposal_already_active` addition: an additive code
   that names a real, distinguishable condition instead of overloading `conflict`.

Nothing else changes: the frozen base file is byte-identical, all other overlay paths
keep their `$ref`s, and no previously declared code loses meaning.

## 4. Authz matrix implemented by the runtime

| operation | anonymous | customer (owner) | customer (foreign) | assigned partner | other tow partner |
| --- | --- | --- | --- | --- | --- |
| `en-route` / `arrived` / `in-transit` / `finish` | `401` | `403 forbidden` | `403 forbidden` | `200` | `403 not_assigned_partner` |
| `cancel` | `401` | `200` | `403 not_request_owner` | `403 forbidden` | `403 forbidden` |
| `cancel-partner` | `401` | `403 forbidden` | `403 forbidden` | `200` | `403 not_assigned_partner` |
| `GET tracking` | `401` | `200` | `403 not_request_owner` | `200` | `403 not_assigned_partner` |
| `POST tracking` | `401` | `403 forbidden` | `403 forbidden` | `202` | `403 not_assigned_partner` |

Authorization is evaluated **before** replay: a foreign actor receives `403` on a
terminal request and never learns its state. Unknown ids are `404 not_found` for
authorized callers, and a non-canonical id (`abc`, `-1`, `1.5`, `0`) is a `404`, never
a `500`.

## 5. `allowed_actions` — the one vocabulary the contract already fixes

`TowRequest.allowed_actions` is declared in the frozen base as an array of action
tokens. The contract exposes exactly **one** cancellation token, `cancel`, shared by
both roles, and the base's action vocabulary for progress is
`start_en_route`, `mark_arrived`, `start_in_transit`, `finish_service`
(plus `accept_proposal`, owned by MVP-04).

MVP-05 therefore makes the projection **viewer-aware** without inventing a token:

| state | customer viewer | partner viewer |
| --- | --- | --- |
| `ASSIGNED` | `['cancel']` | `['start_en_route', 'cancel']` |
| `EN_ROUTE` | `['cancel']` | `['mark_arrived', 'cancel']` |
| `ARRIVED` | `['cancel']` | `['start_in_transit', 'cancel']` |
| `IN_TRANSIT` | `[]` | `['finish_service']` |
| `COMPLETED` / `CANCELLED` | `[]` | `[]` |
| `SEARCHING`/`NEGOTIATING` + live proposal | `['accept_proposal']` | `[]` |

Because the customer execution routes do not exist (only the partner drives the
service), the customer never sees a progress token; because cancellation is
role-shared in the contract, both viewers see `cancel` while the request is
cancellable. The default viewer is `customer`, which preserves the MVP-03/MVP-04
read paths unchanged.

## 6. Response-shape decisions (no invented fields)

* **No milestone fields are added to `TowRequest`.** The contract declares none, the
  MVP-03 domain test pins the DTO shape with `toEqual`, and the frozen base must not be
  extended. Milestones are persisted facts proven at the database level
  (`en_route_at`, `arrived_at`, `in_transit_at`, `completed_at`, `cancelled_at`).
* **`refund_status` is omitted**, not invented: it is optional and MVP-05 owns no
  refund semantics.
* **`financial_consequence` is truthful, not decorative**: `fee_due_cents: 0`,
  `currency: 'BRL'`, `customer_debt_created: false` — MVP-05 charges no cancellation
  fee and creates no debt, even though settings already carry a
  `tow_cancellation_fee_cents` value for a later delivery.
* **Tracking writes echo the client's `recorded_at`** and never a server instant; the
  internal column is `observed_at` and the DTO maps it back to `recorded_at`, so the
  contract member keeps its single meaning.
* **`POST .../tracking` answers `202`**, exactly as declared, because the accepted
  point is stored, not derived.
