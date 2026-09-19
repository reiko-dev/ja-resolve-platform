# MVP-01 EXT-MVP01-3 — Private Tow storage durability (P1)

External re-review of PR #35 returned `CHANGES_REQUIRED` with **EXT-MVP01-3 (P1)**:
private Tow document storage was HTTP-private but **not deployment-durable** — the
default `<backend>/private/tow-documents` lives inside the replaceable release
tree, and the homolog `rsync -a --delete` can delete blobs while PostgreSQL
metadata survives, with no `TOW_DOCUMENT_STORAGE_DIR` configured in deployments.

This pass makes storage durable and fail-fast, keeps the private port surface and
authenticated downloads unchanged, and adds tests + deployment configuration.

- Execution base: `c8e40d71` (post-merge Tow MVP replan) — confirmed by grep, see
  "Execution base" below.
- Previous implementation head: `a1437098` (EXT-MVP01-1/2 fix `443ac423`, Muse
  external re-review `b7f86d49`).
- **New implementation head: `825742ae`**
  (`fix(mvp-01): durable private Tow document storage outside the release tree`).
- Branch: `feature/mvp-01-tow-foundation`.
- Push / PR / merge: **not performed**.

## 1. Storage location + fail-fast (`adapters/storage/local-file-storage.js`)

Resolution rules (all at call time, never at import):

| Condition | Result |
| --- | --- |
| `TOW_DOCUMENT_STORAGE_DIR` (or explicit `baseDir`) set and non-empty | resolved to an **absolute** path; authoritative |
| `NODE_ENV=production` and the var missing/empty/blank | **throws** `TowStorageConfigError` — no release-local fallback |
| `NODE_ENV=production` and resolved path inside the running backend tree | **throws**, naming the offending path |
| `NODE_ENV=production` and resolved path is a release-tree marker (`.../staging/backend/...` or a `releases` segment) | **throws**, naming the offending path |
| `NODE_ENV=production` and resolved path contains an `uploads` segment / public-static tree | **throws**, naming the offending path |
| not production, var absent | dev/test fallback `<backend>/private/tow-documents` (git-ignored) |
| filesystem root (`/`) | **throws** (not a usable private root) |

The running backend directory is derived from the adapter location
(`__dirname` ↑ 5 = `socorre_ai_backend`), so whichever release path the process is
started from (`/var/www/.../backend`, `/var/www/.../staging/backend`, a
`releases/...` extraction) is exactly the tree that is refused. Release-tree
markers and the `uploads` segment are additionally rejected even when the running
directory differs.

The private port surface is unchanged: `save -> { key }`, `read(key) -> Buffer`,
`remove(key)`, **no `urlFor`**, traversal-contained `resolveKey`. Authenticated
downloads (admin + owning partner) and the per-context relative `file_url` are
untouched.

## 2. POSIX permissions (umask-proof)

- directories created via `mkdirSync(..., { mode: 0o700 })` **and** an explicit
  `chmodSync(0700)` on the created directory and each ancestor up to the base;
- files written with `writeFile(..., { mode: 0o600 })` **and** an explicit
  `chmod(0600)`;
- `chmod` is best-effort (caught) on platforms without POSIX modes (Windows);
  enforced on POSIX. No deployment script broadens these permissions.

## 3. Deployment configuration (repository only; not executed)

Storage is configured **outside** the application release tree, mirroring the
existing `SERVICE_PHOTO_STORAGE_DIR` / `/var/lib/socorre-ai/private/service-photos`
convention.

| Artifact | Change |
| --- | --- |
| `socorre_ai_backend/ecosystem.config.js` (`env_production`) | `TOW_DOCUMENT_STORAGE_DIR: '/var/lib/socorre-ai/private/tow-documents'` |
| `scripts/homolog/ecosystem.homolog.config.js` (`env`) | same |
| `scripts/deploy-production.sh` | `install -d -o www-data -g www-data -m 700 /var/lib/$PROJECT_NAME/private/tow-documents` beside the service-photos line |
| `scripts/homolog/deploy-homolog.sh` | `sudo install -d -o deploy -g deploy -m 700 /var/lib/socorre-ai/private/tow-documents`; PM2 reload passes the ecosystem env (`--update-env`) |
| `scripts/homolog/bootstrap-vps.sh` | **left untouched** — it does **not** provision the private service-photo dir, so there is no existing pattern to mirror (asserted by the durability test) |
| `docker-compose-simple.yml` / `docker-compose.yml` (`backend` only) | env `TOW_DOCUMENT_STORAGE_DIR=/var/lib/socorre-ai/private/tow-documents` + mount `tow_document_data:/var/lib/socorre-ai/private/tow-documents`; top-level `tow_document_data:` volume. `backend_legacy_off` intentionally untouched |
| `socorre_ai_backend/env.production.example` | documents `TOW_DOCUMENT_STORAGE_DIR` (as it documents `SERVICE_PHOTO_STORAGE_DIR`) |

