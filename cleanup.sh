#!/bin/bash

echo "🧹 Socorre AI Cleanup Script"
echo "============================"

# Stop and remove Docker containers
echo "🛑 Stopping Docker services..."
docker-compose -f docker-compose-simple.yml down

# Remove Docker volumes (optional - removes all data)
if [ "$1" = "--full" ]; then
    echo "🗑️ Removing Docker volumes (this will delete all data)..."
    docker volume rm socorre-system_postgres_data socorre-system_redis_data
fi

# Remove node_modules directories (optional)
if [ "$1" = "--clean" ]; then
    echo "🗑️ Removing node_modules directories..."
    rm -rf socorre_ai_backend/node_modules socorre_ai_admin/node_modules
fi

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Usage options:"
echo "  ./cleanup.sh           - Stop services only"
echo "  ./cleanup.sh --full    - Stop services and remove volumes (data loss)"
echo "  ./cleanup.sh --clean   - Stop services and remove node_modules"
echo ""
echo "To start again: ./quick-start.sh"