# SERVICE LOCATION — MVP ARCHITECTURE (PHASE 5)

Status: FROZEN — canonical decisions below are not re-openable inside Phase 5.
Scope: platform-level `service-location` module, Google Places (New) backend
proxy, mobile generic location search, additive Tow adoption, shared tracking
secondary line.

This document is the ADR and the frozen contract. Implementation, tests and
review MUST obey it. If a line of this document conflicts with the current
official Google documentation, the implementation obeys Google and this
document is corrected in the same PR.

---

## 1. Canonical decisions

| Decision | Value |
|---|---|
| Autocomplete | `BACKEND_PROXY` — mobile never calls the Places Web Service |
| Place Details | `BACKEND_PROXY` |
| Session token owner | `MOBILE` generates, `BACKEND` forwards, nobody persists |
| Session token shape | client-generated UUID v4 string (36 ASCII chars, URL/filename-safe base64 alphabet) |
| Nearby Search | `DEFERRED` (not implemented) |
| Confidence model | `NOT_MODELED` (no HIGH/LOW/NONE, no nearest-place-wins) |
| Coordinate authority | `latitude + longitude` is the operational truth for routing, matching, map, tracking, navigation, distance and ETA |
| Map POI tap | `UNSUPPORTED` with the installed `google_maps_flutter` (see §9) |
| GPS rule | `CURRENT_LOCATION`, never `placeId`/`placeName` |
| Generic pin rule | `USER_PIN`, never `placeId`/`placeName` |

Provider boundary:

```text
mobile ──HTTP──► our backend ──HTTPS──► Places API (New)   (places.googleapis.com)
                          └──HTTPS──► Geocoding API (existing GOOGLE_GEOCODING_API_KEY)
```

The mobile app holds no Places/Geocoding server key. The device geocoder
(`geocoding` package) may stay for fast local feedback, as it is not a Google
Web Service call.

---

## 2. Identity rule (the invariant this phase exists to protect)

```text
EXPLICIT PLACE                       GENERIC COORDINATE
--------------                       ------------------
placeId != null                      placeId = null
placeName may exist                  placeName = null
resolutionSource =                   resolutionSource =
  USER_SELECTED_PLACE                  USER_PIN | CURRENT_LOCATION
formattedAddress from the            formattedAddress is reverse-geocode
selected prediction / details        enrichment only, never identity
```

Hard invariants enforced by `domain/service-location.js`:

1. `placeId != null` ⇒ `resolutionSource === USER_SELECTED_PLACE`.
2. `resolutionSource === USER_SELECTED_PLACE` ⇒ `placeId != null`.
3. `placeName != null` ⇒ `placeId != null`.
4. The geocoder/reverse-geocoder NEVER creates `placeId` or `placeName`.
5. `latitude`/`longitude` are always required, finite, in WGS84 range and not
   `(0,0)` — reusing the canonical Tow validators (`assertOperationalGeoPoint`,
   never duplicated).
6. A valid coordinate with a failed geocoder is still a valid ServiceLocation
   (`formattedAddress = null`); a failed Place Details call is NOT a valid
   explicit selection (no authoritative coordinate).

`ResolutionSource` vocabulary — exactly these four, no `REVERSE_GEOCODE`:

```text
USER_SELECTED_PLACE | USER_PIN | CURRENT_LOCATION | SAVED_ADDRESS
```

`SAVED_ADDRESS` is reservable in the domain but no endpoint produces it in
Phase 5 (saved-address persistence is deferred, RF-007).

Acceptance cases (tested with fakes, zero real Google calls):

| Case | Action | Expected |
|---|---|---|
| A | search "Contax", select suggestion | `placeId != null`, `placeName = Contax`, `USER_SELECTED_PLACE`, coords from Details |
| B | tap POI on the map | installed plugin delivers no `placeId` ⇒ `MAP_POI_EXPLICIT_SELECTION=UNSUPPORTED`; the tap falls through to the generic pin rule. No heuristic. |
| C | tap a generic area inside the Contax polygon | `USER_PIN`, `placeId = null`, `placeName = null`, `formattedAddress` = reverse-geocoded address |
| D | GPS fix inside the Contax polygon | `CURRENT_LOCATION`, `placeId = null`, `placeName = null` |

