#!/bin/bash

echo "🚀 INICIANDO DEPLOY PARA admin.socorreja.com.br"
echo "================================================"

# Configurações
VPS_HOST="root@72.60.59.91"
VPS_PATH="/var/www/socorre_ai"
ADMIN_DOMAIN="admin.socorreja.com.br"

echo "📦 Preparando arquivos para deploy..."

# Criar diretório temporário
mkdir -p deploy_temp
cd deploy_temp

# Copiar backend
echo "📁 Copiando backend..."
cp -r ../socorre_ai_backend ./backend
cd backend
rm -rf node_modules package-lock.json .git
cd ..

# Copiar admin build
echo "📁 Copiando admin build..."
cp -r ../socorre_ai_admin/build ./admin

# Criar arquivo de configuração PM2
echo "⚙️ Criando configuração PM2..."
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'socorre-ai-backend',
    script: 'src/server.js',
    cwd: '/var/www/socorre_ai/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
EOF

# Criar arquivo de configuração Nginx
echo "🌐 Criando configuração Nginx..."
cat > nginx.conf << 'EOF'
server {
    listen 80;
    server_name admin.socorreja.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.socorreja.com.br;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/admin.socorreja.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.socorreja.com.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Admin Frontend (Static Files)
    location / {
        root /var/www/socorre_ai/admin;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF

# Criar arquivo de instalação
echo "📋 Criando script de instalação..."
cat > install.sh << 'EOF'
#!/bin/bash

echo "🔧 INSTALANDO SOCORRE AI NA VPS"
echo "================================"

# Atualizar sistema
echo "📦 Atualizando sistema..."
apt update && apt upgrade -y

# Instalar Node.js 18
echo "📦 Instalando Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Instalar PM2
echo "📦 Instalando PM2..."
npm install -g pm2

# Instalar Nginx
echo "📦 Instalando Nginx..."
apt install -y nginx

# Instalar Certbot
echo "📦 Instalando Certbot..."
apt install -y certbot python3-certbot-nginx

# Criar diretório da aplicação
echo "📁 Criando diretórios..."
mkdir -p /var/www/socorre_ai
chown -R www-data:www-data /var/www/socorre_ai

# Instalar dependências do backend
echo "📦 Instalando dependências do backend..."
cd /var/www/socorre_ai/backend
npm install --production

# Configurar Nginx
echo "🌐 Configurando Nginx..."
cp /var/www/socorre_ai/nginx.conf /etc/nginx/sites-available/socorre_ai
ln -sf /etc/nginx/sites-available/socorre_ai /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar configuração Nginx
nginx -t

# Reiniciar Nginx
systemctl restart nginx
systemctl enable nginx

# Configurar SSL
echo "🔒 Configurando SSL..."
certbot --nginx -d admin.socorreja.com.br --non-interactive --agree-tos --email admin@socorreja.com.br

# Iniciar aplicação com PM2
echo "🚀 Iniciando aplicação..."
cd /var/www/socorre_ai
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo "🌐 Acesse: https://admin.socorreja.com.br"
echo "📊 PM2 Status: pm2 status"
echo "📝 Logs: pm2 logs"
EOF

# Criar arquivo de atualização
echo "📋 Criando script de atualização..."
cat > update.sh << 'EOF'
#!/bin/bash

echo "🔄 ATUALIZANDO SOCORRE AI"
echo "=========================="

cd /var/www/socorre_ai

# Parar aplicação
echo "⏹️ Parando aplicação..."
pm2 stop socorre-ai-backend

# Fazer backup
echo "💾 Fazendo backup..."
cp -r backend backend_backup_$(date +%Y%m%d_%H%M%S)

# Atualizar arquivos
echo "📁 Atualizando arquivos..."
rm -rf backend admin
cp -r /tmp/socorre_ai_deploy/backend ./
cp -r /tmp/socorre_ai_deploy/admin ./

# Instalar dependências
echo "📦 Instalando dependências..."
cd backend
npm install --production

# Reiniciar aplicação
echo "🚀 Reiniciando aplicação..."
cd ..
pm2 start ecosystem.config.js
pm2 save

echo "✅ ATUALIZAÇÃO CONCLUÍDA!"
echo "📊 Status: pm2 status"
EOF

# Criar arquivo de backup do banco
echo "💾 Criando script de backup..."
cat > backup_db.sh << 'EOF'
#!/bin/bash

echo "💾 BACKUP DO BANCO DE DADOS"
echo "============================"

BACKUP_DIR="/var/backups/socorre_ai"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "📦 Fazendo backup do banco..."
pg_dump -U socorre_user -h localhost socorre_db > $BACKUP_DIR/socorre_db_$DATE.sql

echo "🗜️ Comprimindo backup..."
gzip $BACKUP_DIR/socorre_db_$DATE.sql

echo "🧹 Limpando backups antigos (mantendo últimos 7 dias)..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "✅ Backup concluído: $BACKUP_DIR/socorre_db_$DATE.sql.gz"
EOF

# Criar arquivo de monitoramento
echo "📊 Criando script de monitoramento..."
cat > monitor.sh << 'EOF'
#!/bin/bash

echo "📊 MONITORAMENTO SOCORRE AI"
echo "============================"

echo "🖥️ Status do sistema:"
uptime
free -h
df -h

echo ""
echo "🚀 Status da aplicação:"
pm2 status

echo ""
echo "🌐 Status do Nginx:"
systemctl status nginx --no-pager -l

echo ""
echo "🗄️ Status do PostgreSQL:"
systemctl status postgresql --no-pager -l

echo ""
echo "📈 Logs recentes:"
pm2 logs --lines 10
EOF

# Criar arquivo de logs
echo "📝 Criando script de logs..."
cat > logs.sh << 'EOF'
#!/bin/bash

echo "📝 LOGS SOCORRE AI"
echo "==================="

echo "Escolha uma opção:"
echo "1) Logs da aplicação (PM2)"
echo "2) Logs do Nginx"
echo "3) Logs do sistema"
echo "4) Logs do PostgreSQL"
echo "5) Todos os logs"

read -p "Opção: " choice

case $choice in
    1)
        pm2 logs --lines 50
        ;;
    2)
        tail -f /var/log/nginx/access.log
        ;;
    3)
        journalctl -f
        ;;
    4)
        tail -f /var/log/postgresql/postgresql-*.log
        ;;
    5)
        echo "Logs da aplicação:"
        pm2 logs --lines 20
        echo ""
        echo "Logs do Nginx:"
        tail -20 /var/log/nginx/access.log
        echo ""
        echo "Logs do sistema:"
        journalctl --no-pager -l -n 20
        ;;
    *)
        echo "Opção inválida"
        ;;
esac
EOF

# Tornar scripts executáveis
chmod +x install.sh update.sh backup_db.sh monitor.sh logs.sh

echo "📦 Arquivos preparados com sucesso!"
echo "📁 Diretório: deploy_temp/"
echo ""
echo "🚀 PRÓXIMOS PASSOS:"
echo "1) Copiar arquivos para VPS: scp -r deploy_temp/* $VPS_HOST:/tmp/socorre_ai_deploy/"
echo "2) Conectar na VPS: ssh $VPS_HOST"
echo "3) Executar instalação: bash /tmp/socorre_ai_deploy/install.sh"
echo ""
echo "📋 SCRIPTS DISPONÍVEIS:"
echo "- install.sh: Instalação completa"
echo "- update.sh: Atualização da aplicação"
echo "- backup_db.sh: Backup do banco de dados"
echo "- monitor.sh: Monitoramento do sistema"
echo "- logs.sh: Visualização de logs"
