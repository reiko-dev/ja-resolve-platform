# TOW Real-Time Reliability & Presence — Implementation Plan

Status: **PROPOSED / EXECUTION BRANCH OPEN**  
Scope: **Backend first**  
Base: `workhorse/tow-routes-payment-background-tracking @ 4a3bd32a4018fe69d38e6c4193b9981593b6d499`

## 1. Objective

Strengthen the Tow runtime for real-world network conditions without changing the already accepted Tow business flow.

This phase focuses on:

- partner live presence / heartbeat;
- tracking freshness;
- realtime invalidation of open opportunities;
- background push notifications;
- Redis-backed ephemeral state;
- observability and failure semantics;
- future horizontal Socket.IO scaling.

It does **not** replace PostgreSQL or REST as canonical truth.

## 2. Architectural decisions

### 2.1 Canonical responsibilities

```text
PostgreSQL
  durable business truth

REST
  canonical read/write recovery path

Redis
  ephemeral presence, TTL, versions, realtime coordination

Socket.IO
  foreground fast-path / invalidation

Firebase Cloud Messaging
  background / app-closed notification and wake-up

Google Maps + Routes
  map and route geometry
```

### 2.2 Explicit non-decisions

We will **not** use Firestore or Firebase Realtime Database as a second Tow source of truth.

We will **not** stream canonical Tow state solely through Socket.IO.

We will **not** use FCM for continuous GPS transport.

We will **not** make live-presence mandatory for matching in the first backend rollout.

## 3. Domain separation

Three distinct concerns must remain separate:

### A. Partner availability intent

Answers:

> Does the Partner want to receive work?

Current examples:

- `is_online`
- `is_available`

These remain business intent/state.

### B. Partner live presence

Answers:

> Has this Partner actually contacted the platform recently?

This is an ephemeral lease backed by Redis.

### C. Active-job tracking

Answers:

> What is the latest valid location observation for this assigned service?

This remains request/job-scoped tracking.

Presence and tracking are related but are **not the same concept**.

## 4. High-level runtime

```text
Partner App
   |
   | heartbeat
   v
Backend ----------------------> Redis
   |                              |
   |                              | TTL / live presence
   |
   | tracking observation
   v
PostgreSQL  <---- canonical ---- REST
   |
   +---- Socket.IO invalidation ----> Client / Partner foreground
   |
   +---- FCM -----------------------> background / closed app
```

## 5. Configuration

Add typed configuration with validation.

Initial defaults:

```text
REALTIME_REDIS_ENABLED=true|false
REDIS_URL=redis://127.0.0.1:6379

PARTNER_PRESENCE_ENABLED=true|false
PARTNER_HEARTBEAT_INTERVAL_SECONDS=20
PARTNER_PRESENCE_STALE_AFTER_SECONDS=40
PARTNER_PRESENCE_TTL_SECONDS=60

TOW_TRACKING_FRESH_AFTER_SECONDS=20
TOW_TRACKING_STALE_AFTER_SECONDS=60

TOW_REALTIME_OPPORTUNITY_INVALIDATION_ENABLED=true|false

FCM_ENABLED=true|false

TOW_REQUIRE_LIVE_PRESENCE=false
```

Validation invariants:

- stale threshold > expected heartbeat interval;
- TTL > stale threshold;
- tracking stale threshold > fresh threshold;
- invalid combinations fail fast at startup when a feature explicitly requires Redis.

## 6. Redis infrastructure

### 6.1 Deployment

Initial target:

- Redis on the same Hostinger VPS;
- bind to loopback/private interface only;
- do not expose port 6379 publicly;
- persistence is not required for presence correctness;
- protected by VPS firewall and OS-level access.

### 6.2 Backend adapter

Introduce an infrastructure abstraction, e.g.:

```text
EphemeralStore
├── get
├── setWithTtl
├── delete
├── increment
├── ttl
└── health
```

The Tow/domain layer must not depend directly on a Redis client library.

### 6.3 Failure semantics

While `TOW_REQUIRE_LIVE_PRESENCE=false`:

- Redis outage must **not** stop create/proposal/assignment/tracking lifecycle;
- presence becomes `UNKNOWN`;
- Socket/FCM/REST recovery still operate where possible;
- health reports Redis degradation.

When live presence becomes a mandatory eligibility gate in a later rollout:

- Redis becomes a required dependency for **new-work eligibility** only;
- already-created/assigned work must still drain to completion.

## 7. Partner presence lease

### 7.1 Endpoint

Add an authenticated Partner endpoint:

```http
POST /api/partners/me/presence/heartbeat
```

Initial request body should remain minimal:

```json
{
  "session_id": "optional-client-session-id",
  "app_state": "foreground"
}
```

Do not trust client timestamps as authority.

Response:

