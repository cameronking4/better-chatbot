#!/bin/bash

# Script to update Kubernetes secrets from .env file

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

if [ ! -f .env ]; then
    print_error ".env file not found!"
    exit 1
fi

print_status "Updating Kubernetes secrets from .env file..."

kubectl create secret generic better-chatbot-env \
    --from-env-file=.env \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f -

print_status "Secrets updated successfully!"
print_status "Restarting deployment to apply new secrets..."

kubectl rollout restart deployment/better-chatbot -n better-chatbot

print_status "Done!"
