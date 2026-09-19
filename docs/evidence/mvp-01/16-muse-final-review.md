# MVP-01 — Muse final review (EXT-MVP01-3 storage durability)

```text
verdict: APPROVE
reviewed_head: fba08e05
implementation_head: 825742ae
reviewer: Muse Sparks 1.3 Free
prior: external re-review CHANGES_REQUIRED (EXT-MVP01-3 P1) on head a1437098
scope: MVP-01 / Issue #13 — private Tow document storage durability
findings: []
```

## Summary

EXT-MVP01-3 is fixed and proven adversarially. `TOW_DOCUMENT_STORAGE_DIR` is authoritative with production
fail-fast outside the `rsync --delete` release tree, deployments provision
`/var/lib/socorre-ai/private/tow-documents` with 0700/0600 umask-proof modes, and all live gates pass including
real PostgreSQL (133/133) with mandatory teardown. No EXT-MVP01-1/2 or MMVP-1..6 regression; scope is
storage/deployment-config/test/docs only.

## EXT-MVP01-3 checks

| check | result |
|---|---|
| persistent_location_and_fail_fast | Direct node exercise of `resolveStorageDir` 8/8 OK: production missing/blank → `TowStorageConfigError` (`/required in production/`); inside-backend, `staging/backend`, `releases/`, `uploads`-segment paths refused naming the path; explicit `/var/lib/socorre-ai/private/tow-documents` honored; dev/test fallback `<backend>/private/tow-documents`. |
| deployment_configuration | `ecosystem.config.js` (prod) and `ecosystem.homolog.config.js` export exactly `/var/lib/socorre-ai/private/tow-documents`; `deploy-production.sh` + `deploy-homolog.sh` create it with `install -d ... -m 700`; both Compose backends define the env + `tow_document_data` volume; `backend_legacy_off` untouched; `env.production.example` documents it. |
| deployment_isolation | `deploy-homolog.sh` rsync source is `$REPO/socorre_ai_backend/` with `--delete`; the configured root is not inside the repo backend, `staging/backend` or `releases`; the new `towStorageDurability.test.js` is non-vacuous (literal rsync source, exact env equality, `isInside(...) === false`). |
| posix_permissions | Temp-dir probe under umask 022/077/000 → file 600, subdir 700, base 700 (mkdir+chmod, write+chmod). The mode assertion is skipped only on `win32`. |
| ext1_regression | Adapter exports only `save/read/remove` (no `urlFor`); traversal refusal intact; download authz matrix (401/403/404/200) green; `file_url` = relative authenticated path; no filesystem path exposure. |
| ext2_regression | Domain/HTTP/application untouched by this pass; module-first ordering, `partner.type === 'tow'`, `partner_not_operational`; eligibility suites green. |
| scope | Implementation diff exactly 10 files (storage adapter, 2 tow test files, 2 ecosystems, 2 deploy scripts, 2 compose, env example) + docs; no nginx diff; nothing added under `uploads`; no MVP-02/#33/#31/VPS. |
| live_gates | `tests/tow/mvp01` 123 passed/10 skipped; real-PG 15 suites / **133 passed** then teardown; `tests/tow` 474 passed; full jest 62 suites / **898 passed**; `validate:openapi` PASS; contract 5/62; `verify:tow` GREEN; `test:db-baseline` GREEN with teardown verified. |

## Findings

`findings: []` — P0 = 0, P1 = 0, P2 = 0, P3 = 0.

## Verified claims

- production fail-fast without env → CONFIRMED
- production rejects release-tree/uploads paths naming the path → CONFIRMED
- both PM2 ecosystems export the durable path → CONFIRMED
- homolog rsync source is `$REPO/socorre_ai_backend/` with `--delete` and storage outside it → CONFIRMED
- POSIX 0700/0600 umask-proof → CONFIRMED
- port surface `save/read/remove` only, no `urlFor` → CONFIRMED
- eligibility `partner.type === 'tow'`, module-first, `partner_not_operational` → CONFIRMED

## Unverified or risky (non-blocking)

- One transient full-suite run showed 2 failed non-tow suites (names not captured); two subsequent full runs
  were EXIT=0 green and all tow-scoped/contract/OpenAPI/`verify:tow`/`db-baseline`/real-PG gates are
  consecutively green — treated as a transient flake outside Tow.
- Deploy scripts and `/var/lib` provisioning were verified statically (file contents + unit/static tests), not
  by executing a real VPS/PM2 deploy; runtime fail-fast is covered by pure-function probes.

## Verdict

**APPROVE** — P0 = 0, P1 = 0, P2 = 0, P3 = 0; `findings: []`.
