#!/usr/bin/env bash
# Provisionamento único da VPS (Hostinger) para o ambiente de homologação.
#
# Uso:
#   HOMOLOG_ADMIN_HOST=2-25-216-183.sslip.io \
#   HOMOLOG_SITE_HOST=ja.2-25-216-183.sslip.io \
#   [LETSENCRYPT_EMAIL=voce@dominio] [SKIP_TLS=1] [FORCE_NGINX=1] \
#   ./scripts/homolog/bootstrap-vps.sh
#
# Rodar como usuário deploy (com sudo). Idempotente: pode ser reexecutado.

set -euo pipefail

REPO_DIR="/var/www/socorre-ai/repository"
ROOT="/var/www/socorre-ai"
SHARED="$ROOT/shared"
STAGING="$ROOT/staging"
RELEASES="$ROOT/releases"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="${REPO_URL:-git@github.com:reiko-dev/socorre-ja-platform.git}"
ADMIN_HOST="${HOMOLOG_ADMIN_HOST:-2-25-216-183.sslip.io}"
SITE_HOST="${HOMOLOG_SITE_HOST:-ja.2-25-216-183.sslip.io}"
BRANCH="${HOMOLOG_BRANCH:-main}"
PHP_VER="8.3"
NGINX_SITE="socorre-ai-homolog"
DB_NAME="socorre_ai_homolog"
DB_USER="socorre_homolog"

log() { printf '\n[%s] %s\n' "$(date +'%F %T')" "$1"; }
die() { printf '\n[erro] %s\n' "$1" >&2; exit 1; }

[ "$(id -un)" = "deploy" ] || die "rode como o usuário deploy"
sudo -n true 2>/dev/null || die "o usuário deploy precisa de sudo sem senha"
command -v openssl >/dev/null 2>&1 || die "openssl não encontrado"

log "Instalando pacotes do sistema..."
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  rsync redis-server "php${PHP_VER}-fpm" "php${PHP_VER}-mbstring" "php${PHP_VER}-curl" "php${PHP_VER}-xml" \
  certbot python3-certbot-nginx
sudo systemctl enable --now redis-server >/dev/null
sudo systemctl enable --now "php${PHP_VER}-fpm" >/dev/null

log "Preparando diretórios..."
mkdir -p "$SHARED" "$STAGING/backend" "$STAGING/admin" "$STAGING/site" "$RELEASES"

log "Configurando variáveis de ambiente (segredos gerados só na primeira vez)..."
if [ ! -f "$SHARED/backend.env" ]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > "$SHARED/backend.env" <<EOF
NODE_ENV=production
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://$ADMIN_HOST
PUBLIC_API_URL=https://$ADMIN_HOST
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,webp,pdf
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
FIREBASE_CLIENT_ID=
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
EOF
  chmod 600 "$SHARED/backend.env"
else
  log "backend.env já existe; mantendo credenciais e atualizando hosts"
  sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://$ADMIN_HOST#" "$SHARED/backend.env"
  sed -i "s#^PUBLIC_API_URL=.*#PUBLIC_API_URL=https://$ADMIN_HOST#" "$SHARED/backend.env"
fi

if [ ! -f "$SHARED/site.env" ]; then
  cat > "$SHARED/site.env" <<'EOF'
# SMTP do site Já Resolve (preencher quando o e-mail for contratado)
SMTP_HOST=smtp.hostinger.com
SMTP_USER=contato@jaresolve.com.br
SMTP_PASS=
EOF
  chmod 600 "$SHARED/site.env"
fi

if [ ! -f "$SHARED/admin.env" ]; then
  cat > "$SHARED/admin.env" <<'EOF'
# Chave do Google Maps (Geocoding API) embutida no build do admin
GOOGLE_MAPS_API_KEY=
EOF
  chmod 600 "$SHARED/admin.env"
fi

cat > "$SHARED/homolog.env" <<EOF
HOMOLOG_ADMIN_HOST=$ADMIN_HOST
HOMOLOG_SITE_HOST=$SITE_HOST
HOMOLOG_BRANCH=$BRANCH
EOF

log "Garantindo o repositório em $REPO_DIR..."
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
fi
git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
git -C "$REPO_DIR" checkout -f "$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
git -C "$REPO_DIR" clean -fd

