#!/bin/bash

# Glide Development Startup Script
# Starts both the backend API and Expo frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/glide-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Glide Development Environment${NC}"
echo "========================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if PostgreSQL container is running
if ! docker ps | grep -q glide-postgres; then
    echo -e "${YELLOW}Starting PostgreSQL container...${NC}"
    docker run -d \
        --name glide-postgres \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=password \
        -e POSTGRES_DB=glide \
        -p 5432:5432 \
        postgres:15 2>/dev/null || docker start glide-postgres
    sleep 3
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Kill any existing processes on our ports
echo -e "${YELLOW}Checking for existing processes...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Start backend server
echo -e "${YELLOW}Starting backend server...${NC}"
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready at http://localhost:8000${NC}"
        break
    fi
    sleep 1
done

# Start Expo
echo -e "${YELLOW}Starting Expo...${NC}"
npx expo start &
EXPO_PID=$!

echo ""
echo -e "${GREEN}========================================"
echo "Glide is running!"
echo "========================================"
echo -e "Backend API:  http://localhost:8000"
echo -e "API Docs:     http://localhost:8000/docs"
echo -e "Expo:         http://localhost:8081"
echo ""
echo -e "Press 'i' in the Expo terminal to open iOS simulator"
echo -e "Press Ctrl+C to stop all services${NC}"

# Handle shutdown
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $EXPO_PID 2>/dev/null || true
    echo -e "${GREEN}Goodbye!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
