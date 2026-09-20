# MVP-02 — Google Routes API contract verification

Scope: prove that the adapter in
`src/modules/tow/adapters/routes/google-routes-adapter.js` matches the real
Google Routes API v2 surface, and that the leg boundaries the price depends on
are produced by Google rather than derived by us.

Everything below was checked against the live Google documentation during this
delivery (2026-09). Nothing in this file is assumed from memory.

## 1. Endpoint, method, headers

| Item | Value | Why it matters |
| --- | --- | --- |
| Method + path | `POST https://routes.googleapis.com/directions/v2:computeRoutes` | v2 is the current Routes API; the legacy Directions API is a different product with a different response shape. |
| `Content-Type` | `application/json` | Required. |
| `X-Goog-Api-Key` | server-side key | The backend key must be separate from the browser key (see §6). |
| `X-Goog-FieldMask` | **mandatory** | Without it the API returns an error; it also determines what we are allowed to read, which keeps the adapter honest about what it consumes. |

**Field mask actually requested:**

```
routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline
```

Route-level `routes.distanceMeters` / `routes.duration` are deliberately **not**
requested. Requesting them would create a second, potentially disagreeing source
for the same number; the legs are the authority and the total is their exact
integer sum (`domain/route.js`).

`RouteLeg.stepsOverview` is TRANSIT-only and is not requested.

## 2. Request body

```json
{
  "origin":      { "location": { "latLng": { "latitude": -23.56, "longitude": -46.65 } } },
  "destination": { "location": { "latLng": { "latitude": -23.54, "longitude": -46.63 } } },
  "intermediates": [
    { "location": { "latLng": { "latitude": -23.55, "longitude": -46.64 } } }
  ],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE",
  "computeAlternativeRoutes": false,
  "polylineQuality": "HIGH_QUALITY",
  "polylineEncoding": "ENCODED_POLYLINE",
  "units": "METRIC",
  "languageCode": "pt-BR"
}
```

- The pickup is a **single intermediate waypoint**, and it is **not** marked
  `via: true`. This is the crux of the design — see §3.
- `travelMode: "DRIVE"` is required for leg boundaries to be returned at all.
- `units: "METRIC"` keeps `distanceMeters` in meters, matching the canonical unit
  of the Tow contract (integer meters).

## 3. Why one call with `intermediates` (and not two calls, and not `via`)

The price is
`provider -> pickup` **+** `pickup -> destination`, and the contract requires the
total to equal the sum of the legs. Three candidate strategies were evaluated:

| Strategy | Verdict |
| --- | --- |
| Two separate `computeRoutes` calls (A→B, B→C) | **Rejected.** Two calls can be routed on different traffic snapshots, and the two polylines are disjoint: the customer sees two disconnected lines and the "total" is a sum of two independently-optimised routes rather than one trip. Also doubles quota and latency. |
| One call, pickup as `via: true` intermediate | **Rejected.** A `via` waypoint is a "pass-through" point: Google does not split the route there, so `legs` comes back with a single entry and the provider→pickup boundary is lost. |
| **One call, pickup as a non-`via` intermediate** | **Chosen.** One request, one continuous polyline for the whole trip, and Google itself places the leg boundary at the pickup. |

### Evidence that `legs[]` is populated for `DRIVE`

Google's own intermediate-waypoints guide shows a `DRIVE` request with
`X-Goog-FieldMask: routes.legs` and an intermediate waypoint returning two legs:

```json
{
  "distanceMeters": 805,
  "legs": [ { "distanceMeters": 207 }, { "distanceMeters": 598 } ]
}
```

207 + 598 = 805, i.e. the route total is exactly the sum of the legs — the same
invariant `domain/route.js` enforces. The only leg field documented as
TRANSIT-only is `RouteLeg.stepsOverview`, not `RouteLeg.distanceMeters`.

## 4. Response fields consumed

| Path | Type | Handling |
| --- | --- | --- |
| `routes` | array | Absent/not an array → `malformed_response`. Empty → `empty_route`. |
| `routes[0].legs` | array | Must have **exactly 2** entries with a pickup, **exactly 1** without. Anything else → `malformed_response`. |
| `routes[0].legs[i].distanceMeters` | integer | Must be a non-negative safe integer. Never rounded, never rescaled. |
| `routes[0].legs[i].duration` | string | Protobuf Duration, e.g. `"165s"`, up to 9 fractional digits. Parsed as decimal text with BigInt and rounded HALF_UP. |
| `routes[0].polyline.encodedPolyline` | string | Optional decoration. Missing/unusable → `null`; never fails the quote. |

