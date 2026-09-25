# Tow Android Delivery Closure Plan

**Document version:** 1.0.0  
**Date:** 2026-09-25  
**Status:** VERSIONED BASELINE  
**Scope:** Android Client + Android Partner + Backend/VPS  
**Backend baseline:** `989bb3c02e8a7f438c21368eb5d79b5a4703a446`  
**Mobile baseline:** `cca8cbc05eec88b4015a45876e85c42c746f19a5`

## 1. Purpose

This document defines two distinct delivery milestones for the Tow service:

1. **CLIENT DEMO READY** — a customer can test the complete visible Tow journey using both Android apps against one shared backend environment.
2. **PRODUCTION READY** — the same journey is hardened with production reliability, background notifications, observability, key restrictions and operational safeguards.

The client demo must not be blocked by infrastructure that is not required to demonstrate the complete business journey.

## 2. Frozen demo scope

The demo scope is:

```text
Cliente login
→ select pickup/destination
→ select vehicle
→ select CASH
→ create Tow
→ SEARCHING

Partner login
→ see opportunity
→ submit proposal

Cliente
→ see proposal
→ accept proposal
→ ASSIGNED

Partner
→ EN_ROUTE
→ publish tracking
→ ARRIVED
→ IN_TRANSIT
→ COMPLETED
→ confirm CASH received

Cliente
→ track service
→ see COMPLETED
→ see CASH_RECEIVED
```

Out of demo scope:

```text
PIX
CARD
Stripe
Mercado Pago
PagSeguro
wallet
refunds
settlement/payout
disputes
reviews
no-show
rematch
iOS
saved-address persistence
Nearby Search
```

## 3. Verified current state

### Backend

The accepted Tow MVP already proves:

- request creation;
- partner eligibility;
- TowVehicle and required-document rules;
- geographic opportunity discovery;
- server-side route/pricing authority;
- proposal creation;
- proposal acceptance;
- atomic assignment;
- EN_ROUTE / ARRIVED / IN_TRANSIT / COMPLETED;
- current tracking;
- cancellation;
- CASH materialization;
- idempotent `cash-received`;
- payment recovery.

The backend readiness suite has a full happy-path proof through CASH.

### Mobile

The real application widgets, controllers, repositories and HTTP adapters have already passed an app-level end-to-end Tow run against a real disposable backend/PostgreSQL environment.

Verified UI-driven flow includes:

- real Client login transport;
- real Partner login transport;
- Client request creation;
- Partner opportunity;
- Partner proposal;
- Client proposal acceptance through the production CTA;
- assignment recovery on both sides;
- Partner operational milestones;
- Partner GPS tracking publication;
- Client tracking read;
- completion;
- Partner CASH confirmation through the production screen;
- final recovery of COMPLETED + CASH_RECEIVED.

Debug APK builds for Client and Partner were green at acceptance.

### ServiceLocation / Places

Phase 5 is complete:

- Backend-proxy Autocomplete;
- Backend-proxy Place Details;
- Client search UI;
- GPS and map-pin flows;
- Tow adoption;
- place identity when explicitly selected;
- address/name presentation and fallback.

## 4. CLIENT DEMO READY gate

The client demo does **not** require FCM, Redis hardening or production-grade background delivery.

It requires:

### D1 — Shared backend environment

- deploy the current compatible Backend main to the VPS;
- run all current migrations;
- enable the Tow service;
- configure the route provider required for opportunity pricing;
- configure ServiceLocation / Places;
- verify HTTPS and public API reachability.

### D2 — Deterministic demo identities

Provision one known demo customer and one known demo Tow partner.

The partner must already have:

- partner account with Tow capability;
- active TowVehicle;
- approved required TowVehicle documents;
- compatible vehicle class;
- `is_online = true`;
- `is_available = true`;
- valid latitude/longitude inside the matching radius.

The customer must have:

- valid account;
- a vehicle usable by the Tow request flow.

No credential is stored in this document or committed to git.

### D3 — Android build configuration

Build both apps against the demo VPS:

