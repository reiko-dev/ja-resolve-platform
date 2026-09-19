# Legacy seeds (ARCHIVED — do not run)

The five seed files that existed before T01:

| File | What it did | Why it is gone |
| --- | --- | --- |
| `initial_data.js` | Deleted **every** user and category, then inserted an admin with the hardcoded password `admin123` and four categories | Destructive, non-idempotent (a second run created a second admin), hardcoded credential, functional lookup data |
| `002_mechanics_data.js` | Three mechanics with hardcoded `user_id` 2/3/4 | Depended on rows created by another seed; failed from zero with `mechanics_user_id_foreign` |
| `003_partner_users.js` | Demo partner users with hardcoded passwords | Functional/demo data, hardcoded credentials |
| `004_client_users.js` | Demo client users | Functional/demo data |
| `005_partner_users.js` | More demo partner users (password `123456`) | Functional/demo data, weak hardcoded credential |

The baseline replaces all of them with a single seed,
`database/seeds/001_admin.js`, which:

- creates **exactly one** row (the default administrator);
- reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` from the environment and
  has **no** fallback credential;
- is idempotent (a second run changes nothing) and never promotes or overwrites
  an existing account;
- is proven by `tests/tow/baseline/adminSeed.test.js`.

These files are kept for audit only; `knexfile.js` points at
`database/seeds`, which contains just the administrator seed.

The RED evidence that shows the legacy seeds failing from zero is in
`docs/evidence/t01/01-red-probe-before-fix.txt`.
