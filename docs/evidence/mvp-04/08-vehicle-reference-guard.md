# MVP-04 — finding: a referenced vehicle must not be erasable

## Symptom

`DELETE /api/tow/vehicles/:id` (an MVP-01 operation) answered **500** on
PostgreSQL once migration 005 existed, for any vehicle a proposal or an
assignment pointed at:

```
error: update or delete on table "tow_vehicles" violates foreign key constraint
"tow_request_proposals_tow_vehicle_id_foreign" on table "tow_request_proposals"
```

On the SQLite harness the same call answered **200** and left the proposal
pointing at a row that no longer existed — a silent orphan.

## Why both engines were wrong

The frozen contract declares `409 DomainConflict` for `deleteTowVehicle` and
describes the operation as "deleted or deactivated according to policy". Neither
engine's behaviour is that code:

- PostgreSQL enforced the constraint (`ON DELETE RESTRICT`, deliberately chosen so
  an accepted assignment can never be erased) but the raw driver error escaped as
  a 500;
- the SQLite harness never enabled `PRAGMA foreign_keys`
  (`tests/helpers/testDb.js:119`), so the constraint did not exist there at all
  and the delete succeeded — the *test* environment was more permissive than
  production, which is the dangerous direction.

## Fix

`vehicleRepository.remove(id)` now counts the rows that reference the vehicle
(proposals and assignments) **before** deleting, and raises the contract conflict
(`TowError('conflict', …)` → `409`) when there are any. The database constraint
stays the authority: if a concurrent insert lands between the count and the
delete, the resulting violation is mapped to the same 409 instead of an internal
error. `isForeignKeyViolation` / `isUniqueViolation` are exported so the mapping is
testable directly.

The reference count is explicit rather than delegated to the engine precisely
because the two engines disagree — the guard must hold where the constraint is
absent, and must not turn the engine's own refusal into a 500 where it is present.

## Coverage

| Test | Proves |
| --- | --- |
| `towVehicleReferenceGuard.test.js` (6/6) | 409 for an ACTIVE proposal, 409 for a live assignment, 409 for withdrawn history, 200 for an untouched vehicle, 404 for another partner's vehicle, and the guard's own code path |
| `towMvp04Postgres.e2e.test.js` › **C7** | on real PostgreSQL, the raw `DELETE` is refused by the engine with SQLSTATE **23503**, and the HTTP delete answers 409 |
| `NC-MVP04-7` (negative control) | replacing the count with `0` turns the guard suite RED (4 of 6 failed) and is restored byte-identically |

This is one of the few places where MVP-04 **changed an accepted MVP-01
behaviour** (the 200 → 409 for a referenced vehicle). It is a contract
conformance fix, it is recorded here, and the change is additive: an unreferenced
vehicle is still deleted exactly as before.