---

## 3. Storage policy (aligned with current official Google terms)

Google Maps Platform Service Specific Terms and Places Policies allow:

| Data | Source | Durable storage |
|---|---|---|
| `place_id` | Places API | **YES — indefinitely** (exempt from caching restrictions; refresh after 12 months, free) |
| `latitude`/`longitude` from Places | Places API | max 30 consecutive calendar days as a cache |
| `formattedAddress` from Place Details | Places API | **NO caching permission** |
| `displayName` / place names | Places API | **never persisted** |
| `formatted_address`, structured address, lat/lng | **Geocoding API** | allowed to support the direct end-user functionality, logically isolated per end user, not as a substitute for calls |

Consequences implemented in Phase 5:

1. `placeName` is **never** persisted. It may exist in the HTTP response, the
   mobile presentation model, session memory and best-effort read-time
   enrichment. No column, no durable cache.
2. `placeId` is persisted on Tow pickup/destination (`pickup_place_id`,
   `destination_place_id`, nullable, additive).
3. `formatted_address` persistence continues exactly as today: it is the
   user-facing address text of the request, produced by the device/OS geocoder
   or the existing Geocoding API adapter. When a place is selected, the client
   may send the presentation string it holds; the backend never turns a Place
   Details response into a durable `place_name`. The `(lat,lng)` inside a Places
   response are used as operational coordinates only.
4. `primaryType`, `addressComponents` are not persisted. They are not even
   requested.
5. Field masks (minimum viable):

```text
Autocomplete:
  suggestions.placePrediction.placeId,
  suggestions.placePrediction.text.text,
  suggestions.placePrediction.structuredFormat.mainText.text,
  suggestions.placePrediction.structuredFormat.secondaryText.text

Place Details:
  id,displayName,formattedAddress,location
```

`displayName` is required by the frozen `PlaceDetailsPort` contract and by the
explicit-place presentation rule. It is a Pro-SKU field; the session-terminating
Place Details call therefore bills at a Pro/Enterprise tier instead of
Essentials. This is a deliberate product-cost decision, recorded here so it can
be revisited with the PO (alternative: drop `displayName` and reuse the
prediction `mainText` as the ephemeral name).

No `reviews`, `photos`, `ratings`, `phone`, `website`, `openingHours`,
`primaryType` are ever requested.

---

## 4. Session token lifecycle

```text
user opens the search surface        → sessionToken = new UUID v4 (36 chars)
typing / autocomplete calls          → same token in the request body `sessionToken`
user selects a suggestion            → Place Details with `?sessionToken=<same>`
selection finished / surface closed  → token discarded
next search interaction              → new UUID v4
```

Backend rules: forward the token verbatim, validate length/alphabet, never log
it, never store it. If the token is absent in Details, the call is still valid
(per-request billing); the mobile always sends it.

Google hard limits honoured: ≤ 36 ASCII characters, URL/filename-safe base64
alphabet. A UUID v4 string is exactly 36 chars — never prefix/suffix it.

---

## 5. Frozen backend HTTP contract

Base: `/api`. Envelope identical to the rest of the platform:
`{ "success": true, "data": ... }` / `{ "success": false, "message": "...", "error": { "code": "...", "details"?: {...} } }`.

### 5.1 `POST /api/locations/autocomplete`

Auth: `Authorization: Bearer <jwt>` (`auth` middleware) + per-user limiter.

```json
{
  "input": "araujo mix",
  "session_token": "44f7a0c9-...-36chars",
  "location_bias": { "latitude": -9.97, "longitude": -67.84, "radius_meters": 50000 }
}
```

| Field | Rule |
|---|---|
| `input` | required string, 1..200 chars after trim |
| `session_token` | required, 8..36 chars, `[A-Za-z0-9_-]` |
| `location_bias` | optional; `latitude`/`longitude` finite WGS84; `radius_meters` 1..50000, default 50000 |