`docker-compose.test.yml` (tmpfs) is **not** changed; the test setup overrides the
directory with an OS temp dir.

### Deployment isolation proof

The homolog release publishes the backend with:

```
rsync -a --delete ... "$REPO/socorre_ai_backend/" "$STAGING/backend/"
```

i.e. `$STAGING/backend` is fully replaced on every release. The configured root
`/var/lib/socorre-ai/private/tow-documents` is on a different tree entirely
(`/var/lib/...`), so a release (`--delete`) cannot remove document blobs. The
durability suite asserts the rsync source string and that the configured root is
not inside `$REPO/socorre_ai_backend` (nor the repository tree).

## 4. Tests

- `tests/tow/mvp01/towLocalFileStorage.test.js` (13 tests total): original privacy
  contract plus production fail-fast (missing/empty env throws; path inside the
  backend tree throws; `staging/backend` throws; `releases` throws; `uploads`
  segment throws; explicit persistent path honoured; dev fallback works) and
  POSIX mode assertions (dir `0700`, file `0600`; skipped only on Windows with an
  explicit comment).
- `tests/tow/mvp01/towStorageDurability.test.js` (9 tests, static/config): prod
  and homolog ecosystems export a durable dir outside the repository; deploy
  scripts create it mode `700`; the homolog rsync source is
  `$REPO/socorre_ai_backend/` and storage is outside it; backend Compose services
  define the env + named volume; `backend_legacy_off` does not; bootstrap is
  untouched; `env.production.example` documents the var.
- Green regression: `towDocumentDownload`, `towLocalFileStorage`,
  `towDocumentService`, all prior authz/traversal cases and the EXT-MVP01-2
  eligibility suites (see gate table).

## 5. Execution base confirmation

The MVP-01 evidence and work result use the actual execution base
`c8e40d71dd23c32a76050c05518353b6d030753f` (`01-current-state-delta.md`,
`13-external-correction.md`, `MVP-01-WORK-RESULT.md`). No MVP-01 evidence or
work-result artifact contains a stale `f31962fd` claim; the only `f31962fd`
references live in the pre-execution planning docs (`docs/tow/*`), which record
the historical `main` baseline and are deliberately **not** rewritten. T01
historical evidence (including `docs/evidence/t01/db-baseline-gate.json`, which
the gate regenerates non-deterministically) was left untouched.

## 6. Gates (all green; PostgreSQL torn down)

| Command | Exit | Summary |
| --- | --- | --- |
| `npm run validate:openapi` | 0 | PASS — 0 unresolved refs / 0 dropped shadowed methods |
| `npm run test:contract` | 0 | 5 suites / 62 tests PASS |
| `npm run verify:tow` | 0 | GREEN 5/5 stages incl. disposable PostgreSQL; teardown verified |
| `npx jest tests/tow/mvp01 --runInBand` | 0 | 13 passed / 2 skipped suites · 123 passed / 10 skipped |
| `npx jest tests/tow --runInBand` | 0 | 29 passed / 5 skipped suites · 474 passed / 58 skipped |
| `npm run test:db-baseline` | 0 | GREEN — fingerprint `37cee47e…` identical ×2, teardown verified |
| `npx jest --runInBand` | 0 | 62 passed / 5 skipped suites · **898 passed / 58 skipped / 0 failures** |
| `npm run test:pg:up && npm run test:pg:wait` | 0 | disposable PostgreSQL healthy |
| `TOW_POSTGRES_E2E=1 npx jest tests/tow/mvp01 --runInBand` | 0 | 15 suites / 133 tests PASS |
| `npm run test:pg:down` | 0 | containers/volumes/network destroyed |

Raw logs: `15a`–`15j` in this directory. Full Jest rose 880 → **898 passed**
(+18 new tests); `tests/tow` 456 → 474; real-PG mvp01 115 → 133. No pre-existing
test was weakened and there is no `.only`/`.skip`/relaxed expectation.

## 7. Scope

- VPS: NO (no execution; repository config only) · MVP-02: NO · #33: NO · #31: NO
- No nginx change; nothing added to `/uploads`; private port surface and
  authenticated downloads unchanged; EXT-MVP01-1/2 and MMVP-1..6 preserved.
- `docs/evidence/t01/db-baseline-gate.json` (regenerated with a random gate-admin
  email by the gate) was reverted so T01 historical evidence is untouched.
- No `git add -A`; explicit paths only; no push/PR/merge.
