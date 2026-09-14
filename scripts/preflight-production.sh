#!/usr/bin/env bash

# Validate production inputs without printing secret values.
# Usage: ENV_FILE=/path/to/.env.production ./scripts/preflight-production.sh
set -euo pipefail

if [[ -n "${ENV_FILE:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Production env file not found: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ "${NODE_ENV:-production}" != "production" ]]; then
  echo "Preflight requires NODE_ENV=production" >&2
  exit 1
fi

required=(JWT_SECRET DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD CORS_ORIGIN)
for key in "${required[@]}"; do
  value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required production variable: $key" >&2
    exit 1
  fi
done

if [[ "${JWT_SECRET}" == *your_* || "${JWT_SECRET}" == *change* || "${JWT_SECRET}" == *example* ]]; then
  echo "JWT_SECRET still contains a placeholder" >&2
  exit 1
fi

if [[ "${CORS_ORIGIN}" == "*" || "${CORS_ORIGIN}" == *yourdomain.com* ]]; then
  echo "CORS_ORIGIN must contain explicit production origins" >&2
  exit 1
fi

echo "Production preflight passed: required variables and non-placeholder values are present."
