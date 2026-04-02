#!/bin/bash
# Script para rodar em DESENVOLVIMENTO (localhost)

echo "🚀 Running APP CLIENTE - DESENVOLVIMENTO"
echo "🌍 Conectará em: http://192.168.15.4:3000/api"

flutter run --dart-define=ENV=development

