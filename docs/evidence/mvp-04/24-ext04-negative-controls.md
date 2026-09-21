# MVP-04 EXT — negative controls (EXT-MVP04-1 / EXT-MVP04-2 / EXT-MVP04-3)

A green suite proves nothing unless it can fail. Each control below breaks exactly
ONE production predicate or guard that the EXT-MVP04 correction introduced, runs
the covering suites, requires RED, then restores the file from a byte copy and
requires the `sha256` to equal the pre-mutation hash BEFORE re-running to GREEN.
No mutation survived: all four files are byte-identical to their pre-control state
(`sha256sum -c` OK for all four) and `grep -rn "NC-EXT04-" src/` returns nothing.

Covering suites per control: the EXT suite that owns the behaviour plus
`tests/contract/towOperationContract.test.js`, so the operation-level contract
test is itself proven non-vacuous (it fails in NC-EXT04-2/3/4 and stays green in
NC-EXT04-1, whose RED is carried by the partner-isolation tests).

Environment: offline SQLite harness, fake clock `2026-01-15T12:00:00.000Z`, fake
route provider, `npx jest <suites> --runInBand`. As in the MVP-04 delivery, the
mutation driver itself lives outside the repository (`/tmp/nc-ext04/`) because it
rewrites tracked sources; only its results are recorded here, with hashes.

## NC-EXT04-1 — remove the partner ownership filter in the assignment read

Target: `socorre_ai_backend/src/modules/tow/adapters/persistence/assignment-repository.js`
Mutation (exact, from `diff -u <pre-mutation copy> <mutated file>`):

```diff
@@ -173,7 +173,7 @@
      */
     async function listForPartner(partnerId, { limit, offset, state = null, from = null, to = null } = {}) {
       const applyFilters = (query) => {
-        query.where('tow_assignments.partner_id', partnerId);
+        // NC-EXT04-1 mutation: partner ownership predicate removed
         if (state) query.where('tow_requests.state', state);
         if (from) query.where('tow_assignments.assigned_at', '>=', toIsoInstant(from));
         if (to) query.where('tow_assignments.assigned_at', '<=', toIsoInstant(to));
```

Why this must go RED: With the predicate gone the read returns EVERY partner assignment, so a partner that lost the request (or never proposed at all) receives the winner's job.

Raw RED — `npx jest tests/tow/mvp04/towPartnerJobs.test.js tests/contract/towOperationContract.test.js --runInBand`:

```
Test Suites: 1 failed, 1 passed, 2 total
Tests:       5 failed, 28 passed, 33 total
```

Failing tests (5):

```
MVP-04 EXT — partner job list (EXT-MVP04-1) › authorization and identity › the identity is the token, never the query
MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › a partner that lost the request sees no job
MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › an unrelated partner sees no job
MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › an ASSIGNED job is never visible to a partner that did not win it
MVP-04 EXT — partner job list (EXT-MVP04-1) › filters and pagination › pagination is over the partner assignments, not the request table
```

First failure, verbatim:

```
  ● MVP-04 EXT — partner job list (EXT-MVP04-1) › authorization and identity › the identity is the token, never the query

    expect(received).toEqual(expected) // deep equality

    - Expected  -  1
    + Received  + 55

    - Array []
    + Array [
    +   Object {
    +     "allowed_actions": Array [],
    +     "assignment": Object {
    +       "assigned_at": "2026-01-15T12:00:00.000Z",
    +       "final_price": Object {
    +         "amount_cents": 18480,
    +         "currency": "BRL",
    +       },
    +       "partner_id": "4",
    +       "tow_vehicle_id": "4",
    +     },
    … (raw transcript truncated here)
```

Restore + verify (byte copy, then hash):

```
$ cp /tmp/nc-ext04/assignment-repository.js.orig socorre_ai_backend/src/modules/tow/adapters/persistence/assignment-repository.js
$ sha256sum -c /tmp/nc-ext04/assignment-repository.js.sha
socorre_ai_backend/src/modules/tow/adapters/persistence/assignment-repository.js: OK
$ sha256sum socorre_ai_backend/src/modules/tow/adapters/persistence/assignment-repository.js
3f251fb940b43a5f58250745e557cc690daf4f9dacacc7f2b7194197d3b5ad94  socorre_ai_backend/src/modules/tow/adapters/persistence/assignment-repository.js
```

Raw GREEN after the byte-identical restore — same command:

```
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

## NC-EXT04-2 — remove the accept Idempotency-Key validation

Target: `socorre_ai_backend/src/modules/tow/application/assignment-service.js`
Mutation (exact, from `diff -u <pre-mutation copy> <mutated file>`):

```diff
@@ -159,7 +159,7 @@
     //    `proposal_id` plus the PostgreSQL unique constraints remain that
     //    authority, so a replay with a different valid key still returns the SAME
     //    assignment.
-    validateIdempotencyKey(idempotencyKey);
+    // NC-EXT04-2 mutation: accept Idempotency-Key validation removed
 
     // 3. A non-canonical id can never match a row.
     if (!isTowProposalId(proposalId)) throw new TowError('not_found', 'Tow proposal not found');
