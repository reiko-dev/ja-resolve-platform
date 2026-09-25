# Tow Client Demo — Backend/VPS Runbook

**Scope:** Backend/VPS only. Companion of
`docs/tow/TOW-ANDROID-DELIVERY-CLOSURE.md` (PR #51).
**Milestone:** CLIENT DEMO READY — Android Client + Android Partner against one
shared backend/database.

This runbook describes the deterministic demo environment and the commands that
prepare, verify and reset it. It never stores credentials; every value is read
from the VPS environment.

## 1. Environment topology

| Item | Value |
| --- | --- |
| Public API | `https://2-25-216-183.sslip.io` |
| Backend path | `/var/www/socorre-ai/staging/backend` |
| Git checkout (deploy source) | `/var/www/socorre-ai/repository` |
| Process manager | PM2 (`socorre-ai-homolog-backend`, port `3001`) |
| Reverse proxy | Nginx (`/etc/nginx/sites-enabled/socorre-ai-homolog`) |
| Database | PostgreSQL 16 (`socorre_ai_tow_demo`, owner `socorre_homolog`) |
| Backend env | `/var/www/socorre-ai/shared/backend.env` (mode 0600, symlinked as `staging/backend/.env`) |
| Demo credentials env | `/var/www/socorre-ai/shared/demo-tow.env` (mode 0600, **not in git**) |
| Firebase Admin | `/var/www/socorre-ai/shared/secrets/firebase-admin.json` (mode 0600, outside the repo) |
| Deploy procedure | `scripts/homolog/deploy-homolog.sh` (fetch → backup → rsync → npm ci → migrations → PM2 reload → health) |

The Tow demo runs on a dedicated **clean-baseline** database
(`socorre_ai_tow_demo`) created from `socorre_ai_backend/database/migrations`
(001–012). The previous homolog database is preserved (dump in
`/var/www/socorre-ai/releases/`) and untouched.

## 2. Required environment (names only)

`shared/backend.env` must contain, in addition to the existing database/JWT
configuration:

```text
TOW_ROUTE_PROVIDER=google
GOOGLE_ROUTES_API_KEY=<current services/maps key>
SERVICE_LOCATION_PLACES=google
GOOGLE_PLACES_API_KEY=<current services/maps key>
TOW_ADDRESS_RESOLVER=google
GOOGLE_GEOCODING_API_KEY=<current services/maps key>
TOW_PAYMENT_MODE=cash
```

* `TOW_PAYMENT_MODE` is `cash` by default; setting it explicitly documents that
  the demo uses the canonical CASH flow (no PSP, no mock).
* The three Google keys are the SAME key already used by the services/maps in
  this environment, authorized for the demo.

**Debt (post-demo):**

```text
PRODUCTION_KEY_HARDENING_REQUIRED=YES
```

* split Maps / Routes / Places / Geocoding keys;
* restrict each API to the key that needs it;
* restrict by IP / package / SHA according to key type;
* rotate if the shared key was ever exposed client-side.

FCM is **not** required for the demo. The Firebase Admin file is only validated
for lifecycle hygiene (existence, `deploy:deploy` ownership, mode 0600, outside
the repository and outside deploy artifacts). Push lifecycle hardening is a
post-demo milestone.

## 3. Prepare / repeat the demonstration

All commands run inside `/var/www/socorre-ai/staging/backend` as `deploy`.

```bash
set -a; source /var/www/socorre-ai/shared/backend.env; set +a
set -a; source /var/www/socorre-ai/shared/demo-tow.env; set +a   # TOW_DEMO_PASSWORD only
```

### 3.1 Seed the deterministic cast

```bash
TOW_DEMO_ENV=demo TOW_DEMO_SEED=1 npm run demo:tow:seed
```

Creates/restores exactly:

* customer `cliente.demo@jaresolve.com.br` (role `user`);
* partner `parceiro.demo@jaresolve.com.br` (role `partner`, type `tow`,
  approved, `is_online=true`, `is_available=true`, valid coordinates in São
  Paulo, inside the matching radius);
* one active `TowVehicle` (`DEM1A23`) covering `light_vehicle`;
* one approved, non-expired `vehicle_license` document;
* the canonical `tow` module row enabled/ACTIVE.

The command is idempotent and refuses any database that is not an explicit
`_demo` target (see §5). It never prints the password.

### 3.2 Readiness report (read-only)

```bash
TOW_DEMO_ENV=demo npm run demo:tow:status
```

Prints `DEMO_CUSTOMER_READY`, `DEMO_PARTNER_ONLINE`, `DEMO_PARTNER_AVAILABLE`,
`DEMO_PARTNER_LOCATION_READY`, `DEMO_TOW_VEHICLE_READY`,
`DEMO_DOCUMENTS_APPROVED` and `TOW_MODULE_STATUS`. Ends with
`DEMO_STATUS=READY` (exit 0) or `DEMO_STATUS=NOT_READY` (exit 1).

### 3.3 Reset between demonstrations

```bash
TOW_DEMO_ENV=demo TOW_DEMO_RESET_SESSION=1 npm run demo:tow:reset-session
```

Removes only the demo accounts' Tow data (requests, proposals, assignments,
tracking, payments), restores the partner operational state and leaves the
module enabled. It never deletes users, never touches another account and never
drops/truncates a table. Use it before each presentation to guarantee a clean
`SEARCHING` start.

## 4. Real HTTP smoke against the running backend

With the backend up (locally or from the VPS):

```bash
set -a; source /var/www/socorre-ai/shared/demo-tow.env; set +a
TOW_DEMO_BASE_URL=https://2-25-216-183.sslip.io npm run demo:tow:smoke
```

The smoke drives the full cross-app journey with real HTTP and prints one
`<NAME>_SMOKE=PASS` per step: health, module status, Socket.IO handshake, both
logins, Places Autocomplete + Details, request creation (idempotent replay),
route polyline, partner opportunity, proposal, proposal list, accept,
assignment recovery, tracking write/read, EN_ROUTE, ARRIVED, IN_TRANSIT,
finish/COMPLETED, cash-received (idempotent retry), payment read and the final
customer recovery (`COMPLETED` + `CASH_RECEIVED`). It ends with `SMOKE=PASS`.

The smoke leaves the completed request in the demo database; run
`demo:tow:reset-session` to start a clean demonstration.

## 5. Safety rules of the demo tooling

The demo commands are fail-closed. They refuse to run unless ALL of the
following hold:

1. `TOW_DEMO_ENV=demo` (explicit human statement);
2. the per-command opt-in (`TOW_DEMO_SEED=1` / `TOW_DEMO_RESET_SESSION=1`);
3. explicit `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` with no
   `DATABASE_URL`/`PostgreSQL`;
4. loopback host and non-privileged user;
5. database name ending in `_demo`, with no `prod`/`production`/`live`/`vps`/
   `homolog`/`staging`/`main`/`master` hint.

`TOW_DEMO_PASSWORD` is mandatory and has no default; it must come from
`shared/demo-tow.env` (mode 0600, outside the repository). There is no
`db:reset` and no destructive fallback anywhere in these commands.

## 6. Out of scope for the demo

Stripe, PIX, CARD, Mercado Pago, PagSeguro, wallet, settlement, payout, refund,
FCM/APNs lifecycle, iOS, Nearby Search, saved addresses and realtime hardening.
REST is the authority: if a realtime event is missed, a `GET`/refetch recovers
the canonical state.
