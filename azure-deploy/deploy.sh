#!/bin/bash

# Better Chatbot - Azure AKS Deployment Script
# This script will:
# 1. Create Azure Container Registry (ACR)
# 2. Build and push Docker image to ACR
# 3. Create AKS cluster
# 4. Deploy PostgreSQL
# 5. Deploy the application
# 6. Set up ingress and SSL

set -e

# Configuration - MODIFY THESE VALUES
RESOURCE_GROUP="better-chatbot-rg"
LOCATION="eastus"
ACR_NAME="betterchatbotacr$(date +%s)"  # Must be unique globally
AKS_NAME="better-chatbot-aks"
NODE_COUNT=2
NODE_SIZE="Standard_D2s_v3"
POSTGRES_ADMIN_PASSWORD="BetterChatbot$(openssl rand -base64 12)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - AKS Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if .env file exists
if [ ! -f ../.env ]; then
    echo -e "${RED}Error: .env file not found in parent directory${NC}"
    echo "Please create a .env file with your configuration"
    exit 1
fi

echo -e "\n${YELLOW}Configuration:${NC}"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "ACR Name: $ACR_NAME"
echo "AKS Cluster: $AKS_NAME"
echo "Node Count: $NODE_COUNT"
echo "Node Size: $NODE_SIZE"

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Step 1: Create Resource Group
echo -e "\n${GREEN}[1/8] Creating Resource Group...${NC}"
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION

# Step 2: Create Azure Container Registry
echo -e "\n${GREEN}[2/8] Creating Azure Container Registry...${NC}"
az acr create \
    --resource-group $RESOURCE_GROUP \
    --name $ACR_NAME \
    --sku Basic \
    --admin-enabled true

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer --output tsv)
echo "ACR Login Server: $ACR_LOGIN_SERVER"

# Step 3: Build and Push Docker Image
echo -e "\n${GREEN}[3/8] Building and pushing Docker image...${NC}"
az acr build \
    --registry $ACR_NAME \
    --image better-chatbot:latest \
    --image better-chatbot:v1.0.0 \
    --file ../docker/Dockerfile \
    ..

# Step 4: Create AKS Cluster
echo -e "\n${GREEN}[4/8] Creating AKS Cluster (this may take 5-10 minutes)...${NC}"
az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --node-count $NODE_COUNT \
    --node-vm-size $NODE_SIZE \
    --enable-managed-identity \
    --generate-ssh-keys \
    --attach-acr $ACR_NAME \
    --network-plugin azure \
    --enable-addons monitoring

# Step 5: Get AKS credentials
echo -e "\n${GREEN}[5/8] Getting AKS credentials...${NC}"
az aks get-credentials \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --overwrite-existing

# Step 6: Create namespace
echo -e "\n${GREEN}[6/8] Creating Kubernetes namespace...${NC}"
kubectl create namespace better-chatbot --dry-run=client -o yaml | kubectl apply -f -

# Step 7: Create secrets from .env file
echo -e "\n${GREEN}[7/8] Creating Kubernetes secrets...${NC}"

# Create a secret for the app environment variables
kubectl create secret generic better-chatbot-env \
    --from-env-file=../.env \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f -

# Create PostgreSQL secret
kubectl create secret generic postgres-secret \
    --from-literal=postgres-password=$POSTGRES_ADMIN_PASSWORD \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f -

# Update image name in deployment files
sed "s|IMAGE_PLACEHOLDER|$ACR_LOGIN_SERVER/better-chatbot:latest|g" ../k8s/deployment.yaml > ../k8s/deployment-updated.yaml

# Step 8: Deploy to Kubernetes
echo -e "\n${GREEN}[8/8] Deploying to Kubernetes...${NC}"

# Deploy PostgreSQL
kubectl apply -f ../k8s/postgres-pvc.yaml -n better-chatbot
kubectl apply -f ../k8s/postgres-deployment.yaml -n better-chatbot
kubectl apply -f ../k8s/postgres-service.yaml -n better-chatbot

echo "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s -n better-chatbot

# Deploy the application
kubectl apply -f ../k8s/deployment-updated.yaml -n better-chatbot
kubectl apply -f ../k8s/service.yaml -n better-chatbot
kubectl apply -f ../k8s/ingress.yaml -n better-chatbot

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

# Get the external IP
echo -e "\n${YELLOW}Waiting for external IP assignment...${NC}"
echo "This may take a few minutes..."

sleep 30

EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -z "$EXTERNAL_IP" ]; then
    echo -e "\n${YELLOW}External IP not yet assigned. Run this command to check:${NC}"
    echo "kubectl get service better-chatbot-service -n better-chatbot"
else
    echo -e "\n${GREEN}Your application is available at: http://$EXTERNAL_IP${NC}"
fi

# Save deployment info
cat > deployment-info.txt << DEPLOY_INFO
Better Chatbot - Azure AKS Deployment Info
==========================================

Resource Group: $RESOURCE_GROUP
Location: $LOCATION
ACR Name: $ACR_NAME
ACR Login Server: $ACR_LOGIN_SERVER
AKS Cluster: $AKS_NAME
PostgreSQL Admin Password: $POSTGRES_ADMIN_PASSWORD

Useful Commands:
----------------
# View pods
kubectl get pods -n better-chatbot

# View services
kubectl get services -n better-chatbot

# View logs
kubectl logs -f deployment/better-chatbot -n better-chatbot

# Get external IP
kubectl get service better-chatbot-service -n better-chatbot

# Scale deployment
kubectl scale deployment better-chatbot --replicas=3 -n better-chatbot

# Update image
az acr build --registry $ACR_NAME --image better-chatbot:latest --file docker/Dockerfile .
kubectl rollout restart deployment/better-chatbot -n better-chatbot

# Delete everything
az group delete --name $RESOURCE_GROUP --yes --no-wait
DEPLOY_INFO

echo -e "\n${GREEN}Deployment information saved to: deployment-info.txt${NC}"
echo -e "\n${YELLOW}Important: Save your PostgreSQL password: $POSTGRES_ADMIN_PASSWORD${NC}"

