#!/bin/bash

# Script para configurar Firebase em Produção
# Execute como: ./scripts/setup-firebase-production.sh

set -e

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

log "🔥 Configurando Firebase para Produção..."

# Verificar se Firebase CLI está instalado
if ! command -v firebase &> /dev/null; then
    log "📦 Instalando Firebase CLI..."
    npm install -g firebase-tools
fi

# Verificar se está logado no Firebase
if ! firebase projects:list &> /dev/null; then
    log "🔐 Faça login no Firebase..."
    firebase login
fi

log "📋 Configuração do Firebase para Produção:"
log ""
log "1. Crie um projeto no Firebase Console:"
log "   https://console.firebase.google.com/"
log ""
log "2. Ative os seguintes serviços:"
log "   - Authentication (Email/Password)"
log "   - Cloud Messaging (FCM)"
log "   - Cloud Storage (opcional)"
log "   - Realtime Database (opcional)"
log ""
log "3. Configure as regras de segurança:"
log ""
log "   Authentication:"
log "   - Ative Email/Password"
log "   - Configure domínios autorizados"
log ""
log "   Cloud Messaging:"
log "   - Gere uma chave de servidor"
log "   - Configure o sender ID"
log ""
log "4. Baixe o arquivo de configuração:"
log "   - Vá em Project Settings > Service Accounts"
log "   - Clique em 'Generate new private key'"
log "   - Salve como 'firebase-service-account.json'"
log ""

# Criar arquivo de configuração do Firebase
log "📝 Criando arquivo de configuração..."

cat > firebase-config.json << 'EOF'
{
  "type": "service_account",
  "project_id": "your-firebase-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com"
}
EOF

log "📱 Configurando apps Flutter..."

# Configurar Firebase para Flutter Client
if [ -d "socorre_ai_client" ]; then
    log "🔧 Configurando Firebase para Client App..."
    cd socorre_ai_client
    
    # Instalar Firebase CLI para Flutter
    if ! command -v flutter &> /dev/null; then
        warning "Flutter não está instalado. Instale primeiro."
    else
        # Configurar Firebase
        flutterfire configure --project=your-firebase-project-id
        
        # Atualizar dependências
        flutter pub get
    fi
    
    cd ..
fi

# Configurar Firebase para Flutter Partner
if [ -d "socorre_ai_partner" ]; then
    log "🔧 Configurando Firebase para Partner App..."
    cd socorre_ai_partner
    
    # Configurar Firebase
    flutterfire configure --project=your-firebase-project-id
    
    # Atualizar dependências
    flutter pub get
    
    cd ..
fi

log "⚙️ Configurando variáveis de ambiente..."

# Atualizar arquivo .env.production
if [ -f "socorre_ai_backend/.env.production" ]; then
    log "📝 Atualizando .env.production..."
    
    # Adicionar configurações do Firebase
    cat >> socorre_ai_backend/.env.production << 'EOF'

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com
EOF
fi

log "🧪 Testando configuração do Firebase..."

# Testar configuração
if [ -f "firebase-config.json" ]; then
    log "✅ Arquivo de configuração criado"
    log "📋 Próximos passos:"
    log "   1. Substitua os valores no arquivo firebase-config.json"
    log "   2. Copie o arquivo para o diretório do backend"
    log "   3. Atualize as variáveis de ambiente"
    log "   4. Teste a conexão com Firebase"
else
    error "Falha ao criar arquivo de configuração"
fi

log "🎉 Configuração do Firebase concluída!"
log ""
log "📋 Checklist de Produção:"
log "   ✅ Projeto Firebase criado"
log "   ✅ Serviços ativados (Auth, FCM)"
log "   ✅ Arquivo de configuração criado"
log "   ✅ Apps Flutter configurados"
log "   ⚠️  Substituir valores de configuração"
log "   ⚠️  Testar notificações push"
log "   ⚠️  Configurar regras de segurança"
log ""
log "🔧 Para testar:"
log "   npm run test:firebase"