- Client package: `br.com.jaresolve.client`;
- Partner package: `br.com.jaresolve.partner`;
- correct backend base URL;
- Android Maps key/config;
- location permission;
- network permission;
- production/demo configuration without local fake repositories.

FCM is optional for this milestone.

### D3.1 — Known Android packaging gaps

Current Mobile main still declares:

```text
Client applicationId  = com.socorre.socorre_client
Partner applicationId = com.socorre.socorre_partner
```

The intended Firebase registrations are:

```text
Client  = br.com.jaresolve.client
Partner = br.com.jaresolve.partner
```

For the fastest demo, Firebase/FCM can remain out of scope and the current IDs may still be used.
For a near-final test package, align the Android `applicationId` values before distribution so the installed
apps match the already-registered Firebase apps.

Also verify the merged **release** Android manifest contains `android.permission.INTERNET`. The source tree
currently declares it explicitly in debug/profile manifests, while the main manifests do not. A debug APK is
therefore the lowest-risk immediate demo artifact; a release APK must pass a real network smoke test before it
is handed to the client.

### D4 — Foreground synchronization

For the demo, REST remains canonical.

Existing refresh/recovery controls are acceptable. If Socket.IO does not provide every cross-app state invalidation in the VPS runtime, the demo may use foreground REST reconciliation/manual refresh rather than delaying delivery for FCM.

No local fake state machine may replace backend truth.

### D5 — Physical-device rehearsal

Run the exact client-facing script on two Android devices:

```text
Client login
Partner login

Client creates Tow
Partner sees opportunity
Partner proposes
Client sees proposal
Client accepts
Partner sees assignment
Partner EN_ROUTE
Client sees status/tracking
Partner ARRIVED
Partner IN_TRANSIT
Partner COMPLETED
Partner confirms CASH
Client sees COMPLETED + CASH_RECEIVED
```

Repeat once after force-closing/reopening both apps to confirm recovery.

### D6 — Distribution artifact

Produce installable Android artifacts for the client demo:

- Client APK/AAB;
- Partner APK/AAB;
- versionName/versionCode incremented;
- release notes identifying this as a demo/test build;
- no secrets embedded beyond normal client-side Android configuration.

## 5. CLIENT DEMO READY definition

The milestone is reached when:

```text
[ ] Backend demo environment is reachable
[ ] Current migrations are applied
[ ] Tow module is enabled
[ ] Route provider works
[ ] Places search works
[ ] Demo customer can login
[ ] Demo partner can login
[ ] Partner is operational/eligible
[ ] Client creates Tow from production UI
[ ] Partner sees the opportunity
[ ] Partner submits proposal
[ ] Client accepts proposal
[ ] Both sides see the same assignment/price
[ ] Partner progresses EN_ROUTE
[ ] Tracking reaches Client
[ ] Partner progresses ARRIVED
[ ] Partner progresses IN_TRANSIT
[ ] Partner completes
[ ] Partner confirms CASH
[ ] Client sees COMPLETED + CASH_RECEIVED
[ ] Client restart recovers canonical state
[ ] Partner restart recovers canonical state
[ ] Client Android artifact installs
[ ] Partner Android artifact installs
```

When all are green:

```text
TOW ANDROID CLIENT DEMO READY
```

## 6. Production closure after the demo

The following remain production-readiness work and do not block the demo milestone:

- Firebase Admin runtime integration;
- FCM token lifecycle and background notifications;
- Redis/realtime reliability hardening;
- partner heartbeat hardening;
- complete state invalidation/event coverage;
- observability and operational dashboards;
- invalid FCM token cleanup;
- production Google key restriction/rotation;
- deployment rollback/runbook validation;
- production backup/restore checks;
- final release signing and store distribution;
- remaining security remediation explicitly deferred by existing project evidence.

## 7. Production target

After the demo, the target remains:

```text
TOW CASH ANDROID = 100% DELIVERED
```

with realtime/background delivery and production operational hardening completed without changing the canonical Tow business flow proven by the demo.
