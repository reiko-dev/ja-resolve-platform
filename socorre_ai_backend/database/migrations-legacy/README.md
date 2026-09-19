# Legacy migration chain (ARCHIVED — do not run)

These 43 files are the migration chain that existed before T01
(Issue #12, Epic #10). They are **archived, not deleted**, for three reasons:

1. **audit trail** — the schema they produced is the reference the clean
   baseline was generated from and compared against
   (`docs/evidence/t01/schema-legacy-chain.json`,
   `docs/evidence/t01/schema-legacy-vs-baseline.txt`);
2. **rollback of the decision** — if the consolidation ever has to be undone,
   the exact statements are still here;
3. **one contract test still imports `045` directly**
   (`tests/tow/g2PhotoContract.test.js`), because that migration is the
   definition of the photo-column contract and the test exercises `up`/`down`
   against SQLite.

They are **never applied** by the application any more: `knexfile.js` and
`src/config/database.js` point at `database/migrations`, which now contains the
two baseline migrations. Nothing in the repository migrates from this folder.

## Why they were replaced

The audit (`docs/tow/T00-CURRENT-STATE-AUDIT.md`,
`docs/tow/T01-DATABASE-BASELINE-DECISION.md`) found that the chain could not
boot a brand new PostgreSQL into a clean state:

- `015_migrate_existing_data.js` performed a data backfill and its `down()`
  deleted partners/partner_services/emergency_requests — a migration depending
  on historical data;
- two different migrations shared the number `029`
  (`029_create_partner_documents_table.js` and
  `029_create_subscription_history_table.js`), and `016`, `017`, `027` were
  missing;
- `030_create_enum_types.js` was dead code on PostgreSQL (Knex `.enum()` creates
  a `CHECK` constraint, not a native type — the catalog snapshot shows
  `enums=0`), while `034` created the real `partners_type_check`;
- the chain mixed structure with reference data (`033`, `040` inserted
  `system_settings` rows);
- it produced five indexes that exactly duplicated a unique constraint, and left
  `wallet_transactions.dispute_id` without any foreign key (an orphan
  `dispute_id` was accepted — proven in the RED evidence).

## Upgrade path for a database built by this chain

Historical data was explicitly authorized for reset (Issue #12), so there is no
incremental upgrade: reset and rebuild.

```bash
cd socorre_ai_backend
DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET npm run db:reset   # guarded, dev/test only
npm run db:migrate
npm run db:seed
```

See `docs/tow/database-baseline.md` for the full operational procedure and the
safety rules that make the reset impossible to aim at production.
