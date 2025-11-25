#!/bin/bash

# Continue deployment from wherever it left off

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

RESOURCE_GROUP="better-chatbot-rg"
AKS_NAME="better-chatbot-aks"

print_header "Checking deployment status..."

# Check if ACR has image
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv 2>/dev/null)

if [ -z "$ACR_NAME" ]; then
    print_warning "No ACR found. Starting from step 1..."
    exec ./azure-aks-deploy/step1-build-image.sh
fi

print_status "Found ACR: $ACR_NAME"

# Check if image exists
if az acr repository show --name $ACR_NAME --repository better-chatbot &>/dev/null; then
    print_status "✓ Docker image found in ACR"
    IMAGE_EXISTS=true
else
    print_warning "✗ Docker image not found in ACR"
    
    # Check if build is running
    if ps aux | grep -E "docker build.*better-chatbot" | grep -v grep > /dev/null; then
        print_warning "Docker build is currently running. Please wait for it to complete."
        echo "You can monitor it with: ./azure-aks-deploy/check-build-status.sh"
        exit 0
    else
        print_warning "Starting image build..."
        exec ./azure-aks-deploy/step1-build-image.sh
    fi
fi

# Check if AKS exists
if az aks show --resource-group $RESOURCE_GROUP --name $AKS_NAME &>/dev/null; then
    print_status "✓ AKS cluster found"
    AKS_EXISTS=true
else
    print_warning "✗ AKS cluster not found"
    print_status "Creating AKS cluster..."
    exec ./azure-aks-deploy/step2-create-aks.sh
fi

# Check if app is deployed
kubectl get namespace better-chatbot &>/dev/null && NS_EXISTS=true || NS_EXISTS=false

if [ "$NS_EXISTS" = true ]; then
    if kubectl get deployment better-chatbot -n better-chatbot &>/dev/null; then
        print_status "✓ Application is deployed"
        print_header "Deployment Status"
        ./azure-aks-deploy/status.sh
    else
        print_warning "Namespace exists but application not deployed"
        print_status "Deploying application..."
        exec ./azure-aks-deploy/step3-deploy-app.sh
    fi
else
    print_warning "Application not deployed"
    print_status "Deploying application..."
    exec ./azure-aks-deploy/step3-deploy-app.sh
fi

print_header "All components are deployed!"
echo ""
echo "Run './azure-aks-deploy/status.sh' to see detailed status"