`location_bias` is a **bias** (`locationBias.circle`), never a restriction; the
user may pick a destination anywhere. `languageCode=pt-BR`, `regionCode=br`
are sent; `includedRegionCodes` is not sent (no hard country restriction).

200:

```json
{ "success": true, "data": { "predictions": [
  { "place_id": "ChIJ...", "primary_text": "Contax", "secondary_text": "Estrada Dias Martins, Rio Branco - AC" }
] } }
```

Empty result is a 200 with `predictions: []` (Places API New has no
`ZERO_RESULTS` status). `queryPrediction` entries are ignored.

### 5.2 `GET /api/locations/places/{placeId}`

Auth: same. Query: `session_token?` (8..36, same rules), `language_code?`
(default `pt-BR`).

200:

```json
{ "success": true, "data": {
  "place_id": "ChIJ...",
  "place_name": "Contax",
  "formatted_address": "Estrada Dias Martins, 123 - Rio Branco, AC",
  "latitude": -9.97,
  "longitude": -67.84
} }
```

`place_name` is response-only, never persisted. `formatted_address` is
presentation-only (see §3).

### 5.3 Error semantics

| Situation | HTTP | `error.code` |
|---|---|---|
| invalid body / input / token / bias | 422 | `validation_error` |
| unknown or obsolete `placeId` | 404 | `not_found` |
| provider timeout/network/5xx/quota exhausted | 503 | `upstream_unavailable` |
| provider denied the key / malformed response / invalid provider request | 502 | `upstream_rejected` |
| places provider not configured (`SERVICE_LOCATION_PLACES=none`) | 503 | `upstream_unavailable` |
| per-user rate limit | 429 | `rate_limited` |
| unauthenticated | 401 | (existing auth envelope) |

Autocomplete provider failure = "search unavailable, retry" — the backend
never invents suggestions. Details failure = the selection cannot be finalized
(there is no authoritative coordinate). Reverse-geocoding failure with a valid
coordinate never blocks anything: `formattedAddress = null`.

Logging: never log the API key, the session token, the raw provider response or
the full search text. Safe reason strings only (`places_request_denied`, ...).

---

## 6. Frozen backend module structure

```text
src/modules/service-location/
├── index.js                       platform barrel (no http)
├── composition.js                 provider wiring (placesProvider, geocoding)
├── domain/
│   ├── geo.js                     re-export of the canonical Tow geo invariants
│   ├── errors.js                  ServiceLocationError + codes
│   ├── resolution-source.js       vocabulary + validators
│   ├── service-location.js        buildServiceLocation + explicit/generic builders
│   └── index.js
├── application/
│   ├── ports.js                   PlaceSearchPort, PlaceDetailsPort, GeocodingPort
│   ├── place-search-service.js    searchPredictions orchestration
│   ├── location-resolution-service.js
│   └── index.js
├── adapters/places/
│   ├── places-provider-error.js
│   └── google-places-adapter.js   the only file that knows Places (New) JSON
└── http/
    ├── routes.js  controller.js  serialize.js  error-mapper.js  rate-limit.js  mount.js
```

Config: `src/config/serviceLocationPlaces.js`

```text
SERVICE_LOCATION_PLACES = none | google   (default none)
GOOGLE_PLACES_API_KEY                     (required only when google; never GOOGLE_MAPS_API_KEY)
```

`none` keeps the app booting with a controlled 503 from the endpoints;
explicit `google` without a key fails fast at startup (same pattern as
`TOW_ADDRESS_RESOLVER`). Mount in `src/app.js` at `/api/locations`.

The `service-location` module MUST NOT import the Tow module (one-way edge only:
Tow may consume `service-location`). The single exception is the deliberate
reuse of the canonical geo validators through `domain/geo.js`, per the
"never duplicate `assertOperationalGeoPoint`" rule.

Ports (provider-neutral, JSDoc in `application/ports.js`):

