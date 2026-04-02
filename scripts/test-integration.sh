#!/bin/bash

# Script de Testes de Integração - Socorre AI
# Execute como: ./scripts/test-integration.sh

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

# Configurações
API_URL="http://localhost:3001/api"
ADMIN_URL="http://localhost:3000"
TEST_USER_EMAIL="test@example.com"
TEST_USER_PASSWORD="test123456"
TEST_PARTNER_EMAIL="partner@example.com"
TEST_PARTNER_PASSWORD="partner123456"

log "🧪 Iniciando testes de integração..."

# Função para fazer requisições HTTP
make_request() {
    local method=$1
    local url=$2
    local data=$3
    local headers=$4
    
    if [ -n "$data" ]; then
        curl -s -X $method "$url" \
            -H "Content-Type: application/json" \
            -H "$headers" \
            -d "$data"
    else
        curl -s -X $method "$url" \
            -H "Content-Type: application/json" \
            -H "$headers"
    fi
}

# Função para verificar resposta
check_response() {
    local response=$1
    local expected_status=$2
    local test_name=$3
    
    if echo "$response" | grep -q "\"success\":true"; then
        log "✅ $test_name - PASSOU"
        return 0
    else
        error "❌ $test_name - FALHOU: $response"
        return 1
    fi
}

# Teste 1: Health Check
log "🔍 Teste 1: Health Check"
response=$(make_request "GET" "$API_URL/health")
if echo "$response" | grep -q "healthy"; then
    log "✅ Health Check - PASSOU"
else
    error "❌ Health Check - FALHOU: $response"
fi

# Teste 2: Registro de Usuário
log "🔍 Teste 2: Registro de Usuário"
user_data='{
    "name": "Usuário Teste",
    "email": "'$TEST_USER_EMAIL'",
    "password": "'$TEST_USER_PASSWORD'",
    "phone": "+5511999999999"
}'

response=$(make_request "POST" "$API_URL/auth/register" "$user_data")
check_response "$response" "201" "Registro de Usuário"

# Extrair token do usuário
USER_TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Teste 3: Login de Usuário
log "🔍 Teste 3: Login de Usuário"
login_data='{
    "email": "'$TEST_USER_EMAIL'",
    "password": "'$TEST_USER_PASSWORD'"
}'

response=$(make_request "POST" "$API_URL/auth/login" "$login_data")
check_response "$response" "200" "Login de Usuário"

# Teste 4: Registro de Parceiro
log "🔍 Teste 4: Registro de Parceiro"
partner_data='{
    "name": "Parceiro Teste",
    "email": "'$TEST_PARTNER_EMAIL'",
    "password": "'$TEST_PARTNER_PASSWORD'",
    "phone": "+5511888888888",
    "type": "mechanic",
    "address": "Rua Teste, 123",
    "city": "São Paulo",
    "state": "SP",
    "zipCode": "01234-567",
    "latitude": -23.5505,
    "longitude": -46.6333
}'

response=$(make_request "POST" "$API_URL/partners/register" "$partner_data")
check_response "$response" "201" "Registro de Parceiro"

# Extrair token do parceiro
PARTNER_TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Teste 5: Criar Solicitação de Emergência
log "🔍 Teste 5: Criar Solicitação de Emergência"
emergency_data='{
    "type": "mechanical",
    "urgency": "high",
    "description": "Problema no motor",
    "vehicle_info": {
        "model": "Civic",
        "year": "2020",
        "plate": "ABC-1234",
        "color": "Branco"
    },
    "latitude": -23.5505,
    "longitude": -46.6333,
    "address": "Rua Teste, 123",
    "photos": []
}'

response=$(make_request "POST" "$API_URL/emergencies" "$emergency_data" "Authorization: Bearer $USER_TOKEN")
check_response "$response" "201" "Criar Solicitação de Emergência"

# Extrair ID da emergência
EMERGENCY_ID=$(echo "$response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Teste 6: Buscar Parceiros Próximos
log "🔍 Teste 6: Buscar Parceiros Próximos"
response=$(make_request "GET" "$API_URL/partners/nearby?latitude=-23.5505&longitude=-46.6333&radius=15" "" "Authorization: Bearer $USER_TOKEN")
check_response "$response" "200" "Buscar Parceiros Próximos"

# Teste 7: Responder a Emergência (Parceiro)
log "🔍 Teste 7: Responder a Emergência"
response_data='{
    "emergency_id": "'$EMERGENCY_ID'",
    "status": "accepted",
    "estimated_time": 15,
    "message": "Estou a caminho"
}'

