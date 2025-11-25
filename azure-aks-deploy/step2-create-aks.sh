#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
AKS_NAME="${AKS_NAME:-better-chatbot-aks}"
NODE_COUNT="${NODE_COUNT:-2}"
NODE_SIZE="${NODE_SIZE:-Standard_D2s_v3}"

# Check if AKS already exists
if az aks show --resource-group $RESOURCE_GROUP --name $AKS_NAME &>/dev/null; then
    print_warning "AKS cluster $AKS_NAME already exists"
    print_status "Getting credentials..."
    az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_NAME --overwrite-existing
    kubectl get nodes
    echo ""
    echo "Next step: Run ./azure-aks-deploy/step3-deploy-app.sh"
    exit 0
fi

# Get ACR name
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)

if [ -z "$ACR_NAME" ]; then
    echo "Error: No ACR found. Run step1-build-image.sh first"
    exit 1
fi

print_status "Creating AKS cluster: $AKS_NAME"
print_status "This will take 5-10 minutes..."

az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --node-count $NODE_COUNT \
    --node-vm-size $NODE_SIZE \
    --enable-managed-identity \
    --attach-acr $ACR_NAME \
    --generate-ssh-keys \
    --output table

# Get credentials
print_status "Getting AKS credentials..."
az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_NAME --overwrite-existing

# Verify
print_status "Verifying connection..."
kubectl get nodes

print_status "✅ AKS cluster created successfully"
echo ""
echo "Next step: Run ./azure-aks-deploy/step3-deploy-app.sh"
