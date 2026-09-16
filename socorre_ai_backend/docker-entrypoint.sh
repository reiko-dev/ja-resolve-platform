#!/bin/sh
set -e
export NODE_ENV="${NODE_ENV:-production}"

if [ -n "${SERVICE_PHOTO_STORAGE_DIR:-}" ]; then
  mkdir -p "$SERVICE_PHOTO_STORAGE_DIR"
  chmod 700 "$SERVICE_PHOTO_STORAGE_DIR"
fi

if [ "${NODE_ENV}" = "production" ]; then
  case "${RUN_MIGRATIONS}" in
    ''|1|true)
      ;;
    0|false)
      echo "[entrypoint] RUN_MIGRATIONS=${RUN_MIGRATIONS}: migrations devem ter sido aplicadas externamente antes do tráfego."
      ;;
    *)
      echo "[entrypoint] RUN_MIGRATIONS deve ser vazio, 1, true, 0 ou false." >&2
      exit 64
      ;;
  esac
fi

if [ "${NODE_ENV}" = "production" ] && { [ -z "${RUN_MIGRATIONS}" ] || [ "${RUN_MIGRATIONS}" = "1" ] || [ "${RUN_MIGRATIONS}" = "true" ]; }; then
  echo "[entrypoint] Executando migrations (Knex / production)..."
  npx knex migrate:latest --knexfile knexfile.js --env production
fi

exec node src/server.js
