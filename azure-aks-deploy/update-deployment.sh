#!/bin/bash

# Script to update the deployment with a new image build

set -e

GREEN='\033[0;32m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Get ACR name from Azure
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)

print_status "Using ACR: $ACR_NAME"

# Login to ACR
print_status "Logging into ACR..."
az acr login --name $ACR_NAME

# Build new image
print_status "Building new Docker image..."
IMAGE_TAG="$ACR_LOGIN_SERVER/better-chatbot:$(date +%Y%m%d-%H%M%S)"
LATEST_TAG="$ACR_LOGIN_SERVER/better-chatbot:latest"

docker build -t $IMAGE_TAG -t $LATEST_TAG -f docker/Dockerfile .

# Push both tags
print_status "Pushing images to ACR..."
docker push $IMAGE_TAG
docker push $LATEST_TAG

# Restart deployment to pull new image
print_status "Restarting deployment..."
kubectl rollout restart deployment/better-chatbot -n better-chatbot

print_status "Waiting for rollout to complete..."
kubectl rollout status deployment/better-chatbot -n better-chatbot

print_status "Deployment updated successfully!"
