#!/bin/sh
set -e
export NODE_ENV="${NODE_ENV:-production}"

if [ "${RUN_MIGRATIONS}" = "1" ] || [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] Executando migrations (Knex / production)..."
  npx knex migrate:latest --knexfile knexfile.js --env production
fi

exec node src/server.js
