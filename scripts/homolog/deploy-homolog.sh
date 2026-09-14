#!/usr/bin/env bash
# Release de homologação: puxa o código do GitHub, builda no servidor e publica.
#
# Uso (na VPS, como usuário deploy):
#   /var/www/socorre-ai/repository/scripts/homolog/deploy-homolog.sh [--seed]
#
# --seed popula dados de demonstração (admin + parceiros + clientes + mecânicos).
# Use apenas na primeira release; os seeds apagam e recriam esses registros.

set -euo pipefail

REPO="/var/www/socorre-ai/repository"
ROOT="/var/www/socorre-ai"
SHARED="$ROOT/shared"
STAGING="$ROOT/staging"
RELEASES="$ROOT/releases"
SEED=0
if [ "${1:-}" = "--seed" ]; then
  SEED=1
fi

[ -f "$SHARED/homolog.env" ] || { echo "[erro] rode bootstrap-vps.sh antes do primeiro deploy" >&2; exit 1; }
# shellcheck source=/dev/null
source "$SHARED/homolog.env"
: "${HOMOLOG_ADMIN_HOST:?defina HOMOLOG_ADMIN_HOST no shared/homolog.env}"
: "${HOMOLOG_SITE_HOST:?defina HOMOLOG_SITE_HOST no shared/homolog.env}"
: "${HOMOLOG_BRANCH:=main}"

log() { printf '\n[%s] %s\n' "$(date +'%F %T')" "$1"; }

log "Puxando o código do GitHub ($HOMOLOG_BRANCH)..."
cd "$REPO"
git fetch --prune origin "$HOMOLOG_BRANCH"
git checkout -f "$HOMOLOG_BRANCH"
git reset --hard "origin/$HOMOLOG_BRANCH"
git clean -fd
REV="$(git rev-parse --short HEAD)"
log "Release: $REV $(git log -1 --format='- %s')"

mkdir -p "$RELEASES" "$STAGING/backend" "$STAGING/admin" "$STAGING/site"
TS="$(date +%Y%m%d-%H%M%S)"

if [ -d "$STAGING/backend/src" ]; then
  log "Backup da release publicada atual..."
  tar --exclude='staging/backend/node_modules' -czf "$RELEASES/staging-$TS.tar.gz" -C "$ROOT" staging
  ls -1t "$RELEASES"/staging-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

if [ -f "$SHARED/backend.env" ]; then
  log "Backup do banco antes das migrations..."
  (
    set -a
    # shellcheck source=/dev/null
    source "$SHARED/backend.env"
    set +a
    PGPASSWORD="$DB_PASSWORD" pg_dump \
      -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" "$DB_NAME" \
      | gzip > "$RELEASES/db-$TS.sql.gz"
  )
  ls -1t "$RELEASES"/db-*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

log "Buildando o admin (React, API em /api)..."
(
  cd "$REPO/socorre_ai_admin"
  if ! npm ci --no-audit --no-fund; then
    log "npm ci falhou; usando npm install"
    npm install --no-audit --no-fund
  fi
  REACT_APP_API_URL=/api npm run build
)

log "Publicando o backend..."
rsync -a --delete \
  --exclude 'node_modules/' --exclude '.env' --exclude 'uploads/' \
  --exclude 'tests/' --exclude 'coverage/' --exclude '.env.bak' \
  "$REPO/socorre_ai_backend/" "$STAGING/backend/"
mkdir -p "$STAGING/backend/uploads/images" \
  "$STAGING/backend/uploads/documents" \
  "$STAGING/backend/uploads/user-documents"
ln -sfn "$SHARED/backend.env" "$STAGING/backend/.env"

log "Instalando dependências do backend..."
(
  cd "$STAGING/backend"
  if ! npm ci --omit=dev --no-audit --no-fund; then
    log "npm ci falhou; usando npm install"
    npm install --omit=dev --no-audit --no-fund
  fi
)

log "Aplicando migrations..."
( cd "$STAGING/backend" && npx knex migrate:latest --env production )

if [ "$SEED" = "1" ]; then
  log "Aplicando seeds de demonstração (apagam e recriam os registros)..."
  ( cd "$STAGING/backend" && npx knex seed:run --env production --specific=initial_data.js )
  ( cd "$STAGING/backend" && npx knex seed:run --env production --specific=003_partner_users.js ) || log "seed 003 falhou (seguindo)"
  ( cd "$STAGING/backend" && npx knex seed:run --env production --specific=004_client_users.js ) || log "seed 004 falhou (seguindo)"
  ( cd "$STAGING/backend" && npx knex seed:run --env production --specific=002_mechanics_data.js ) || log "seed 002 falhou (seguindo)"
fi

log "Publicando o admin..."
rsync -a --delete "$REPO/socorre_ai_admin/build/" "$STAGING/admin/"

log "Publicando o site oficial..."
rsync -a --delete "$REPO/site-oficial/" "$STAGING/site/"

log "Ajustando permissões..."
sudo chown -R www-data:www-data "$STAGING/admin" "$STAGING/site"
sudo find "$STAGING/admin" -type d -exec chmod 755 {} +
sudo find "$STAGING/admin" -type f -exec chmod 644 {} +
sudo find "$STAGING/site" -type d -exec chmod 755 {} +
sudo find "$STAGING/site" -type f -exec chmod 644 {} +
sudo systemctl reload php8.3-fpm

log "Reiniciando o backend (PM2)..."
pm2 startOrReload "$REPO/scripts/homolog/ecosystem.homolog.config.js" --update-env
pm2 save >/dev/null

log "Health checks..."
ok=0
for _ in $(seq 1 15); do
  if curl -fsS --max-time 5 http://127.0.0.1:3001/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
[ "$ok" = "1" ] || { echo "[erro] backend não respondeu em http://127.0.0.1:3001/health" >&2; pm2 logs socorre-ai-homolog-backend --lines 30 --nostream || true; exit 1; }
echo "  backend local (3001): ok"
for host in "$HOMOLOG_ADMIN_HOST" "$HOMOLOG_SITE_HOST"; do
  if curl -fsS --max-time 15 "https://$host/" >/dev/null 2>&1; then
    echo "  $host: ok (https)"
  elif curl -fsS --max-time 15 "http://$host/" >/dev/null 2>&1; then
    echo "  $host: ok (http; TLS ainda não emitido)"
  else
    echo "  $host: FALHOU" >&2
    exit 1
  fi
done

echo "$REV $(date -Is)" > "$SHARED/current-release.txt"

printf '\nRelease %s publicada com sucesso.\n  Admin/API: https://%s\n  Site:      https://%s\n  Logs:      pm2 logs socorre-ai-homolog-backend\n' \
  "$REV" "$HOMOLOG_ADMIN_HOST" "$HOMOLOG_SITE_HOST"
