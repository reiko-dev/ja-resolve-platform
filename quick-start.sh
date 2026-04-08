#!/bin/bash

echo "🚀 Socorre AI Quick Start Setup"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if required files exist
if [ ! -f "docker-compose-simple.yml" ]; then
    echo "❌ docker-compose-simple.yml not found"
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
docker-compose -f docker-compose-simple.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 20

# Display status
echo ""
echo "✅ Socorre AI Services Started"
echo "=============================="
echo "🌐 Admin Panel: http://localhost:3000"
echo "🔗 Backend API: http://localhost:3001"
echo "🐘 PostgreSQL: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo ""
echo "📱 To run mobile apps:"
echo "   cd socorre_ai_client && flutter run"
echo "   cd socorre_ai_partner && flutter run"
echo ""
echo "📊 View logs: docker-compose -f docker-compose-simple.yml logs -f"
echo "🛑 Stop services: docker-compose -f docker-compose-simple.yml down"

# Check if services are running
echo ""
echo "🔍 Checking service status..."
docker-compose -f docker-compose-simple.yml ps

# Test backend health endpoint
echo ""
echo "🧪 Testing backend health..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Backend API is responding correctly"
else
    echo "❌ Backend API is not responding"
fi