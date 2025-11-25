#!/bin/bash

# Script to view application logs

set -e

GREEN='\033[0;32m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_status "Fetching logs from better-chatbot deployment..."
print_status "Press Ctrl+C to exit"
echo ""

kubectl logs -f deployment/better-chatbot -n better-chatbot --all-containers=true
