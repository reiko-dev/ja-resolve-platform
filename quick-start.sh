#!/bin/bash

set -euo pipefail

COMPOSE_FILE="docker-compose-simple.yml"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5433}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"

echo "🚀 Socorre AI Quick Start Setup"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if required files exist
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ $COMPOSE_FILE not found"
    exit 1
fi

# Create backend environment file if it doesn't exist
if [ ! -f "socorre_ai_backend/.env" ]; then
    echo "📝 Creating backend environment file..."
    cp socorre_ai_backend/env.example socorre_ai_backend/.env
    echo "✅ Created socorre_ai_backend/.env"
fi

# Start all services using simple configuration
echo "🐘 Starting all services with Docker..."
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 20

# Display status
echo ""
echo "✅ Socorre AI Services Started"
echo "=============================="
echo "🌐 Admin Panel: http://localhost:3000"
echo "🔗 Backend API: $BACKEND_URL"
echo "🐘 PostgreSQL: localhost:$POSTGRES_HOST_PORT"
echo "🔴 Redis: localhost:6379"
echo ""
echo "📱 To run mobile apps:"
echo "   cd socorre_ai_client && flutter run"
echo "   cd socorre_ai_partner && flutter run"
echo ""
echo "📊 View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "🛑 Stop services: docker-compose -f $COMPOSE_FILE down"

# Check if services are running
echo ""
echo "🔍 Checking service status..."
docker-compose -f "$COMPOSE_FILE" ps

# Test backend health endpoint
echo ""
echo "🧪 Testing backend health..."
if curl -fsS "$BACKEND_URL/health" > /dev/null; then
    echo "✅ Backend API is responding correctly"
else
    echo "❌ Backend API is not responding"
    exit 1
fi
