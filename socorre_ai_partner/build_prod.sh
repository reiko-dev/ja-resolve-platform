#!/bin/bash
# Script para build em PRODUÇÃO (servidor)

echo "🚀 Building APP PARCEIRO - PRODUÇÃO"
echo "🌍 Conectará em: https://admin.socorreja.com.br/api"

flutter build apk --release --dart-define=ENV=production

echo ""
echo "✅ Build concluído!"
echo "📱 APK em: build/app/outputs/flutter-apk/app-release.apk"