```json
{
  "presence": "ONLINE",
  "server_time": "2026-09-24T00:00:00Z",
  "expires_at": "2026-09-24T00:01:00Z",
  "lease_ttl_seconds": 60
}
```

### 7.2 Key

```text
presence:partner:{partnerId}
```

Stored value can include:

- partner_id;
- session_id;
- app_state;
- server_received_at.

TTL: 60 seconds initially.

### 7.3 Presence projection

Backend derives:

```text
ONLINE   age < 40s
STALE    40s <= age < 60s
OFFLINE  lease absent/expired
UNKNOWN  Redis unavailable / cannot evaluate
```

Do not persist `ONLINE` as canonical truth in PostgreSQL.

### 7.4 Diagnostic last-seen

If a durable diagnostic timestamp is needed, add a throttled `last_presence_at` projection in PostgreSQL.

Rules:

- never use it as live eligibility truth;
- do not write every heartbeat;
- update on first heartbeat after absence and at a conservative throttle interval.

This is optional in the first code slice if current observability is sufficient.

## 8. Tracking freshness

### 8.1 Existing tracking remains canonical

Do not replace the current tracking lifecycle.

The Partner continues to send real GPS observations only while the Tow job is tracking-eligible.

### 8.2 Required tracking metadata

Ensure each accepted observation has or derives:

- request_id;
- observed_at;
- server_received_at;
- latitude;
- longitude;
- accuracy when available;
- heading when available;
- speed when available;
- client sequence/idempotency marker where supported.

Server receive time is authoritative for freshness calculations when client time is absent or unsafe.

### 8.3 Freshness projection

Expose a presentation-safe projection:

```text
FRESH
STALE
LOST
```

Initial thresholds:

```text
FRESH  age < 20s
STALE  20s <= age < 60s
LOST   age >= 60s or no valid current observation
```

The response should be able to expose:

```json
{
  "freshness": "STALE",
  "age_seconds": 37,
  "last_observation_at": "..."
}
```

### 8.4 Redis latest projection

Optional but recommended:

```text
tracking:tow:{requestId}:latest
```

This is an ephemeral acceleration/cache only.

PostgreSQL remains canonical.

If Redis disagrees with PostgreSQL after recovery, PostgreSQL wins.

## 9. Opportunity realtime invalidation

### 9.1 Principle

Socket.IO carries:

> Something changed.

REST answers:

> What is true now?

### 9.2 Event

Introduce a domain-specific event:

```text
tow_opportunities_changed
```

Payload:

```json
{
  "version": 143,
  "reason": "request_created",
  "request_id": "2",
  "occurred_at": "..."
}
```

No complete opportunity object is required in the event.

### 9.3 Version

Redis key:

```text
realtime:tow:opportunities:version
```

Increment atomically when the opportunity universe materially changes.

Reasons include at minimum:

- request_created;
- request_cancelled;
- proposal_created/withdrawn when it changes current Partner presentation;
- assignment_created;
- request_completed;
- request no longer discoverable.

### 9.4 Room strategy

Initial scale:

```text
room: tow:partners
```

Broadcast invalidation to connected Tow Partners.

Do not prematurely implement geographic room partitioning.

Future scale may move to:

- geohash rooms;
- regional partitions;
- direct partner targeting.

### 9.5 Backward compatibility

Existing `emergency_updated` behavior must not be broken abruptly.

During migration:

- emit/consume the Tow-specific event for new clients;
- preserve the legacy event path where still required;
- remove only after mobile cutover evidence exists.

## 10. Client tracking invalidation

For assigned services, keep the existing request-scoped Socket.IO room:

```text
join_tow_request { requestId }
```

Tracking events remain acceleration signals.

The Client must always be able to recover current state through REST.

No business state may exist only inside a socket room.

## 11. FCM foundation

### 11.1 Purpose

Use FCM for:

- app in background;
- app process closed;
- reconnect/wake-up path;
- user-visible important events.

Do not use it for continuous location streaming.

### 11.2 Device registration

First audit existing Firebase/device-token infrastructure.

If no suitable canonical model exists, add a generic registration model, not Tow-specific.

Conceptual fields:

```text
push_device_registrations
├── id
├── user_id
├── actor_type
├── actor_id
├── platform
├── token
├── created_at
├── last_seen_at
└── revoked_at
```

Support multiple devices per account.

### 11.3 Endpoints

Conceptually:

```http
PUT    /api/push/devices/current
DELETE /api/push/devices/current
```

Final path should follow existing API conventions after repository audit.

### 11.4 Initial notification events

Partner:

- new eligible Tow opportunity;
- assignment accepted;
- request cancelled by Client.

Client:

- proposal available;
- Partner assigned;
- important service-state transition if user-visible;
- Partner cancellation.

