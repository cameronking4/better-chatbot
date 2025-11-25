#!/bin/bash

# Script to check deployment status

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_header() {
    echo -e "${YELLOW}=========================================="
    echo -e "$1"
    echo -e "==========================================${NC}"
}

print_header "Azure Resources"
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
az group show --name $RESOURCE_GROUP --output table 2>/dev/null || echo "Resource group not found"

echo ""
print_header "AKS Cluster"
AKS_NAME="${AKS_NAME:-better-chatbot-aks}"
az aks show --resource-group $RESOURCE_GROUP --name $AKS_NAME --output table 2>/dev/null || echo "AKS cluster not found"

echo ""
print_header "Kubernetes Nodes"
kubectl get nodes

echo ""
print_header "Namespace Resources"
kubectl get all -n better-chatbot

echo ""
print_header "Pods Status"
kubectl get pods -n better-chatbot -o wide

echo ""
print_header "Service Details"
kubectl get service better-chatbot-service -n better-chatbot

echo ""
print_header "External IP"
EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

if [ "$EXTERNAL_IP" != "pending" ] && [ ! -z "$EXTERNAL_IP" ]; then
    echo -e "${GREEN}Application URL: http://$EXTERNAL_IP${NC}"
else
    echo "External IP is still being assigned. Please wait a few minutes."
fi

echo ""
print_header "Recent Events"
kubectl get events -n better-chatbot --sort-by='.lastTimestamp' | tail -10
