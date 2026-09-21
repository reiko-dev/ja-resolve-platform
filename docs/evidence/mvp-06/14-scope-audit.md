# MVP-06 — Scope audit

Date: 2026-09-21 · Branch: `feature/mvp-06-cash-readiness`

Question: did MVP-06 accidentally implement any Phase 2 (#33) scope?

## Runtime delta introduced by MVP-06

| Artifact | What it does |
| --- | --- |
| `database/migrations/007_mvp06_cash_payment.js` | creates `tow_payments` only |
| `src/modules/tow/domain/tow-payment.js` | CASH aggregate vocabulary, validators, DTO projection |
| `src/modules/tow/adapters/persistence/tow-payment-repository.js` | the only writer of `tow_payments` |
| `src/modules/tow/application/payment-service.js` | select method / confirm cash / read summary |
| `src/modules/tow/application/payment-summary.js` | shared honest projection into `TowRequest.payment` |
| `src/modules/tow/http/payment-controller.js` + 3 routes | the three canonical payment operations |
| `src/modules/tow/domain/tow-request.js` | `payment` becomes an injected projection (no second truth) |
| `tow-request-service` / `assignment-service` / `execution-service` / `cancellation-service` | inject the payment projection into the response DTO |
| `composition.js` / `ports.js` / barrels | wiring |

## Search results in the MVP-06 functional delta

| Deferred concept | Occurrences in new runtime code | Classification |
| --- | --- | --- |
| CARD | only as a **rejected** input value in the validator and in prose comments | not implemented |
| PIX | only as a **rejected** input value and `pix: null` in the DTO (contract-required member) | not implemented |
| counteroffer | none | not implemented |
| wallet | none (no import, no table, no route) | not implemented |
| payout / settlement | none | not implemented |
| debts (customer or partner platform fee) | none | not implemented |
| PSP webhook | none | not implemented |
| refund | none | not implemented |
| dispute / review | none | not implemented |
| no-show / rematch | none | not implemented |
| Stripe / MercadoPago / PagSeguro adapters | never imported by the module; a runtime spy proves 0 calls | not implemented |

The only occurrences of the deferred words are:

1. the long-term OpenAPI text (`docs/tow/tow-api-contract.*`), which MVP-06 deliberately does **not** narrow;
2. documentation and code comments that explain why the concept is deferred;
3. the contract-mandated `pix: null` member of `PaymentSummary` (a null is the absence of PIX, not an
   implementation);
4. the `422 method_not_supported_in_mvp` rejection of `card`/`pix`.

## Contract truthfulness

- the canonical contract revision note (draft.9) states exactly which subset is implemented;
- the base contract is byte-identical to the reviewed artifact (asserted by the MVP-06 architecture suite);
- no Phase 2 operation was routed: `GET /tow/partner/financial-summary`, customer debts, payout batches,
  disputes, reviews and counteroffers all still 404;
- `TowRequest.allowed_actions` was deliberately left untouched (documented omission, never a false claim).

## Legacy isolation

- `tow_payments` is written by exactly one adapter (asserted);
- no module file references the legacy `payments`, `wallets`, `wallet_transactions`, `commissions`, `disputes`
  or `tow_proposals` tables (asserted);
- no module file imports `paymentService`, `walletService`, `commissionService` or a PSP gateway (asserted);
- `#31` (historical credential remediation) was not touched. It remains deferred and is required before
  production security sign-off/go-live.

## Verdict

**No accidental Phase 2 functional scope.** Every new runtime line serves the CASH payment path or the honest
projection of its state.