```text
PlaceSearchPort.searchPredictions({ input, sessionToken, locationBias? })
  -> Promise<{ predictions: [{ placeId, primaryText, secondaryText|null }] }>

PlaceDetailsPort.getPlace({ placeId, sessionToken? })
  -> Promise<{ placeId, placeName|null, formattedAddress|null, latitude, longitude }>

GeocodingPort.reverse({ latitude, longitude })
  -> Promise<{ formattedAddress: string|null }>   // may be null in composition
```

Adapters throw `PlacesProviderError` (reasons mirroring the existing
`AddressResolverError` vocabulary); application translations live in
`http/error-mapper.js`.

---

## 7. Frozen mobile contract

Shared (`packages/socorre_shared`):

```text
ServiceLocation {
  latitude: double, longitude: double,
  formattedAddress: String?, placeId: String?, placeName: String?,
  resolutionSource: ServiceLocationResolutionSource
}
enum ServiceLocationResolutionSource {
  userSelectedPlace, userPin, currentLocation, savedAddress
}
```

Single formatter (no widget builds its own rule):

```text
explicit place  → primary = placeName ?? formattedAddress ?? 'Local selecionado'
                  secondary = (placeName != null) ? formattedAddress : null
generic/GPS     → primary = formattedAddress ?? 'Local selecionado'
                  secondary = null
never           → "-9.9784, -67.8478" as the primary label
```

Client search surface (`apps/socorre_client_app/lib/features/location`):

- `ServiceLocationPickerScreen.open(context)` returns `Future<ServiceLocation?>`.
- Header action `Buscar endereço ou estabelecimento` opens the search field.
- Choice sheet: `Buscar endereço ou estabelecimento`, `Usar minha localização`,
  `Selecionar no mapa`.
- Debounce 350 ms; request generation counter so a stale response can never
  overwrite newer suggestions; cancel/ignore on dispose.
- Session token created once per search-surface session, reused for the Details
  call, discarded when the surface closes.
- Search result row: `primaryText` + `secondaryText` (never the place id).
- Map pin: `MapView(onMapTap)` → reverse geocode (device geocoder) →
  `USER_PIN`, never identity. Current location: `CURRENT_LOCATION`, never identity.
- POI tap: unsupported with the installed plugin; no Nearby/Text Search, no
  heuristic, no dependency swap.
- Failure copy PT-BR: search unavailable/retry; Details failure = selection not
  completed; geocoding failure = show `Local selecionado`.

Request state: the existing `TowRouteSelectionNotifier` remains the single Tow
draft owner; returning from search/map/vehicle never resets it.

---

## 8. Frozen Tow adoption contract

Additive only. Older clients keep working unchanged.

```text
create payload pickup/destination:
  latitude          required
  longitude         required
  formatted_address optional
  place_id          optional, string 1..500          (NEW)
  resolution_source optional, enum §2                (NEW)
  place_name        REJECTED (strict unknown keys)   (never accepted)
```

Rules:

- absent `resolution_source` + absent `place_id` = legacy client; accepted, no
  invented identity.
- `place_id != null` ⇒ `resolution_source` must be `USER_SELECTED_PLACE` (or
  omitted → normalized to `USER_SELECTED_PLACE`). Otherwise 422.
- `resolution_source = SAVED_ADDRESS` is rejected in Phase 5 (422).
- coordinates remain authority; no text is ever geocoded into routing.
- persistence: `pickup_place_id`, `destination_place_id` TEXT NULL (migration
  `012`), additive, nullable, historical rows untouched.
- `resolution_source` is NOT persisted: no durable consumer exists; explicit
  identity is derivable from `place_id != null` and presentation for the
  remaining sources is address-only. Recorded as a deliberate decision.
- `place_name` read-time enrichment: only on detailed surfaces (customer
  request detail and tracking read, partner job detail). `placeId` present →
  best-effort `PlaceDetailsPort` → ephemeral `place_name` in the response.
  Provider failure → fall back to `formatted_address`. Never block. Lists and
  opportunity feeds are NEVER enriched (no N+1).
