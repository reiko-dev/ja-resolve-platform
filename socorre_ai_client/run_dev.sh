#!/bin/bash
# Script para rodar em DESENVOLVIMENTO (rede local)

set -euo pipefail

LOCAL_IP="${LOCAL_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"

if [ -z "$LOCAL_IP" ]; then
  echo "❌ Não foi possível detectar o IP local automaticamente."
  echo "   Rode assim: LOCAL_IP=192.168.x.x ./run_dev.sh"
  exit 1
fi

API_BASE_URL="http://$LOCAL_IP:3001/api"

echo "🚀 Running APP CLIENTE - DESENVOLVIMENTO"
echo "🌍 Conectará em: $API_BASE_URL"

flutter run \
  --dart-define=ENV=development \
  --dart-define=API_BASE_URL="$API_BASE_URL"