# O bash mantém o descritor do arquivo antigo quando o git substitui este script
# durante a execução; reexecutar garante que a versão publicada seja a usada.
if [ "${BOOTSTRAP_REEXEC:-}" != "1" ]; then
  BOOTSTRAP_REEXEC=1 exec bash "$TEMPLATE_DIR/bootstrap-vps.sh"
fi

log "Configurando banco PostgreSQL de homologação ($DB_NAME)..."
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$SHARED/backend.env" | cut -d= -f2-)"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  printf "CREATE ROLE %s LOGIN PASSWORD '%s';\n" "$DB_USER" "$DB_PASSWORD" | sudo -u postgres psql -q
else
  printf "ALTER ROLE %s WITH LOGIN PASSWORD '%s';\n" "$DB_USER" "$DB_PASSWORD" | sudo -u postgres psql -q
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi
sudo -u postgres psql -q -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -q -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

log "Propagando variáveis do SMTP para o PHP-FPM (site)..."
sudo mkdir -p "/etc/systemd/system/php${PHP_VER}-fpm.service.d"
sudo tee "/etc/systemd/system/php${PHP_VER}-fpm.service.d/override.conf" >/dev/null <<EOF
[Service]
EnvironmentFile=-$SHARED/site.env
EOF
sudo tee "/etc/php/${PHP_VER}/fpm/pool.d/zz-socorre-homolog.conf" >/dev/null <<'EOF'
[www]
env[SMTP_HOST] = $SMTP_HOST
env[SMTP_PORT] = $SMTP_PORT
env[SMTP_USER] = $SMTP_USER
env[SMTP_PASS] = $SMTP_PASS
env[SMTP_FROM_EMAIL] = $SMTP_FROM_EMAIL
env[SMTP_FROM_NAME] = $SMTP_FROM_NAME
env[SMTP_TO_EMAIL] = $SMTP_TO_EMAIL
env[SMTP_TO_NAME] = $SMTP_TO_NAME
EOF
sudo systemctl daemon-reload
sudo systemctl restart "php${PHP_VER}-fpm"

log "Configurando Nginx..."
NGINX_CONF="/etc/nginx/sites-available/$NGINX_SITE"
if [ ! -f "$NGINX_CONF" ] || [ "${FORCE_NGINX:-0}" = "1" ]; then
  sed -e "s/__ADMIN_HOST__/$ADMIN_HOST/g" -e "s/__SITE_HOST__/$SITE_HOST/g" \
    "$TEMPLATE_DIR/nginx-homolog.conf.template" | sudo tee "$NGINX_CONF" >/dev/null
fi
sudo ln -sfn "$NGINX_CONF" "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

log "Registrando o PM2 no boot (usuário deploy)..."
sudo env PATH="$PATH" pm2 startup systemd -u deploy --hp "/home/deploy" >/dev/null 2>&1 || true
pm2 save >/dev/null 2>&1 || true

if [ "${SKIP_TLS:-0}" = "1" ]; then
  log "TLS pulado (SKIP_TLS=1)"
elif sudo test -d "/etc/letsencrypt/live/$ADMIN_HOST"; then
  log "Certificado já existe para $ADMIN_HOST; pulando emissão"
else
  log "Emitindo certificados TLS (Let's Encrypt) para $ADMIN_HOST e $SITE_HOST..."
  if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
    sudo certbot --nginx -d "$ADMIN_HOST" -d "$SITE_HOST" \
      --non-interactive --agree-tos --no-eff-email -m "$LETSENCRYPT_EMAIL" --redirect
  else
    sudo certbot --nginx -d "$ADMIN_HOST" -d "$SITE_HOST" \
      --non-interactive --agree-tos --register-unsafely-without-email --redirect
  fi
fi

log "Garantindo firewall (22/80/443)..."
sudo ufw allow 22/tcp >/dev/null 2>&1 || true
sudo ufw allow 80/tcp >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true

cat <<EOF

Bootstrap concluído.

  Admin/API: https://$ADMIN_HOST
  Site:      https://$SITE_HOST

Próximo passo (primeira release, com dados de demonstração):
  $REPO_DIR/scripts/homolog/deploy-homolog.sh --seed
EOF