```

Why this must go RED: Without the guard a keyless accept reaches the transaction and assigns (200 instead of 422), so the required header would be declared in the contract but not enforced by the backend.

Raw RED — `npx jest tests/tow/mvp04/towIdempotencyKey.test.js tests/contract/towOperationContract.test.js --runInBand`:

```
Test Suites: 2 failed, 2 total
Tests:       6 failed, 29 passed, 35 total
```

Failing tests (6):

```
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › a missing Idempotency-Key is a 422 and assigns nothing
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › a too-short key is a 422 and assigns nothing
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › a too-long key is a 422 and assigns nothing
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › the key is validated before the proposal is even read
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › a missing key on an already assigned request is still a 422
MVP-04 EXT — operation-level OpenAPI contract == runtime (EXT-MVP04-3) › runtime -> contract: the real HTTP surface › acceptTowProposal: 422 without the header, 200 with it
```

First failure, verbatim:

```
  ● MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › accept › a missing Idempotency-Key is a 422 and assigns nothing

    expect(received).toBe(expected) // Object.is equality

    Expected: 422
    Received: 200

      128 |
      129 |   function expectKeyValidationError(response, reason) {
    > 130 |     expect(response.status).toBe(422);
          |                             ^
      131 |     expect(response.body.success).toBe(false);
      132 |     expect(response.body.error.code).toBe('validation_error');
      133 |     expect(response.body.error.details.field).toBe('Idempotency-Key');

      at toBe (tests/tow/mvp04/towIdempotencyKey.test.js:130:29)
    … (raw transcript truncated here)
```

Restore + verify (byte copy, then hash):

```
$ cp /tmp/nc-ext04/assignment-service.js.orig socorre_ai_backend/src/modules/tow/application/assignment-service.js
$ sha256sum -c /tmp/nc-ext04/assignment-service.js.sha
socorre_ai_backend/src/modules/tow/application/assignment-service.js: OK
$ sha256sum socorre_ai_backend/src/modules/tow/application/assignment-service.js
ea56e80ea2deb4c5950c1ad2ba66fad7ab312e8a75a2116ed6f258b0a1413a72  socorre_ai_backend/src/modules/tow/application/assignment-service.js
```

Raw GREEN after the byte-identical restore — same command:

```
Test Suites: 2 passed, 2 total
Tests:       35 passed, 35 total
```

## NC-EXT04-3 — remove the withdraw Idempotency-Key validation

Target: `socorre_ai_backend/src/modules/tow/application/proposal-service.js`
Mutation (exact, from `diff -u <pre-mutation copy> <mutated file>`):

```diff
@@ -312,7 +312,7 @@
     // validated with the SAME domain validator the create path uses, BEFORE the
     // proposal is even read. A missing or malformed header therefore never
     // mutates, on every path below: replay, foreign, ACCEPTED, CLOSED, expired.
-    validateIdempotencyKey(idempotencyKey);
+    // NC-EXT04-3 mutation: withdraw Idempotency-Key validation removed
 
     if (!isTowProposalId(proposalId)) throw new TowError('not_found', 'Tow proposal not found');
     const proposal = await towProposalRepository.findById(proposalId);
```

Why this must go RED: Without the guard a keyless withdraw mutates an ACTIVE proposal to WITHDRAWN (200 instead of 422) — including the foreign and unknown paths where 422 must win before the 403/404.

Raw RED — `npx jest tests/tow/mvp04/towIdempotencyKey.test.js tests/contract/towOperationContract.test.js --runInBand`:

```
Test Suites: 2 failed, 2 total
Tests:       5 failed, 30 passed, 35 total
```

Failing tests (5):

```
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › a missing Idempotency-Key is a 422 and the proposal stays ACTIVE
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › a too-short or too-long key is a 422 and the proposal stays ACTIVE
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › a foreign partner is 403 with a valid key and 422 without one
MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › an unknown proposal is 404 with a key and 422 without one
MVP-04 EXT — operation-level OpenAPI contract == runtime (EXT-MVP04-3) › runtime -> contract: the real HTTP surface › withdrawTowProposal: 422 without the header, 200 with it
```

First failure, verbatim:

```
  ● MVP-04 EXT — required Idempotency-Key on accept and withdraw (EXT-MVP04-2) › withdraw › a missing Idempotency-Key is a 422 and the proposal stays ACTIVE

    expect(received).toBe(expected) // Object.is equality

    Expected: 422
    Received: 200

      128 |
      129 |   function expectKeyValidationError(response, reason) {
    > 130 |     expect(response.status).toBe(422);
          |                             ^
      131 |     expect(response.body.success).toBe(false);
      132 |     expect(response.body.error.code).toBe('validation_error');
      133 |     expect(response.body.error.details.field).toBe('Idempotency-Key');

      at toBe (tests/tow/mvp04/towIdempotencyKey.test.js:130:29)
    … (raw transcript truncated here)
```

Restore + verify (byte copy, then hash):

```
$ cp /tmp/nc-ext04/proposal-service.js.orig socorre_ai_backend/src/modules/tow/application/proposal-service.js
$ sha256sum -c /tmp/nc-ext04/proposal-service.js.sha
socorre_ai_backend/src/modules/tow/application/proposal-service.js: OK
$ sha256sum socorre_ai_backend/src/modules/tow/application/proposal-service.js
fafa34b146da4f5fc8b503325b71e8349262a6f4f89c7b0fedbc7fb41519a016  socorre_ai_backend/src/modules/tow/application/proposal-service.js
```

Raw GREEN after the byte-identical restore — same command:

```
Test Suites: 2 passed, 2 total
Tests:       35 passed, 35 total
```

## NC-EXT04-4 — remove the assignment hydration in the partner job DTO

Target: `socorre_ai_backend/src/modules/tow/application/tow-request-service.js`
Mutation (exact, from `diff -u <pre-mutation copy> <mutated file>`):

```diff
@@ -219,7 +219,7 @@
         .map((row) => {
           const towRequest = requestById.get(String(row.tow_request_id));
           return toDto(towRequest, settings, {
-            assignment: buildAssignmentDto(row),
+            // NC-EXT04-4 mutation: assignment hydration removed
             allowed_actions: actionsFor(towRequest, liveIds),
           });
         }),
```

Why this must go RED: Without hydration the partner job loses its assignment block, so the partner and the customer no longer agree on price/vehicle/instant and the DTO equality with the customer recovery path breaks.

Raw RED — `npx jest tests/tow/mvp04/towPartnerJobs.test.js tests/contract/towOperationContract.test.js --runInBand`:

```
Test Suites: 2 failed, 2 total
Tests:       4 failed, 29 passed, 33 total
```

Failing tests (4):

```
MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › the winning partner sees exactly its assigned job
MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › the customer and the partner agree on the very same assignment
MVP-04 EXT — partner job list (EXT-MVP04-1) › filters and pagination › pagination is over the partner assignments, not the request table
MVP-04 EXT — operation-level OpenAPI contract == runtime (EXT-MVP04-3) › runtime -> contract: the real HTTP surface › listPartnerTowJobs: 401 anonymous, 403 customer, 200 partner, 422 bad query
```

First failure, verbatim:

```
  ● MVP-04 EXT — partner job list (EXT-MVP04-1) › the job list › the winning partner sees exactly its assigned job

    expect(received).toEqual(expected) // deep equality

    Expected: {"assigned_at": "2026-01-15T12:00:00.000Z", "final_price": {"amount_cents": 18480, "currency": "BRL"}, "partner_id": "7", "tow_vehicle_id": "7"}
    Received: null

      184 |       expect(job.id).toBe(String(towRequest.id));
      185 |       expect(job.state).toBe('ASSIGNED');
    > 186 |       expect(job.assignment).toEqual(assigned.assignment);
          |                              ^
      187 |       expect(job.assignment.partner_id).toBe(String(auths[0].partner.id));
      188 |       expect(job.assignment.assigned_at).toBe(ASSIGNED_AT);
      189 |       expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 1 });

      at Object.toEqual (tests/tow/mvp04/towPartnerJobs.test.js:186:30)
    … (raw transcript truncated here)
