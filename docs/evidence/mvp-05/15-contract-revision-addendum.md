# MVP-05 — 15 Contract Revision Addendum (draft.7 → draft.8)

> The contract policy of this repo is: **the base contract is immutable and the
> overlay composes it**. A consumer-visible change is made by bumping the overlay
> revision, writing the note here and proving the runtime emits exactly what was
> declared — never by silently mutating draft.7.

## Files

| file | role | state after MVP-05 |
| --- | --- | --- |
| `docs/tow/tow-api-contract.base.openapi.yaml` | MVP-03/04 frozen base (`1.0.0-draft.2`, OpenAPI 3.1.0) | **byte-identical to the dispatch base** (`git diff --quiet a3aa1d75 -- <base>` is empty) |
| `docs/tow/tow-api-contract.openapi.yaml` | composed overlay | `1.0.0-draft.7` → **`1.0.0-draft.8`** |
| `docs/tow/TOW-API-CONTRACT.md` | human-readable contract | §12 gains one error-code line |

```
docs/tow/tow-api-contract.openapi.yaml           | 253 +++++++++++++++++++++++--
docs/tow/TOW-API-CONTRACT.md                     |   1 +
docs/tow/tow-api-contract.base.openapi.yaml      |   0   (untouched)
```

## What draft.8 changes, and why each change is not a silent mutation

1. **Eight MVP-05 operations re-declared inline.** In draft.7 the eight paths were
   `$ref`s into the base. The base declares only the happy path (`200`/`202`), so
   the *truthful status surface* the backend produces was undeclared. Draft.8
   re-declares the eight operations with the full set:
   `startTowEnRoute`, `markTowArrived`, `startTowInTransit`, `finishTowService`,
   `cancelTowRequestByCustomer`, `cancelTowRequestByPartner` →
   `200/401/403/404/409/422`; `getTowTracking` → `200/401/403/404`;
   `postTowTrackingPoint` → `202/401/403/404/409/422`. All eight keep their
   `operationId`, method, path, tags and the base's response *schemas*; the
   `Idempotency-Key` parameter (8–128) is required on all of them except the GET.
2. **`ErrorResponse.error.code` gains `stale_tracking_update`** — the new MVP-05
   refusal (a tracking point strictly older than the stored one). Additive.
3. **An inherited gap is closed: `partner_not_operational`.** This code has been
   returned by `POST /tow/requests/{requestId}/proposals` (403, partner not an
   eligible Tow partner) since MVP-04 but was declared in neither the overlay enum
   nor `TOW-API-CONTRACT.md` §12. It is now in both. The proof is the existing
   MVP-04 runtime assertion (`tests/tow/mvp04/towProposalCreate.test.js:251,262`
   expect 403 with that code), and the MVP-05 architecture suite now fails if any
   code in `domain.ERROR_STATUS` is missing from the composed contract — which is
   how the gap was found.
4. **Two behavioural clarifications are recorded, not changed:**
   - `allowed_actions` is **viewer-aware**: the assigned partner is offered the
     forward milestone (+`cancel`) in `ASSIGNED`/`EN_ROUTE`/`ARRIVED`, the
     customer is offered only `cancel`. The member, its type and its enum are
     unchanged; what changed is that the *same row* now projects different
     actions to different viewers, and that had to be written down because the
     customer's `ASSIGNED` body is consumer-visible;
   - `POST .../cancel` accepts an optional body (`reason`, max 1000) exactly as
     the base declares, while `POST .../cancel-partner` requires
     `RequiredReasonInput` (1–2000). Both persist the same attribution columns.
     The runtime matches both bounds exactly
     (`CUSTOMER_CANCELLATION_REASON_MAX_LENGTH = 1000`,
     `PARTNER_CANCELLATION_REASON_MAX_LENGTH = 2000`).

**No path, parameter, response shape or enum member is removed or narrowed**, and
no code is renamed. The only removals in the diff are the eight `$ref` lines that
the inline re-declarations replace and the `draft.7` version string itself.

## How the revision is pinned (so it cannot drift back)

| assertion | file |
| --- | --- |
| overlay version is exactly `1.0.0-draft.8` | `tests/contract/openapi.structure.test.js:199`, `tests/tow/mvp04/towProposalContract.test.js:115`, `tests/tow/mvp04/towMvp04Architecture.test.js:314`, `tests/tow/mvp03/towPartnerOpportunitiesContract.test.js:118`, `tests/contract/towOperationContract.test.js:252` |
| the app's declared version constant is `1.0.0-draft.8` | `src/modules/tow/application/tow-request-service.js:211` |
| the overlay composes the base by `$ref` and is not a copy | `tests/tow/mvp05/towMvp05Architecture.test.js` |
| all eight MVP-05 operation ids are re-declared | same suite |
| every code in `domain.ERROR_STATUS` is declared in the composed enum | same suite (+ `tests/helpers/towContract.js` `CANONICAL_ERROR_CODES`) |
| the base is byte-identical to the dispatch base | `git diff --quiet a3aa1d75 -- <base>` (re-run in `12-regression-summary.md`) |

## Runtime ↔ contract agreement

The operation-contract suite
(`tests/contract/towMvp05OperationContract.test.js`, 16/16) drives **every**
declared status of all eight operations against the real app and validates each
response body with Ajv against the composed schema (including `ErrorResponse`),
so draft.8 is not a description of an intention: every status and body it declares
was produced by the running backend in that suite. It also asserts the tracking
read makes no RouteProvider call, and that the tracking pair's request body is the
declared `TrackingPoint`.
