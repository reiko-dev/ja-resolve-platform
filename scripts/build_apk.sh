#!/bin/bash

echo "🚀 Gerando APK Android Release para Socorre Ai..."

# Limpar builds anteriores
echo "🧹 Limpando builds anteriores..."
flutter clean

# Obter dependências
echo "📦 Obtendo dependências..."
flutter pub get

# Gerar APK release
echo "🔨 Gerando APK release..."
flutter build apk --release

# Verificar se o build foi bem-sucedido
if [ $? -eq 0 ]; then
    echo "✅ APK gerado com sucesso!"
    echo "📱 APK localizado em: build/app/outputs/flutter-apk/app-release.apk"
    echo "📏 Tamanho do APK:"
    ls -lh build/app/outputs/flutter-apk/app-release.apk
else
    echo "❌ Erro ao gerar APK"
    exit 1
fi
