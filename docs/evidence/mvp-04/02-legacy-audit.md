# MVP-04 — 02 Legacy Proposal Subsystem Audit

> Delivery: MVP-04 Proposal Lifecycle & Atomic Assignment (Issue #16)
> Purpose: establish the **legacy boundary** before writing canonical MVP-04 code.
> Rule: the legacy subsystem is an **audit and regression input only**. It is
> never an authority, never a dependency, and never a migration source.

---

## 1. What the legacy subsystem is

| Artifact | Size | Role |
|---|---|---|
| `src/models/TowProposal.js` | 417 lines | Knex model over the legacy `tow_proposals` table |
| `src/services/TowProposalService.js` | 618 lines | business logic (create/accept/reject/withdraw/expire/stats) |
| `src/controllers/TowProposalController.js` | 363 lines | HTTP layer |
| `src/routes/towProposals.js` | 45 lines | Express router, mounted at `/api/tow-proposals` in `src/app.js:144` |
| `database/migrations-legacy/025_create_tow_proposals_table.js` | 49 lines | creates `tow_proposals` |
| `database/migrations-legacy/044_prevent_duplicate_pending_tow_proposals.js` | 21 lines | partial unique index `(emergency_request_id, partner_id) WHERE status='pending'` |
| `tests/integration/towProposals.test.js`, `tests/tow/g3TowProposals.test.js`, `tests/tow/towProposalIdempotency.test.js`, `tests/unit/TowProposal*.test.js` | — | legacy regression suite (must stay green) |

`database/migrations-legacy/**` is **not** part of the canonical migration
directory (`database/migrations/`), so `005_mvp04_*` does not interact with it.

---

## 2. Legacy schema (migration 025)

```text
tow_proposals
  id                     increments PK
  emergency_request_id   integer → emergency_requests(id)  CASCADE   ← legacy aggregate
  partner_id             integer → partners(id)            CASCADE
  proposed_price         decimal(10,2)  NOT NULL          ← CLIENT-SUPPLIED
  estimated_time_minutes integer       NOT NULL
  message                text
  tow_truck_type         string                            ← denormalized partner text
  tow_capacity_kg        integer
  has_winch              boolean default false
  equipment_details      string
  status                 enum('pending','accepted','rejected','expired','withdrawn')
  expires_at             timestamp NOT NULL
  accepted_at            timestamp
  responded_at           timestamp
  view_count             integer default 0
  last_viewed_at         timestamp
  partner_distance_km    decimal(5,2)                      ← haversine, not route
  partner_eta_minutes    integer
  created_at / updated_at
```

Indexes: `emergency_request_id`, `partner_id`, `status`, `expires_at`,
`created_at`, `(emergency_request_id, status)`, plus the migration-044 partial
unique index on `(emergency_request_id, partner_id) WHERE status='pending'`.

---

## 3. Conflict register — why none of this is reusable

| # | Legacy behaviour | Canonical MVP-04 requirement | Verdict |
|---|---|---|---|
| L1 | Aggregate is `emergency_requests` (`type='other'`, `request_type='tow'`) | Aggregate is `tow_requests` (MVP-03) | **INCOMPATIBLE** — different aggregate, different lifecycle |
| L2 | `proposed_price` is accepted from the caller (`Number(proposalData.proposed_price)`, service line 40) | Price is **server-calculated** from the authoritative route quote + frozen tariff | **CONTRADICTS** `TOW-PROP-003` |
| L3 | Money is `decimal(10,2)` floats | Integer cents (`final_price_cents`), currency `BRL` | **CONTRADICTS** the pricing contract |
| L4 | `partner_distance_km` from a haversine/`Math.acos` SQL expression (model lines 68-72) | Distance is the Google Routes leg sum only; straight-line distance is banned module-wide | **CONTRADICTS** the distance contract |
| L5 | Status vocabulary `pending/accepted/rejected/expired/withdrawn` | Canonical `ACTIVE/COUNTERED/ACCEPTED/REJECTED/WITHDRAWN/EXPIRED/CLOSED` | **CONTRADICTS** `TowProposalStatus` |
| L6 | `acceptProposal` delegates to `EmergencyRequest.acceptProposal` — no explicit transaction, no row lock, no loser closure | One PostgreSQL transaction, row locks, exactly one winner, remaining `ACTIVE` → `CLOSED` | **INSUFFICIENT** for `TOW-ASSIGN-003/004/005` |
| L7 | No `tow_assignments` table; "assignment" is an emergency-request side effect | Dedicated `tow_assignments` row with `UNIQUE(tow_request_id)` and `UNIQUE(proposal_id)` | **MISSING** |
| L8 | `expires_at` is a stored timestamp only; nothing prevents accepting a row whose time passed while a concurrent reader held it | Action-time expiry evaluated **inside** the accepting transaction | **INSUFFICIENT** for `TOW-PROP-004/005` |
| L9 | Vehicle/tariff/route snapshots are not stored (`tow_truck_type`/`tow_capacity_kg` are live-ish denormalized text) | Proposal freezes vehicle + tariff + route + distance + price | **MISSING** `TOW-PROP-008`, `TOW-VEHICLE-009/010` |
| L10 | Duplicate policy is `(emergency_request_id, partner_id) WHERE status='pending'` via a raw partial index in a later migration | One ACTIVE proposal per `(tow_request_id, partner_id)`, enforced at creation with a stable `proposal_already_active` conflict | **PARTIALLY COMPARABLE** — same idea, canonical enforcement + code |
| L11 | No module gate | `service_module_disabled` blocks new proposals (`TOW-PROP-009`, `TOW-MODULE-005`) | **MISSING** |
| L12 | No idempotency contract on create | `Idempotency-Key` + DB unique constraint + fingerprint comparison | **MISSING** |
| L13 | Notification side effects (`NotificationService.sendNotification`) | Out of MVP-04 scope | **OUT OF SCOPE** |

---

## 4. What MVP-04 deliberately borrows from the legacy design (idea-level only)

Only one idea survives, and it survives **because the business rule matrix
already states it** (`TOW-PROP-001`): a partner may not hold two live proposals
for the same request. The legacy implementation expressed that as a partial
unique index; MVP-04 expresses it as a partial unique index on the canonical
table:

```sql
CREATE UNIQUE INDEX tow_request_proposals_active_per_partner_unique
  ON tow_request_proposals (tow_request_id, partner_id)
  WHERE status = 'ACTIVE';
```

No legacy SQL, column name, enum value, model or service is imported. The
canonical module never references the legacy table: `tests/tow/mvp03/
towMvp03Architecture.test.js` proves that no `'tow_proposals'` /
`'emergency_requests'` string literal exists in any Tow source file, and
MVP-04 keeps that assertion true (the canonical table is
`tow_request_proposals`, which does not match the banned literal).

---

## 5. Coexistence decision

* The legacy router stays mounted at `/api/tow-proposals` (legacy consumers).
* The canonical routes live under `/api/tow/...` (MVP-01 convention).
* **No path collides**: `/api/tow-proposals/:id/accept` (legacy) vs
  `/api/tow/proposals/:proposalId/accept` (canonical). Different path segments,
  different auth middleware, different tables.
* MVP-04 does not deprecate, modify, migrate or delete any legacy artifact. A
  later delivery may retire the legacy flow; doing it here would expand scope and
  risk the legacy regression suite.

---

## 6. Known legacy defects carried forward as *evidence*, not as code

These were observed while auditing and are recorded so they cannot resurface in
the canonical module:

1. `src/services/TowProposalService.js` calls `Partner.calculateDistance(...)`
   with a haversine SQL expression — the canonical module bans this formula
   module-wide (MVP-03 architecture test).
2. The legacy accept path has no idempotency: two concurrent accepts of the same
   proposal can both report success. MVP-04's accept is idempotent and
   serialized (proved on real PostgreSQL).
3. The legacy `expires_at` is advisory. MVP-04 treats expiry as authoritative at
   action time.
4. Legacy price validation clamps to a hard-coded `[20, 1000]` range
   (service lines 398-403) — an arbitrary business rule that the canonical
   server-priced model removes entirely.
