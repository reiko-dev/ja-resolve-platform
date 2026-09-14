#!/bin/bash

# Script para configurar banco de dados de produção
# Execute como: ./scripts/setup-production-db.sh

set -e

echo "🚀 Configurando banco de dados de produção..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Verificar se PostgreSQL está instalado
if ! command -v psql &> /dev/null; then
    error "PostgreSQL não está instalado. Instale primeiro."
fi

# Verificar se o usuário tem permissões
if ! sudo -u postgres psql -c "SELECT 1;" &> /dev/null; then
    error "Usuário não tem permissões para acessar PostgreSQL. Execute com sudo ou configure permissões."
fi

if ! command -v openssl &> /dev/null; then
    error "OpenSSL não está instalado; não é seguro gerar credenciais de produção."
fi

# Configurações do banco
DB_NAME="socorre_ai_production"
DB_USER="socorre_ai_user"
DB_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"

log "Criando banco de dados de produção..."

# Criar banco de dados
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" || warning "Banco de dados já existe"

# Criar usuário; a senha segue por stdin e nunca como argumento do processo.
printf "CREATE USER %s WITH PASSWORD '%s';\n" "$DB_USER" "$DB_PASSWORD" | sudo -u postgres psql || warning "Usuário já existe"

# Conceder permissões
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"

log "Executando migrações..."

# Executar migrações
cd "$(dirname "$0")/.."
npm run migrate:prod

log "Executando seeds..."

# Executar seeds
npm run seed:prod

log "Criando arquivo de configuração..."

# Criar arquivo .env.production
cat > .env.production << EOF
NODE_ENV=production
PORT=3001

# Banco de Dados PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com

# Upload de Imagens
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,webp

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Platform Settings
PLATFORM_FEE_PERCENTAGE=0.05
PLATFORM_NAME=Socorre AI
PLATFORM_URL=https://yourdomain.com

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=$SESSION_SECRET
EOF

chmod 600 .env.production

log "✅ Banco de dados de produção configurado com sucesso!"
log ""
log "⚠️  IMPORTANTE:"
log "   1. Salve as credenciais em local seguro"
log "   2. Configure as variáveis de ambiente adicionais"
log "   3. Configure Firebase e gateways de pagamento"
log "   4. Teste a conexão antes de fazer deploy"
log ""
log "🔧 Para testar a conexão:"
log "   npm run test:db"
