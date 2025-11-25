#!/bin/bash

# Script to clean up all Azure resources

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"

print_warning "=========================================="
print_warning "This will DELETE all resources in resource group: $RESOURCE_GROUP"
print_warning "This action CANNOT be undone!"
print_warning "=========================================="

read -p "Are you sure you want to continue? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

print_status "Deleting Kubernetes namespace..."
kubectl delete namespace better-chatbot --ignore-not-found=true

print_status "Deleting Azure resource group: $RESOURCE_GROUP..."
az group delete --name $RESOURCE_GROUP --yes --no-wait

print_status "Cleanup initiated. Resources are being deleted in the background."
print_status "You can check status with: az group show --name $RESOURCE_GROUP"