```

Restore + verify (byte copy, then hash):

```
$ cp /tmp/nc-ext04/tow-request-service.js.orig socorre_ai_backend/src/modules/tow/application/tow-request-service.js
$ sha256sum -c /tmp/nc-ext04/tow-request-service.js.sha
socorre_ai_backend/src/modules/tow/application/tow-request-service.js: OK
$ sha256sum socorre_ai_backend/src/modules/tow/application/tow-request-service.js
3624d90934fb2cbf65971dfb7c1ebc0b4ba56814ec5245f6c60ef2dd94205c8a  socorre_ai_backend/src/modules/tow/application/tow-request-service.js
```

Raw GREEN after the byte-identical restore — same command:

```
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

## Integrity after all four controls

```
$ sha256sum src/modules/tow/adapters/persistence/assignment-repository.js \
             src/modules/tow/application/assignment-service.js \
             src/modules/tow/application/proposal-service.js \
             src/modules/tow/application/tow-request-service.js
3f251fb940b43a5f58250745e557cc690daf4f9dacacc7f2b7194197d3b5ad94  src/modules/tow/adapters/persistence/assignment-repository.js
ea56e80ea2deb4c5950c1ad2ba66fad7ab312e8a75a2116ed6f258b0a1413a72  src/modules/tow/application/assignment-service.js
fafa34b146da4f5fc8b503325b71e8349262a6f4f89c7b0fedbc7fb41519a016  src/modules/tow/application/proposal-service.js
3624d90934fb2cbf65971dfb7c1ebc0b4ba56814ec5245f6c60ef2dd94205c8a  src/modules/tow/application/tow-request-service.js
$ grep -rn "NC-EXT04-" src/
(none)
```

Each hash equals the value recorded before the corresponding mutation, so every
control was reverted exactly and the GREEN runs above describe the shipped code,
not a mutated tree.

