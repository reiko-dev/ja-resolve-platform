# MVP-04 — contract revision (draft.5 → draft.6)

The canonical contract at `docs/tow/tow-api-contract.openapi.yaml` moved
`1.0.0-draft.5` → **`1.0.0-draft.6`** on commit `78917ee0`. The base document
(`tow-api-contract.base.openapi.yaml`) keeps its version `1.0.0-draft.2` and gains
**no path and no schema** — but it is not byte-identical either, and that one line
is disclosed below.

## What changed

**1. Ownership move (structural, no shape change).** `draft.5` declared the four
MVP-04 paths as `$ref`s to the base document's path items:

```yaml
  /tow/requests/{requestId}/proposals:
    $ref: './tow-api-contract.base.openapi.yaml#/paths/~1tow~1requests~1{requestId}~1proposals'
```

`draft.6` replaces each of those four references with the **inlined path item**,
owned by the canonical document, and adds the five components those operations
need:

| Component | Role |
| --- | --- |
| `TowProposal` | the proposal body, re-declared so its inner refs resolve canonically (`tow_vehicle`, `route_quote`, `price`, `counteroffer` still point at the base) |
| `TowProposalStatus` | the seven-value lifecycle enum |
| `EnvelopeTowProposal` | `{success, data}` wrapper |
| `TowProposalResponse` | alias of the envelope, so the base's response name keeps working |
| `ErrorResponse` | the shared error body, re-declared to carry the extended enum |

The move is **shape-preserving**, and that is asserted rather than asserted-by-eye:
`npm run validate:openapi` reports, per path, the base methods, the composed
methods and `dropped=[]`; the four MVP-04 paths read
`base=[get,post] composed=[get,post] dropped=[]`,
`base=[post] composed=[post] dropped=[]`, … (see `10-openapi.txt`). No method,
parameter or response of the base was lost, and no MVP-04 path, parameter or
component was added to the base.

**2. Purely additive vocabulary — one enum member.** `ErrorResponse.error.code`
gains `proposal_already_active`, the code a partner receives when it already holds
an ACTIVE proposal for that request. It joins the family the base already declares
(`request_already_assigned`, `counteroffer_already_used`), so the client-side
switch is a new branch, never a renamed one:

```
proposal_already_active, proposal_expired, proposal_not_actionable, …
```

**3. The five operations themselves.** Unchanged in meaning from the base's
declaration, now specified by the canonical document:

| Path | Methods | Notes |
| --- | --- | --- |
| `/tow/requests/{requestId}/proposals` | `get`, `post` | the customer lists, the partner creates (server-priced: the body is empty by contract) |
| `/tow/proposals/{proposalId}/accept` | `post` | the atomic assignment |
| `/tow/proposals/{proposalId}/withdraw` | `post` | the partner's own exit, `409 proposal_not_actionable` once decided |
| `/tow/partner/proposals` | `get` | the partner's own book, status filter |

`TowAssignment` is **not** a public schema: the accept response returns the
assigned `TowProposal` and the request, so the assignment stays an internal fact
of the transaction.

## Why the base document took the same one line

`ErrorResponse.error.code` is a **shared** schema: it is declared in the base and
used by every operation that does not re-declare it. Adding a code only to the
canonical would have left the two documents disagreeing about the same schema, so
the enum was extended **identically in both files** (one line each; the lists are
byte-for-byte equal, and the surrounding `required`/`details` shape is untouched).
The base keeps its `1.0.0-draft.2` version, its paths and its schemas: the change
is one enum member, not a revision of the base.

`CANONICAL_ERROR_CODES` in `tests/helpers/towContract.js` — the frozen list the
validator requires to be present — gained the same code, so the "must be present"
assertion now protects it instead of merely permitting it. That helper is a
test-side mirror of the frozen vocabulary in `TOW-API-CONTRACT.md` §12; the
extension is disclosed in `04-contract-conflict-audit.md` (CONTRACT_CONFLICT-2)
together with the two options that were rejected (reuse `conflict` + a
`details.reason`, or answer `proposal_not_actionable`, which is semantically wrong
because the *existing* proposal is perfectly actionable).

## Composition rule

The rule the contract suite enforces is that a canonical document **re-declares**
the members it owns and references the base through
`./tow-api-contract.base.openapi.yaml#/components/...` for everything it does not.
`SHADOWED_METHOD_ALLOWLIST` is empty and `report.shadowedMethods.dropped` must
stay `[]` for every path — asserted by `npm run validate:openapi`
(see `10-openapi.txt`): every base method survives composition, and MVP-04 adds
no shadowed drop.

## Version pin

`tests/contract/openapi.structure.test.js` pins the canonical version, so the
revision could not happen silently: the pin moved with the document in the same
commit (`draft.5` → `draft.6`, one line).

## Contract-first, not contract-last

The revision landed on `78917ee0` **before** the implementation commit
(`de22e3cc`) and before the RED suite was made green, so the shapes the HTTP
layer had to produce were frozen by the document — and `towProposalContract.test.js`
validates the live 200/201 bodies against the *composed* document with ajv,
including in-suite negative controls (a live body with `route_quote` deleted, and
a live body whose `price.amount_cents` is a string) to prove the validation is
not vacuous, plus a guard that the compiled validators exist at all.