Push payload contains identifiers and routing hints, not canonical full state.

On open/resume:

```text
FCM
→ app wakes
→ REST canonical refresh
```

### 11.5 Firebase failure

FCM send failure:

- never rolls back a committed business transaction;
- is logged/observed;
- invalid tokens are revoked when Firebase explicitly reports them invalid.

## 12. Socket.IO + Redis scaling path

Current single-instance PM2 runtime does not require a Redis Socket.IO adapter for correctness.

However, this PR should keep the architecture ready for:

```text
API A ─┐
       ├─ Redis Pub/Sub ─ Socket.IO adapter
API B ─┘
```

Do not enable horizontal scaling until:

- more than one realtime API instance exists;
- sticky-session / transport strategy is verified;
- adapter behavior is integration-tested.

The Redis abstraction must not force this activation prematurely.

## 13. Matching and live presence rollout

### Phase A — observation only

Initial backend rollout:

```text
TOW_REQUIRE_LIVE_PRESENCE=false
```

Presence is recorded and observable but does not change matching eligibility.

Purpose:

- prove heartbeat stability;
- observe real mobile background behavior;
- tune TTL/thresholds;
- avoid making all current Partners disappear before mobile rollout.

### Phase B — mobile integrated

After Client/Partner mobile heartbeat support is deployed and verified:

- opportunities may require live presence;
- new proposal eligibility may revalidate live presence;
- exact action-time assignment semantics must be reviewed before enabling hard rejection.

Do **not** silently make heartbeat mandatory in this backend-only phase.

### Phase C — hard gate

Only after operational evidence:

```text
TOW_REQUIRE_LIVE_PRESENCE=true
```

Candidate new-work eligibility:

- approved;
- available;
- online intent;
- valid live presence lease;
- valid TowVehicle/documents;
- inside frozen matching radius.

Assigned/in-flight work is never killed because presence expires.

If tracking disappears during an active job:

- job remains valid;
- tracking freshness becomes STALE/LOST;
- UI can surface loss of live position.

## 14. Hostinger deployment topology

Initial validation topology:

```text
Hostinger VPS
├── Nginx / TLS
├── Node backend / PM2
├── PostgreSQL
└── Redis (private only)
```

Rules:

- Redis bind private/loopback;
- firewall blocks external 6379;
- secrets only in validation/prod env files;
- no Redis credentials committed;
- PM2 process uses env explicitly;
- Redis restart must not corrupt PostgreSQL state.

## 15. Health and observability

### 15.1 Health

Extend health detail with Redis status.

Conceptually:

```json
{
  "http": "ok",
  "postgres": "ok",
  "redis": "ok"
}
```

If Redis-backed features are optional:

- return service health without pretending Redis is healthy;
- expose `degraded` detail.

If a feature configured as required cannot initialize:

- fail fast at startup or report unhealthy according to current health conventions.

### 15.2 Structured runtime events

Emit structured logs for:

```text
partner_presence_heartbeat_received
partner_presence_stale
partner_presence_expired
tow_tracking_freshness_changed
tow_opportunities_invalidated
socket_invalidation_emitted
fcm_send_success
fcm_send_failure
redis_unavailable
redis_recovered
```

Never log:

- FCM token;
- auth token;
- Redis password;
- precise location unnecessarily outside existing secure tracking logs.

### 15.3 Useful counters

Prepare counters/metrics abstraction for:

- connected Partner sockets;
- live Partner leases;
- heartbeat rate;
- heartbeat failures;
- latest tracking age;
- STALE/LOST active jobs;
- opportunity invalidations;
- FCM successes/failures;
- Redis errors.

A full Prometheus stack is not required for the first slice.

## 16. Security

- heartbeat requires authenticated Partner identity;
- Partner cannot heartbeat another Partner id;
- apply conservative rate limiting;
- ignore arbitrary client claims of `ONLINE`;
- server receive time is authoritative;
- Redis is not publicly reachable;
- push registration belongs to authenticated user/device;
- FCM tokens are treated as secrets;
- tracking authorization remains request/viewer scoped;
- no location is placed in generic opportunity broadcast payloads unless already authorized.

## 17. Idempotency and ordering

### Heartbeat

Heartbeat is naturally idempotent lease renewal.

### Tracking

Preserve existing idempotency behavior and add monotonic/client-sequence protection only if current tracking accepts out-of-order observations.

Do not regress older valid clients.

### Socket invalidation

Events can be duplicated.

Clients use:

- `version`;
- REST refetch;
- current canonical state.

Never require exactly-once delivery.

## 18. Backend implementation roadmap

### RT-00 — Current-state audit

Deliver:

- map current Socket.IO wiring;
- map tracking persistence;
- map partner availability/location routes;
- map Firebase Admin/device-token infrastructure;
- confirm runtime process topology;
- confirm current health composition.