- OpenAPI: additive canonical-only changes; base artifact stays byte-frozen.

Shared tracking:

```text
ServiceTrackingSummaryLine / ServiceTrackingSectionItem gain `secondaryValue?`
displayText stays primary-only (backward compatible for existing consumers)
renderer draws primary + muted secondary line
Tow composers:
  explicit place → value = placeName, secondaryValue = formattedAddress
  generic/GPS    → value = formattedAddress, secondaryValue = null
markers        → short single line: placeName ?? formattedAddress ?? 'Origem'/'Destino'
```

---

## 9. Google provider boundary and POI capability

- Endpoint allow-list in the adapter: `places:autocomplete` (POST) and
  `places/{id}` (GET) only. `searchNearby`/`searchText` are explicitly out of
  scope and MUST NOT be reachable through the proxy (they would mint place
  identity for coordinates).
- No end-user PII is sent to Google: only input text, coordinates, token,
  locale.
- `GET /v1/places/{id}?fields=id` (free) is the documented way to refresh stored
  place IDs older than 12 months; obsolete IDs are hard-rejected since
  2025-01-13.
- POI tap: `google_maps_flutter` 2.18.0 (repository baseline, Flutter 3.38.9)
  exposes `PointOfInterestTapEvent` in the platform interface but no installed
  platform emits it; the versions that do require Flutter ≥ 3.41/3.44.
  Therefore `MAP_POI_EXPLICIT_SELECTION=UNSUPPORTED`, a POI tap is handled by
  the generic map-tap rule, and no dependency upgrade is done in Phase 5.
- The device geocoder (`geocoding` package) stays for the generic pin; it is
  not Google Maps Content and cannot mint place identity (`Placemark.name` is
  ignored, as today).

Security:

```text
SERVER_PLACES_KEY            = GOOGLE_PLACES_API_KEY (server only)
MOBILE_MAPS_KEY              = GOOGLE_MAPS_API_KEY (client, --dart-define)
SERVER_KEY_IN_MOBILE         = NO
PRODUCTION_KEY_HARDENING_REQUIRED = YES
```

Production requires distinct keys, Places API (New) + IP application
restrictions, rotation and no key in logs. The current development/validation
key may be temporarily unrestricted; that is debt, not code coupling.

---

## 10. RF reconciliation

| Item | Status |
|---|---|
| RF-003 DeliveryTrackingMap | not restored; future `MotoboyTrackingComposer` consumes Shared Tracking |
| RF-005 | superseded by Backend Proxy Places + ServiceLocation |
| RF-006 | stays superseded by the current GPS/reverse-geocoder implementation |
| RF-007 Saved Addresses | deferred until persistent saved addresses (owner-scoped, stable id, lat/lng required, placeId optional) |

Deferred by decision, not blockers: Nearby Search, confidence model, persistent
Saved Addresses, Motoboy runtime/tracking.

---

## 11. Anti-goals (adversarial review checklist)

```text
GOOGLE_IN_DOMAIN=NO              GOOGLE_TYPES_IN_UI=NO
MOBILE_DIRECT_PLACES=NO          SERVER_KEY_IN_MOBILE=NO
NEARBY_SEARCH=NO                 CONFIDENCE_MODEL=NO
NEAREST_PLACE_WINS=NO            GENERIC_COORDINATE_PLACE_ID=NO
GPS_PLACE_IDENTITY=NO            GEOCODER_PLACE_IDENTITY=NO
COORDINATE_OPERATIONAL_AUTHORITY=YES
TEXT_USED_FOR_ROUTING=NO         PLACE_NAME_PERSISTED=NO
TOW_BACKWARD_COMPATIBLE=YES      MIGRATION_ADDITIVE=YES
SHARED_GOOGLE_SPECIFIC=NO        PAYMENT_CHANGED=NO
SERVICE_CATALOG_CHANGED=NO       CLIENT_VEHICLE_ARCH_CHANGED=NO
```
