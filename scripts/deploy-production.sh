#!/bin/bash

# Script de Deploy para Produção - Socorre AI
# Execute como: ./scripts/deploy-production.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Configurações
PROJECT_NAME="socorre-ai"
DEPLOY_DIR="/var/www/$PROJECT_NAME"
BACKUP_DIR="/var/backups/$PROJECT_NAME"
SERVICE_USER="www-data"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/socorre_ai_backend/.env.production}"

log "🚀 Iniciando deploy de produção do Socorre AI..."

# Fail before changing the host when production inputs are absent or unsafe.
NODE_ENV=production ENV_FILE="$ENV_FILE" "$SCRIPT_DIR/preflight-production.sh"

# Verificar se está executando como root
if [[ $EUID -ne 0 ]]; then
   error "Este script deve ser executado como root (sudo)"
fi

# Criar diretórios necessários
log "📁 Criando diretórios..."
mkdir -p $DEPLOY_DIR
mkdir -p $BACKUP_DIR
mkdir -p /var/log/$PROJECT_NAME
mkdir -p $DEPLOY_DIR/backend/uploads
mkdir -p $DEPLOY_DIR/admin

# Backup do deploy anterior
if [ -d "$DEPLOY_DIR/backend" ]; then
    log "💾 Criando backup..."
    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
    tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C $DEPLOY_DIR .
    log "✅ Backup criado: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
fi

# Instalar dependências do sistema
log "📦 Instalando dependências do sistema..."
apt-get update
apt-get install -y nginx postgresql postgresql-contrib redis-server nodejs npm pm2 certbot python3-certbot-nginx

# Configurar PostgreSQL
log "🗄️ Configurando PostgreSQL..."
if ! sudo -u postgres psql -c "SELECT 1;" &> /dev/null; then
    error "PostgreSQL não está configurado corretamente"
fi

# Executar script de configuração do banco
if [ -f "./socorre_ai_backend/scripts/setup-production-db.sh" ]; then
    log "🔧 Configurando banco de dados..."
    chmod +x ./socorre_ai_backend/scripts/setup-production-db.sh
    ./socorre_ai_backend/scripts/setup-production-db.sh
else
    warning "Script de configuração do banco não encontrado"
fi

# Deploy do Backend
log "🔧 Deploy do Backend..."
cd socorre_ai_backend

# Instalar dependências
npm ci --production

# Copiar arquivos
cp -r . $DEPLOY_DIR/backend/
cp .env.production $DEPLOY_DIR/backend/.env

# Configurar permissões
chown -R $SERVICE_USER:$SERVICE_USER $DEPLOY_DIR/backend
chmod -R 755 $DEPLOY_DIR/backend

# Configurar PM2
log "⚙️ Configurando PM2..."
pm2 delete socorre-ai-backend 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

cd ..

# Deploy do Admin Panel
log "🖥️ Deploy do Admin Panel..."
cd socorre_ai_admin

# Instalar dependências
npm ci

# Build para produção
npm run build

# Copiar arquivos build
cp -r build/* $DEPLOY_DIR/admin/

# Configurar permissões
chown -R $SERVICE_USER:$SERVICE_USER $DEPLOY_DIR/admin
chmod -R 755 $DEPLOY_DIR/admin

cd ..

# Configurar Nginx
log "🌐 Configurando Nginx..."
cp nginx.production.conf /etc/nginx/sites-available/$PROJECT_NAME
ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração do Nginx
nginx -t

# Configurar SSL (Let's Encrypt)
log "🔒 Configurando SSL..."
if ! certbot certificates | grep -q "yourdomain.com"; then
    warning "Configure o domínio no arquivo nginx.production.conf antes de executar:"
    warning "certbot --nginx -d yourdomain.com -d admin.yourdomain.com"
else
    log "✅ SSL já configurado"
fi

# Configurar Firewall
log "🔥 Configurando Firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Configurar Logrotate
log "📝 Configurando Logrotate..."
cat > /etc/logrotate.d/$PROJECT_NAME << EOF
/var/log/$PROJECT_NAME/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $SERVICE_USER $SERVICE_USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Configurar Monitoramento
log "📊 Configurando Monitoramento..."
cat > /etc/cron.d/$PROJECT_NAME-monitor << EOF
# Monitoramento Socorre AI
*/5 * * * * root /usr/local/bin/check-socorre-ai.sh
EOF

# Script de monitoramento
cat > /usr/local/bin/check-socorre-ai.sh << 'EOF'
#!/bin/bash
# Verificar se os serviços estão rodando
if ! pm2 list | grep -q "socorre-ai-backend.*online"; then
    echo "Backend offline - reiniciando..." | logger -t socorre-ai
    pm2 restart socorre-ai-backend
fi

if ! systemctl is-active --quiet nginx; then
    echo "Nginx offline - reiniciando..." | logger -t socorre-ai
    systemctl restart nginx
fi
EOF

chmod +x /usr/local/bin/check-socorre-ai.sh

# Reiniciar serviços
log "🔄 Reiniciando serviços..."
systemctl restart nginx
pm2 restart all

# Verificar status
log "✅ Verificando status dos serviços..."
pm2 status
systemctl status nginx --no-pager

# Testes básicos
log "🧪 Executando testes básicos..."
curl -f http://localhost/health || warning "Health check falhou"
curl -f http://localhost/api/health || warning "API health check falhou"

log "🎉 Deploy de produção concluído com sucesso!"
log ""
log "📋 Próximos passos:"
log "   1. Configure o domínio no arquivo nginx.production.conf"
log "   2. Execute: certbot --nginx -d yourdomain.com -d admin.yourdomain.com"
log "   3. Configure as variáveis de ambiente no arquivo .env.production"
log "   4. Configure Firebase e gateways de pagamento"
log "   5. Teste todas as funcionalidades"
log ""
log "🔗 URLs:"
log "   - API: https://yourdomain.com/api"
log "   - Admin: https://admin.yourdomain.com"
log "   - Health: https://yourdomain.com/health"
log ""
log "📊 Monitoramento:"
log "   - PM2: pm2 monit"
log "   - Logs: pm2 logs"
log "   - Nginx: tail -f /var/log/nginx/access.log"