No functional changes.

### RT-01 — Redis foundation

Deliver:

- Redis client adapter;
- typed configuration;
- connection lifecycle;
- health integration;
- private Hostinger Redis deployment/runbook;
- deterministic fake/in-memory adapter for tests.

Gate:

- Redis can fail without corrupting Tow;
- current Tow flow remains green.

### RT-02 — Partner presence

Deliver:

- heartbeat endpoint;
- lease service;
- presence projection ONLINE/STALE/OFFLINE/UNKNOWN;
- rate limit;
- structured logs;
- no matching gate yet.

Gate:

- authenticated Partner renews lease;
- expiry is deterministic;
- another Partner cannot mutate it;
- Redis outage degrades honestly.

### RT-03 — Tracking freshness

Deliver:

- freshness calculation;
- response projection with age/freshness;
- optional Redis latest cache;
- no fake movement/interpolation.

Gate:

- FRESH/STALE/LOST boundaries deterministic;
- persisted tracking still canonical;
- Redis loss falls back to canonical read.

### RT-04 — Opportunity invalidation

Deliver:

- version counter;
- `tow_opportunities_changed`;
- Tow Partner room;
- emission from relevant committed state transitions;
- REST remains canonical.

Gate:

- one transition commits first, then invalidation emits;
- duplicate event is harmless;
- socket loss followed by REST refresh recovers.

### RT-05 — Push foundation / FCM

Deliver:

- audit/reuse current Firebase Admin integration;
- device registration if missing;
- notification service abstraction;
- initial Tow event notifications;
- invalid-token cleanup.

Gate:

- business transaction never rolls back because push failed;
- no secret/token logging.

### RT-06 — Observability and operational hardening

Deliver:

- health/readiness rules;
- structured logs;
- key counters;
- deploy/runbook updates;
- incident/recovery notes.

### RT-07 — Mobile integration checkpoint

No backend hard-gate yet.

Collect evidence:

- heartbeat survives foreground/background reality;
- presence TTL works;
- tracking freshness useful in map UI;
- socket invalidation reduces stale opportunity lists;
- FCM wake-up works.

### RT-08 — Optional live-presence eligibility

Separate explicit dispatch after evidence.

Only then consider:

```text
TOW_REQUIRE_LIVE_PRESENCE=true
```

This must be a separate reviewable change.

## 19. Test strategy

Keep this phase focused and deterministic.

Per slice:

- unit tests for pure thresholds/config;
- API auth tests for heartbeat/device registration;
- Redis adapter integration tests;
- Socket.IO event tests;
- tracking freshness boundary tests;
- targeted PostgreSQL integration where persistence changes;
- no destructive validation-db smoke unless explicitly needed.

Do not require a full regression suite for every RT slice.

Before final merge of the complete realtime PR:

- run directly affected Tow suites;
- run contract/OpenAPI validation;
- run one focused real validation on VPS;
- preserve existing request data unless a disposable fixture is explicitly created.

## 20. Deployment strategy

Each RT slice should be deployable independently.

Recommended sequence:

```text
RT-01 Redis
→ RT-02 Presence observational
→ RT-03 Tracking freshness
→ RT-04 Opportunity invalidation
→ RT-05 FCM
→ RT-06 Observability
→ mobile integration
→ RT-08 optional presence gate
```

Feature flags/defaults must permit rollback without database rollback where possible.

## 21. Acceptance criteria

Backend phase is considered ready for mobile integration when:

- Redis is private and healthy in validation;
- heartbeat endpoint works and expires predictably;
- presence does not yet break current matching;
- tracking exposes freshness/age;
- open opportunities invalidate via socket and recover via REST;
- FCM foundation can notify background devices;
- Redis/FCM failures do not corrupt Tow state;
- existing assigned work drains normally;
- current Tow request/proposal/assignment/tracking/payment flow remains intact;
- configuration and Hostinger runbooks are documented.

## 22. Deferred items

Explicitly deferred:

- geohash/region Socket rooms;
- Redis Cluster/Sentinel;
- managed Redis;
- multi-instance backend activation;
- hard presence eligibility;
- advanced notification preference center;
- guaranteed delivery queue/outbox for every push event;
- Firestore/Realtime Database runtime;
- continuous GPS via FCM;
- Motoboy implementation.

The architecture must remain reusable by Motoboy and other location-based services.

## 23. PR execution policy

This PR is the execution container for the realtime reliability backend work.

Rules:

- keep commits scoped by RT slice;
- update this document as implementation evidence changes;
- record migrations/config/env changes explicitly;
- never commit credentials;
- do not merge until the selected backend slices for this release are completed and validated;
- mobile integration can proceed against stable additive contracts before the optional live-presence gate is enabled.
