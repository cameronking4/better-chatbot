#!/bin/bash

# Better Chatbot - Initial Azure AKS Deployment
# This script provisions all Azure resources from scratch and deploys the application
# 
# Usage: ./initial-deploy.sh
#
# Prerequisites:
# - Azure CLI installed and logged in (az login)
# - kubectl installed
# - Docker installed (for local testing, optional)
# - .env file in project root with required configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - MODIFY THESE VALUES FOR NEW DEPLOYMENTS
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-betterchatbotacr$(date +%s)}"  # Must be unique globally
AKS_NAME="${AKS_NAME:-better-chatbot-aks}"
NODE_COUNT="${NODE_COUNT:-2}"
NODE_SIZE="${NODE_SIZE:-Standard_D2s_v3}"
NAMESPACE="better-chatbot"
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-betterchatbotsa$(date +%s | tail -c 10)}"
FILE_SHARE_NAME="app-data"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - Initial AKS Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
echo -e "\n${BLUE}Checking prerequisites...${NC}"

if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl not found. Please install it first.${NC}"
    exit 1
fi

if [ ! -f ../.env ]; then
    echo -e "${RED}Error: .env file not found in project root${NC}"
    echo "Please create a .env file with your configuration"
    exit 1
fi

# Check if already logged in to Azure
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Azure. Please run 'az login' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"

echo -e "\n${YELLOW}Deployment Configuration:${NC}"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "ACR Name: $ACR_NAME"
echo "AKS Cluster: $AKS_NAME"
echo "Node Count: $NODE_COUNT"
echo "Node Size: $NODE_SIZE"
echo "Namespace: $NAMESPACE"
echo "Storage Account: $STORAGE_ACCOUNT_NAME"
echo "File Share: $FILE_SHARE_NAME"

echo -e "\n${YELLOW}This will create new Azure resources and incur costs.${NC}"
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Step 1: Create Resource Group
echo -e "\n${BLUE}[1/10] Creating Resource Group...${NC}"
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --output table

# Step 2: Create Azure Container Registry
echo -e "\n${BLUE}[2/10] Creating Azure Container Registry...${NC}"
az acr create \
    --resource-group $RESOURCE_GROUP \
    --name $ACR_NAME \
    --sku Basic \
    --admin-enabled true \
    --output table

ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer --output tsv)
echo -e "${GREEN}✓ ACR Login Server: $ACR_LOGIN_SERVER${NC}"

# Step 3: Create Storage Account for persistent data
echo -e "\n${BLUE}[3/10] Creating Storage Account for persistent data...${NC}"
az storage account create \
    --resource-group $RESOURCE_GROUP \
    --name $STORAGE_ACCOUNT_NAME \
    --location $LOCATION \
    --sku Standard_LRS \
    --output table

# Get storage account key
STORAGE_KEY=$(az storage account keys list \
    --resource-group $RESOURCE_GROUP \
    --account-name $STORAGE_ACCOUNT_NAME \
    --query "[0].value" \
    --output tsv)

# Create file share
echo -e "\n${BLUE}[4/10] Creating Azure File Share...${NC}"
az storage share create \
    --name $FILE_SHARE_NAME \
    --account-name $STORAGE_ACCOUNT_NAME \
    --account-key $STORAGE_KEY \
    --output table

# Step 5: Build and Push Docker Image
echo -e "\n${BLUE}[5/10] Building and pushing Docker image...${NC}"
echo "This may take several minutes..."
az acr build \
    --registry $ACR_NAME \
    --image better-chatbot:latest \
    --image better-chatbot:v1.0.0 \
    --file ../docker/Dockerfile \
    ..

# Step 6: Create AKS Cluster
echo -e "\n${BLUE}[6/10] Creating AKS Cluster...${NC}"
echo "This will take 5-10 minutes..."
az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --node-count $NODE_COUNT \
    --node-vm-size $NODE_SIZE \
    --enable-managed-identity \
    --generate-ssh-keys \
    --attach-acr $ACR_NAME \
    --network-plugin azure \
    --enable-addons monitoring \
    --output table

# Step 7: Get AKS credentials
echo -e "\n${BLUE}[7/10] Configuring kubectl...${NC}"
az aks get-credentials \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --overwrite-existing

echo -e "${GREEN}✓ kubectl configured for AKS cluster${NC}"

# Step 8: Create Kubernetes namespace and secrets
echo -e "\n${BLUE}[8/10] Setting up Kubernetes namespace and secrets...${NC}"

kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create secret for environment variables
kubectl create secret generic better-chatbot-env \
    --from-env-file=../.env \
    --namespace=$NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -

# Create secret for Azure File Share
kubectl create secret generic azure-storage-secret \
    --from-literal=azurestorageaccountname=$STORAGE_ACCOUNT_NAME \
    --from-literal=azurestorageaccountkey=$STORAGE_KEY \
    --namespace=$NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✓ Secrets created${NC}"

# Step 9: Deploy Kubernetes resources
echo -e "\n${BLUE}[9/10] Deploying application to Kubernetes...${NC}"

# Create temporary deployment file with updated image
sed "s|IMAGE_PLACEHOLDER|$ACR_LOGIN_SERVER/better-chatbot:latest|g" ../k8s/deployment.yaml > /tmp/deployment-temp.yaml

kubectl apply -f ../k8s/pvc.yaml -n $NAMESPACE
kubectl apply -f /tmp/deployment-temp.yaml -n $NAMESPACE
kubectl apply -f ../k8s/service.yaml -n $NAMESPACE

rm /tmp/deployment-temp.yaml

echo "Waiting for deployment to be ready..."
kubectl rollout status deployment/better-chatbot -n $NAMESPACE --timeout=5m

# Step 10: Get service information
echo -e "\n${BLUE}[10/10] Getting service information...${NC}"

EXTERNAL_IP=$(kubectl get service better-chatbot-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

# Save deployment configuration
cat > deployment-config.sh << CONFIG
#!/bin/bash
# Auto-generated deployment configuration
# Created: $(date)

export RESOURCE_GROUP="$RESOURCE_GROUP"
export LOCATION="$LOCATION"
export ACR_NAME="$ACR_NAME"
export ACR_LOGIN_SERVER="$ACR_LOGIN_SERVER"
export AKS_NAME="$AKS_NAME"
export NAMESPACE="$NAMESPACE"
export STORAGE_ACCOUNT_NAME="$STORAGE_ACCOUNT_NAME"
export FILE_SHARE_NAME="$FILE_SHARE_NAME"
CONFIG

chmod +x deployment-config.sh

# Save detailed deployment info
cat > deployment-info.txt << INFO
Better Chatbot - Azure AKS Deployment Information
==================================================
Generated: $(date)

Azure Resources
---------------
Resource Group:      $RESOURCE_GROUP
Location:            $LOCATION
ACR Name:            $ACR_NAME
ACR Login Server:    $ACR_LOGIN_SERVER
AKS Cluster:         $AKS_NAME
Node Count:          $NODE_COUNT
Node Size:           $NODE_SIZE
Storage Account:     $STORAGE_ACCOUNT_NAME
File Share:          $FILE_SHARE_NAME

Kubernetes
----------
Namespace:           $NAMESPACE
Service Name:        better-chatbot-service
External IP:         $EXTERNAL_IP

Useful Commands
---------------
# View pods
kubectl get pods -n $NAMESPACE

# View logs
kubectl logs -f deployment/better-chatbot -n $NAMESPACE

# Get service status
kubectl get service better-chatbot-service -n $NAMESPACE

# Scale deployment
kubectl scale deployment better-chatbot --replicas=3 -n $NAMESPACE

# Update application (rebuild and deploy)
./update-deploy.sh

# Access container shell
kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- /bin/sh

# View persistent volume
kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- ls -la /app/data

Cleanup
-------
# Delete everything (WARNING: This deletes all resources and data)
az group delete --name $RESOURCE_GROUP --yes --no-wait
INFO

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

if [ "$EXTERNAL_IP" = "pending" ]; then
    echo -e "\n${YELLOW}⏳ External IP is still being assigned...${NC}"
    echo "Run this command to check:"
    echo "  kubectl get service better-chatbot-service -n $NAMESPACE"
else
    echo -e "\n${GREEN}🚀 Application URL: http://$EXTERNAL_IP${NC}"
fi

echo -e "\n${BLUE}📋 Deployment configuration saved to:${NC}"
echo "  - deployment-config.sh (source this for environment variables)"
echo "  - deployment-info.txt (full deployment information)"

echo -e "\n${BLUE}Next steps:${NC}"
echo "  1. Wait for external IP if not yet assigned"
echo "  2. Test the application: curl http://\$EXTERNAL_IP"
echo "  3. View logs: kubectl logs -f deployment/better-chatbot -n $NAMESPACE"
echo "  4. To update the app: ./update-deploy.sh"

echo -e "\n${YELLOW}💡 Tip: Run 'source deployment-config.sh' to load configuration${NC}"

