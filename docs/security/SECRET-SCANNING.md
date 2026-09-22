# Secret scanning

Date: 2026-09-22 · Task: T6 backend hygiene

The repository ships a [gitleaks](https://github.com/gitleaks/gitleaks)
configuration (`.gitleaks.toml`) and a runner (`scripts/security/scan-secrets.sh`)
so a secret scan can be executed locally and in CI.

## How to run

From the repository root:

```bash
npm run scan:secrets              # scan the working tree (default)
npm run scan:secrets -- --history # scan the full git history
```

From the backend package:

```bash
cd socorre_ai_backend
npm run scan:secrets
```

The runner looks for the `gitleaks` binary on `PATH`, then falls back to Docker
(`zricethezav/gitleaks:v8.30.1`). A specific binary can be forced:

```bash
GITLEAKS_BIN=/path/to/gitleaks npm run scan:secrets
```

Exit code `0` means no findings; `1` means findings were reported (they are
redacted in the output). Use `--history` sparingly: it walks every commit and
will report the known pre-rotation exposure (S-11).

## What the configuration does

- Extends the gitleaks default rule set (`[extend] useDefault = true`).
- Excludes gitignored dependency trees, build outputs and generated caches
  (`node_modules/`, `build/`, `.dart_tool/`, `dist/`, `coverage/`,
  `.npm-cache/`, `uploads/`) — these are rebuilt from source and are not part
  of the repository.
- Allowlists sanitized examples (`env.example`, `env.production.example`,
  `.env.test.example`, `.env.example`) and the captured T00 security evidence
  file, which contains placeholder PEMs only.
- Allowlists documented development placeholders and deterministic test
  fixtures (`dev_jwt_secret_2025_change_in_production`,
  `socorre_ai_jwt_secret_dev_2024`, `test-jwt-secret-key`, `tow_test_password`,
  `partner123456`, `test123456`, `idem-*`, `gauntlet-*`,
  `your-private-key-here`, `sua_private_key_aqui`). None of these values grant
  access to any environment.

## Known findings and expected results

- Working tree: clean **except** the untracked local file
  `socorre_ai_backend/.env.bak`, which contains a real Firebase service-account
  private key. It is not tracked by git; it is the S-11 local artifact that must
  be deleted only **after** the external key rotation. This finding is expected
  until the external action is completed.
- History (`--history`): reports the pre-rotation blobs from the initial commit
  `2f9f19cf` (`.env`, `.env.production`) plus historical placeholder literals.
  This is the known S-11 exposure that requires rotation and, only afterwards, a
  history purge.

The scan never replaces the external S-11 action: rotate the Firebase key,
evaluate rotation of the historical DB password / JWT secret, then delete the
local `.env.bak` and coordinate a history purge.

## Adding an allowlist entry

Prefer a specific `regexes` entry over a broad `paths` entry. Never allowlist a
value that could authenticate to any environment. Every allowlist entry must
carry a comment in `.gitleaks.toml` explaining why it is safe.
