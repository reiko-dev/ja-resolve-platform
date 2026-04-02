#!/bin/bash
# Script para build em DESENVOLVIMENTO (localhost)

echo "🚀 Building APP PARCEIRO - DESENVOLVIMENTO"
echo "🌍 Conectará em: http://192.168.15.4:3000/api"

flutter build apk --release --dart-define=ENV=development

echo ""
echo "✅ Build concluído!"
echo "📱 APK em: build/app/outputs/flutter-apk/app-release.apk"

