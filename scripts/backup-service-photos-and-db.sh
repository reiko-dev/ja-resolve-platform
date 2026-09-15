#!/usr/bin/env bash
#
# G2 — backup real das fotos privadas de guincho + banco PostgreSQL.
#
# Contrato (docs/gauntlet/TASKSPEC-G2.yaml): backup do diretório local privado
# (SERVICE_PHOTO_STORAGE_DIR) e do banco, sem bucket externo, com verificação de
# integridade e falha explícita. O script NUNCA remove a origem: só escreve no
# próprio subdiretório de backups e só publica o diretório final depois de
# dump + arquivo tar + manifesto SHA-256 verificados.
#
# Uso:
#   SERVICE_PHOTO_STORAGE_DIR=/var/lib/socorre-ai/private/service-photos \
#   BACKUP_DIR=/var/backups/socorre-ai \
#   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/socorre_ai \
#   scripts/backup-service-photos-and-db.sh
#
# Alternativa sem DATABASE_URL: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
# Opcionais: BACKUP_RETENTION_DAYS (0 = desativado), PG_DUMP/PG_RESTORE/TAR.
#
set -Eeuo pipefail

log() { printf '[backup-service-photos] %s\n' "$*" >&2; }
fail() { log "ERRO: $*"; exit 1; }

on_error() {
  local line="$1"
  log "ERRO inesperado na linha ${line}; backup abortado (origem intacta)"
  exit 1
}
trap 'on_error "$LINENO"' ERR

PHOTO_DIR="${SERVICE_PHOTO_STORAGE_DIR:-}"
BACKUP_DIR="${BACKUP_DIR:-}"
DATABASE_URL="${DATABASE_URL:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"

PG_DUMP_BIN="${PG_DUMP:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE:-pg_restore}"
TAR_BIN="${TAR:-tar}"

if [ -z "$PHOTO_DIR" ]; then
  fail "SERVICE_PHOTO_STORAGE_DIR não definido"
fi
if [ -z "$BACKUP_DIR" ]; then
  fail "BACKUP_DIR não definido"
fi

PHOTO_DIR="${PHOTO_DIR%/}"
BACKUP_DIR="${BACKUP_DIR%/}"

if [ -L "$PHOTO_DIR" ]; then
  fail "SERVICE_PHOTO_STORAGE_DIR não pode ser um symlink: $PHOTO_DIR"
fi
if [ ! -d "$PHOTO_DIR" ]; then
  fail "diretório de fotos inexistente: $PHOTO_DIR"
fi
if [ ! -r "$PHOTO_DIR" ]; then
  fail "diretório de fotos sem permissão de leitura: $PHOTO_DIR"
fi

command -v "$PG_DUMP_BIN" >/dev/null 2>&1 || fail "pg_dump não encontrado ($PG_DUMP_BIN)"
command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 || fail "pg_restore não encontrado ($PG_RESTORE_BIN)"
command -v "$TAR_BIN" >/dev/null 2>&1 || fail "tar não encontrado ($TAR_BIN)"

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_BIN="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA256_BIN="shasum -a 256"
else
  fail "sha256sum/shasum não encontrado para o manifesto de integridade"
fi

# Conexão do banco: DATABASE_URL ou variáveis DB_*.
DB_ARGS=()
if [ -n "$DATABASE_URL" ]; then
  DB_ARGS=(--dbname="$DATABASE_URL")
else
  if [ -z "${DB_NAME:-}" ]; then
    fail "defina DATABASE_URL ou DB_NAME/DB_USER para o dump do PostgreSQL"
  fi
  DB_ARGS=(
    --host="${DB_HOST:-127.0.0.1}"
    --port="${DB_PORT:-5432}"
    --username="${DB_USER:-postgres}"
    --dbname="$DB_NAME"
  )
  if [ -n "${DB_PASSWORD:-}" ]; then
    export PGPASSWORD="$DB_PASSWORD"
  fi
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT_BACKUP_DIR="$BACKUP_DIR/photos-and-db"
FINAL_DIR="$ROOT_BACKUP_DIR/$TIMESTAMP"
WORK_DIR="$ROOT_BACKUP_DIR/.${TIMESTAMP}.partial.$$"

mkdir -p "$ROOT_BACKUP_DIR"
chmod 0700 "$ROOT_BACKUP_DIR" 2>/dev/null || true
mkdir -p "$WORK_DIR"
chmod 0700 "$WORK_DIR"

cleanup_incomplete() {
  if [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap 'cleanup_incomplete; on_error "$LINENO"' ERR

log "dump do PostgreSQL"
"$PG_DUMP_BIN" "${DB_ARGS[@]}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$WORK_DIR/database.dump"
"$PG_RESTORE_BIN" --list "$WORK_DIR/database.dump" >/dev/null
log "dump verificado: $(du -h "$WORK_DIR/database.dump" | cut -f1)"

log "arquivando fotos privadas de $PHOTO_DIR"
PHOTO_PARENT="$(dirname "$PHOTO_DIR")"
PHOTO_BASENAME="$(basename "$PHOTO_DIR")"
"$TAR_BIN" -C "$PHOTO_PARENT" -czf "$WORK_DIR/service-photos.tar.gz" "$PHOTO_BASENAME"
"$TAR_BIN" -tzf "$WORK_DIR/service-photos.tar.gz" >/dev/null
log "arquivo de fotos verificado: $(du -h "$WORK_DIR/service-photos.tar.gz" | cut -f1)"

log "gerando e conferindo manifesto SHA-256"
(
  cd "$WORK_DIR"
  $SHA256_BIN database.dump service-photos.tar.gz > SHA256SUMS
  $SHA256_BIN -c SHA256SUMS >/dev/null
)

# Só publica o diretório final com dump + tar + manifesto íntegros.
mv "$WORK_DIR" "$FINAL_DIR"
trap 'on_error "$LINENO"' ERR

if [ "$BACKUP_RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  log "removendo backups com mais de ${BACKUP_RETENTION_DAYS} dia(s) em $ROOT_BACKUP_DIR"
  find "$ROOT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' \
    -mtime "+$BACKUP_RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true
fi

log "backup concluído: $FINAL_DIR"
printf '%s\n' "$FINAL_DIR"
