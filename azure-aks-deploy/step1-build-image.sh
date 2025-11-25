#!/bin/bash
set -e

GREEN='\033[0;32m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Get existing ACR if available, or create new one
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv 2>/dev/null)

if [ -z "$ACR_NAME" ]; then
    print_status "No ACR found in resource group $RESOURCE_GROUP"
    print_status "Creating resource group and ACR first..."
    
    LOCATION="${LOCATION:-eastus}"
    ACR_NAME="betterchatbotacr$(date +%s)"
    
    az group create --name $RESOURCE_GROUP --location $LOCATION --output table
    az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --output table
    az acr update -n $ACR_NAME --admin-enabled true
fi

ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
print_status "Using ACR: $ACR_NAME ($ACR_LOGIN_SERVER)"

# Login to ACR
print_status "Logging into ACR..."
az acr login --name $ACR_NAME

# Build image
print_status "Building Docker image..."
IMAGE_TAG="$ACR_LOGIN_SERVER/better-chatbot:latest"

docker build -t $IMAGE_TAG -f docker/Dockerfile .

# Push image
print_status "Pushing image to ACR..."
docker push $IMAGE_TAG

print_status "✅ Image built and pushed successfully: $IMAGE_TAG"
print_status "ACR_NAME=$ACR_NAME"
print_status "IMAGE_TAG=$IMAGE_TAG"

echo ""
echo "Next step: Run ./azure-aks-deploy/step2-create-aks.sh"
