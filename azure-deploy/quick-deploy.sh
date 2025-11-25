#!/bin/bash

# Quick Deploy Script - Uses sensible defaults
# Perfect for getting started quickly

set -e

# Simple configuration
RESOURCE_GROUP="better-chatbot-rg"
LOCATION="eastus"
ACR_NAME="betterchatbot$(date +%s | tail -c 6)"
AKS_NAME="better-chatbot-aks"

echo "🚀 Quick Deploy - Better Chatbot to Azure AKS"
echo "=============================================="
echo ""
echo "This will create:"
echo "  - Resource Group: $RESOURCE_GROUP"
echo "  - Container Registry: $ACR_NAME"
echo "  - AKS Cluster: $AKS_NAME"
echo ""
echo "⏱️  Estimated time: 10-15 minutes"
echo ""

# Check for .env file
if [ ! -f ../.env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create ../.env with your API keys"
    exit 1
fi

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Create resource group
echo "📦 [1/6] Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION --output none

# Create ACR
echo "🐳 [2/6] Creating container registry..."
az acr create \
    --resource-group $RESOURCE_GROUP \
    --name $ACR_NAME \
    --sku Basic \
    --admin-enabled true \
    --output none

ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer --output tsv)

# Build image
echo "🔨 [3/6] Building Docker image (this takes a few minutes)..."
az acr build \
    --registry $ACR_NAME \
    --image better-chatbot:latest \
    --file ../docker/Dockerfile \
    .. \
    --output none

# Create AKS
echo "☸️  [4/6] Creating Kubernetes cluster (this takes 5-10 minutes)..."
az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --node-count 2 \
    --node-vm-size Standard_B2s \
    --enable-managed-identity \
    --generate-ssh-keys \
    --attach-acr $ACR_NAME \
    --output none

# Get credentials
echo "🔑 [5/6] Configuring kubectl..."
az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_NAME --overwrite-existing --output none

# Deploy
echo "🚀 [6/6] Deploying application..."

kubectl create namespace better-chatbot --dry-run=client -o yaml | kubectl apply -f - > /dev/null 2>&1

# Generate strong password
POSTGRES_PASSWORD="BetterChatbot$(openssl rand -base64 12 | tr -d '=' | tr '+/' 'Aa')"

kubectl create secret generic postgres-secret \
    --from-literal=postgres-password=$POSTGRES_PASSWORD \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f - > /dev/null 2>&1

kubectl create secret generic better-chatbot-env \
    --from-env-file=../.env \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f - > /dev/null 2>&1

# Update deployment with actual image
sed "s|IMAGE_PLACEHOLDER|$ACR_LOGIN_SERVER/better-chatbot:latest|g" ../k8s/deployment.yaml > /tmp/deployment-updated.yaml

# Apply all manifests
kubectl apply -f ../k8s/postgres-pvc.yaml -n better-chatbot > /dev/null 2>&1
kubectl apply -f ../k8s/postgres-deployment.yaml -n better-chatbot > /dev/null 2>&1
kubectl apply -f ../k8s/postgres-service.yaml -n better-chatbot > /dev/null 2>&1
sleep 10
kubectl apply -f /tmp/deployment-updated.yaml -n better-chatbot > /dev/null 2>&1
kubectl apply -f ../k8s/service.yaml -n better-chatbot > /dev/null 2>&1

echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "📝 Deployment Info:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  ACR: $ACR_NAME"
echo "  AKS Cluster: $AKS_NAME"
echo "  PostgreSQL Password: $POSTGRES_PASSWORD"
echo ""
echo "⏳ Waiting for external IP (this may take 2-3 minutes)..."

# Wait for external IP
for i in {1..60}; do
    EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
    if [ ! -z "$EXTERNAL_IP" ]; then
        break
    fi
    echo -n "."
    sleep 5
done

echo ""
echo ""

if [ -z "$EXTERNAL_IP" ]; then
    echo "⚠️  External IP not ready yet. Check with:"
    echo "   kubectl get service better-chatbot-service -n better-chatbot"
else
    echo "🎉 Your app is live at: http://$EXTERNAL_IP"
fi

echo ""
echo "📊 Useful commands:"
echo "   kubectl get pods -n better-chatbot"
echo "   kubectl logs -f deployment/better-chatbot -n better-chatbot"
echo "   kubectl get service better-chatbot-service -n better-chatbot"
echo ""
echo "🗑️  To delete everything:"
echo "   az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""

# Save info
cat > deployment-info.txt << INFO
Better Chatbot - Azure Deployment
==================================

Resource Group: $RESOURCE_GROUP
Location: $LOCATION
ACR: $ACR_NAME ($ACR_LOGIN_SERVER)
AKS Cluster: $AKS_NAME
PostgreSQL Password: $POSTGRES_PASSWORD

Access URL: http://$EXTERNAL_IP

Deployed: $(date)
INFO

echo "💾 Deployment info saved to: deployment-info.txt"