`legs[0]` is mapped to `provider_to_pickup` and `legs[1]` to
`pickup_to_destination`. Without a pickup the single leg is
`pickup_to_destination` and `provider_to_pickup` is `null`.

### Fail-closed leg count

An unexpected leg count is a hard `malformed_response`. There is deliberately no
"split the total by ratio", no "use the route total for both legs" and no
straight-line fallback: any of those would produce a price that is not the price
of the trip the customer is buying.

## 5. Error mapping

| Condition | `reason` | Application code |
| --- | --- | --- |
| Key absent / blank | `configuration_missing` | `external_dependency_unavailable` (503) |
| Key not a string, bad `timeoutMs` | `configuration_invalid` | `external_dependency_unavailable` (503) |
| Axios `ECONNABORTED` / `ETIMEDOUT` / `ERR_CANCELED` | `timeout` | `external_dependency_unavailable` (503) |
| No HTTP response | `network_failure` | `external_dependency_unavailable` (503) |
| Any HTTP status (400/401/403/429/5xx) | `provider_error` + safe `{status}` | `external_dependency_unavailable` (503) |
| `routes: []` | `empty_route` | `external_dependency_unavailable` (503) |
| Unusable payload / leg count | `malformed_response` + safe `{field}` | `external_dependency_unavailable` (503) |

`details` carries only safe scalars. The key, the request body, the raw provider
body and the original stack are never attached — the application layer discards
the adapter error entirely and raises a generic
`external_dependency_unavailable`, so no transport detail can reach a client.

## 6. Key hygiene — why the browser Maps key is not reusable

- `socorre_ai_admin/src/config/apiKeys.ts:3` exposes
  `REACT_APP_GOOGLE_MAPS_API_KEY` with a hardcoded fallback, and
  `socorre_ai_admin/src/components/partners/PartnerForm.tsx:148` uses it for
  Geocoding. A key shipped to a browser is public by construction; it can only be
  restricted by HTTP referrer, which is not a restriction a server can present.
- MVP-02 introduces no committed `GOOGLE_ROUTES_API_KEY` or server-side Routes
  credential. The pre-existing browser/admin Maps-key fallback is outside MVP-02
  and remains deferred to #31.
- `docs/evidence/t00/google-routes-audit.txt` recorded that the backend had **no**
  Google client before this delivery.
- MVP-02 therefore introduces a distinct variable, `GOOGLE_ROUTES_API_KEY`,
  documented in `env.example` and `env.production.example` with the required
  restriction (application restriction by server IP/CIDR, API restriction
  including "Routes API"). The adapter must never read `GOOGLE_MAPS_API_KEY` or
  any `REACT_APP_*` variable — asserted by
  `tests/tow/mvp02/towRouteProviderBoundary.test.js`.
- The examples only document the variable name; MVP-02 adds no credential
  literal of its own.
- An unset key does not break startup: `createGoogleRoutesAdapter` never throws at
  construction, and the failure surfaces per call as
  `external_dependency_unavailable` (503). Composition is verified to build with
  no key present.

## 7. What was explicitly *not* done

- No Haversine / great-circle fallback anywhere in `src/` or the test helpers —
  asserted by an architecture test that scans for `6371`, `haversine(`,
  `toRadians(` and `Math.acos(`.
- No estimation vocabulary (`estimated_distance`, `fallback_distance`,
  `approx_distance`, `distance_factor`, `average_speed`) in the module.
- No `ceil` of excess kilometres: billing is proportional to the exact excess
  meters, per `docs/tow/TOW-PRICING-CONTRACT.md`.
- No public HTTP endpoint was added, so the frozen OpenAPI documents were not
  modified (rationale in `01-current-state-delta.md` §4).
- No new database migration; schema fingerprint stays
  `37cee47edc8dd1084786ab5fe3c32511c71b9a4a2788f67406391916c7cc0f59`.

## 8. Sources consulted

- Google Routes API v2 — `computeRoutes` REST reference (request body, field
  mask, `intermediates`, `RouteLeg`, `LatLng`).
- Google Routes API — "Get a route with intermediate waypoints" guide (the
  `DRIVE` + `routes.legs` two-leg response quoted in §3).
- Google Routes API — usage limits / field mask requirement.
- Google Maps Platform — API security best practices (application vs API
  restrictions; why a browser key is not a server key).
- In-repo: `docs/tow/TOW-PRICING-CONTRACT.md`,
  `docs/evidence/t00/google-routes-audit.txt`,
  `docs/tow/tow-api-contract.base.openapi.yaml:1182-1195`
  (`RouteLeg` / `RouteQuote`).