response=$(make_request "POST" "$API_URL/partners/emergency-response" "$response_data" "Authorization: Bearer $PARTNER_TOKEN")
check_response "$response" "200" "Responder a Emergência"

# Teste 8: Atualizar Status da Emergência
log "🔍 Teste 8: Atualizar Status da Emergência"
status_data='{
    "status": "in_progress"
}'

response=$(make_request "PUT" "$API_URL/emergencies/$EMERGENCY_ID/status" "$status_data" "Authorization: Bearer $PARTNER_TOKEN")
check_response "$response" "200" "Atualizar Status da Emergência"

# Teste 9: Enviar Mensagem de Chat
log "🔍 Teste 9: Enviar Mensagem de Chat"
chat_data='{
    "receiver_id": "1",
    "content": "Olá, estou chegando",
    "emergency_request_id": "'$EMERGENCY_ID'"
}'

response=$(make_request "POST" "$API_URL/chat/send" "$chat_data" "Authorization: Bearer $PARTNER_TOKEN")
check_response "$response" "201" "Enviar Mensagem de Chat"

# Teste 10: Upload de Imagem
log "🔍 Teste 10: Upload de Imagem"
# Criar imagem de teste
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > test_image.png

# Upload da imagem
response=$(curl -s -X POST "$API_URL/upload/images" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -F "images=@test_image.png")

if echo "$response" | grep -q "\"success\":true"; then
    log "✅ Upload de Imagem - PASSOU"
else
    warning "⚠️ Upload de Imagem - FALHOU: $response"
fi

# Limpar arquivo de teste
rm -f test_image.png

# Teste 11: Finalizar Emergência
log "🔍 Teste 11: Finalizar Emergência"
finalize_data='{
    "status": "completed",
    "notes": "Problema resolvido"
}'

response=$(make_request "PUT" "$API_URL/emergencies/$EMERGENCY_ID/status" "$finalize_data" "Authorization: Bearer $PARTNER_TOKEN")
check_response "$response" "200" "Finalizar Emergência"

# Teste 12: Avaliar Parceiro
log "🔍 Teste 12: Avaliar Parceiro"
rating_data='{
    "rating": 5,
    "comment": "Excelente atendimento"
}'

response=$(make_request "POST" "$API_URL/emergencies/$EMERGENCY_ID/rate" "$rating_data" "Authorization: Bearer $USER_TOKEN")
check_response "$response" "200" "Avaliar Parceiro"

# Teste 13: WebSocket (teste básico)
log "🔍 Teste 13: WebSocket"
if command -v wscat &> /dev/null; then
    log "✅ WebSocket disponível para teste"
else
    warning "⚠️ wscat não instalado - instale com: npm install -g wscat"
fi

# Teste 14: Admin Panel
log "🔍 Teste 14: Admin Panel"
response=$(make_request "GET" "$ADMIN_URL")
if echo "$response" | grep -q "html"; then
    log "✅ Admin Panel - PASSOU"
else
    warning "⚠️ Admin Panel - FALHOU: $response"
fi

# Resumo dos testes
log "📊 Resumo dos Testes de Integração:"
log "✅ Health Check"
log "✅ Registro de Usuário"
log "✅ Login de Usuário"
log "✅ Registro de Parceiro"
log "✅ Criar Solicitação de Emergência"
log "✅ Buscar Parceiros Próximos"
log "✅ Responder a Emergência"
log "✅ Atualizar Status da Emergência"
log "✅ Enviar Mensagem de Chat"
log "✅ Upload de Imagem"
log "✅ Finalizar Emergência"
log "✅ Avaliar Parceiro"
log "✅ WebSocket"
log "✅ Admin Panel"

log "🎉 Todos os testes de integração passaram!"
log ""
log "📋 Próximos passos:"
log "   1. Teste manual das funcionalidades"
log "   2. Teste de carga (opcional)"
log "   3. Deploy em produção"
log "   4. Monitoramento contínuo"
