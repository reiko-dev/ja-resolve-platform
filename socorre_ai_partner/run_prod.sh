#!/bin/bash
# Script para rodar em PRODUÇÃO (servidor)

echo "🚀 Running APP PARCEIRO - PRODUÇÃO"
echo "🌍 Conectará em: https://admin.socorreja.com.br/api"

flutter run --dart-define=ENV=production

