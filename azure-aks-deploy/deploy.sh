#!/bin/bash

# Better Chatbot - Azure AKS Deployment Script
# This script will deploy the application to Azure Kubernetes Service

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration - You can modify these
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-betterchatbotacr$(date +%s)}"  # Must be globally unique
AKS_NAME="${AKS_NAME:-better-chatbot-aks}"
NODE_COUNT="${NODE_COUNT:-2}"
NODE_SIZE="${NODE_SIZE:-Standard_D2s_v3}"

print_status "=========================================="
print_status "Azure AKS Deployment Configuration"
print_status "=========================================="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "ACR Name: $ACR_NAME"
echo "AKS Name: $AKS_NAME"
echo "Node Count: $NODE_COUNT"
echo "Node Size: $NODE_SIZE"
print_status "=========================================="

# Check if logged into Azure
print_status "Checking Azure CLI login status..."
if ! az account show &> /dev/null; then
    print_error "Not logged into Azure CLI. Please run 'az login' first."
    exit 1
fi

SUBSCRIPTION=$(az account show --query name -o tsv)
print_status "Using Azure subscription: $SUBSCRIPTION"

# Create Resource Group
print_status "Creating resource group: $RESOURCE_GROUP..."
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --output table

# Create Azure Container Registry
print_status "Creating Azure Container Registry: $ACR_NAME..."
az acr create \
    --resource-group $RESOURCE_GROUP \
    --name $ACR_NAME \
    --sku Basic \
    --output table

# Enable admin access for ACR (for easier authentication)
print_status "Enabling admin access on ACR..."
az acr update -n $ACR_NAME --admin-enabled true

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
print_status "ACR Login Server: $ACR_LOGIN_SERVER"

# Login to ACR
print_status "Logging into ACR..."
az acr login --name $ACR_NAME

# Build and push Docker image
print_status "Building Docker image..."
IMAGE_TAG="$ACR_LOGIN_SERVER/better-chatbot:latest"

docker build -t $IMAGE_TAG -f docker/Dockerfile .

print_status "Pushing image to ACR..."
docker push $IMAGE_TAG

print_status "Image pushed successfully: $IMAGE_TAG"

# Create AKS cluster
print_status "Creating AKS cluster: $AKS_NAME (this may take 5-10 minutes)..."
az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --node-count $NODE_COUNT \
    --node-vm-size $NODE_SIZE \
    --enable-managed-identity \
    --attach-acr $ACR_NAME \
    --generate-ssh-keys \
    --output table

# Get AKS credentials
print_status "Getting AKS credentials..."
az aks get-credentials \
    --resource-group $RESOURCE_GROUP \
    --name $AKS_NAME \
    --overwrite-existing

# Verify connection
print_status "Verifying Kubernetes connection..."
kubectl get nodes

# Create Kubernetes namespace
print_status "Creating Kubernetes namespace..."
kubectl create namespace better-chatbot --dry-run=client -o yaml | kubectl apply -f -

# Create secrets from .env file
print_status "Creating Kubernetes secrets from .env file..."
if [ -f .env ]; then
    # Create secret from .env file, excluding PostgreSQL local config
    kubectl create secret generic better-chatbot-env \
        --from-env-file=.env \
        --namespace=better-chatbot \
        --dry-run=client -o yaml | kubectl apply -f -
    print_status "Secrets created successfully"
else
    print_error ".env file not found! Please ensure .env exists in the project root."
    exit 1
fi

# Update deployment.yaml with actual image
print_status "Preparing Kubernetes manifests..."
mkdir -p azure-aks-deploy/k8s
cat > azure-aks-deploy/k8s/deployment.yaml << DEPLOYMENT_EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: better-chatbot
  namespace: better-chatbot
  labels:
    app: better-chatbot
spec:
  replicas: 2
  selector:
    matchLabels:
      app: better-chatbot
  template:
    metadata:
      labels:
        app: better-chatbot
    spec:
      containers:
      - name: better-chatbot
        image: $IMAGE_TAG
        ports:
        - containerPort: 3000
        env:
        - name: NO_HTTPS
          value: "1"
        - name: PORT
          value: "3000"
        - name: HOSTNAME
          value: "0.0.0.0"
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: better-chatbot-env
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
DEPLOYMENT_EOF

cat > azure-aks-deploy/k8s/service.yaml << SERVICE_EOF
apiVersion: v1
kind: Service
metadata:
  name: better-chatbot-service
  namespace: better-chatbot
spec:
  type: LoadBalancer
  selector:
    app: better-chatbot
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
SERVICE_EOF

# Deploy to AKS
print_status "Deploying application to AKS..."
kubectl apply -f azure-aks-deploy/k8s/deployment.yaml
kubectl apply -f azure-aks-deploy/k8s/service.yaml

# Wait for deployment to be ready
print_status "Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s \
    deployment/better-chatbot \
    -n better-chatbot

# Get service details
print_status "Getting service information..."
kubectl get services -n better-chatbot

print_status "=========================================="
print_status "Deployment completed successfully!"
print_status "=========================================="

# Wait for external IP
print_status "Waiting for external IP to be assigned (this may take a few minutes)..."
echo "Run the following command to get the external IP:"
echo "kubectl get service better-chatbot-service -n better-chatbot --watch"
echo ""
echo "Or get it now with:"
echo "kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}'"

# Try to get the external IP
sleep 10
EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

if [ "$EXTERNAL_IP" != "pending" ] && [ ! -z "$EXTERNAL_IP" ]; then
    print_status "=========================================="
    print_status "Application is accessible at: http://$EXTERNAL_IP"
    print_status "=========================================="
else
    print_warning "External IP is still being assigned. Please wait a few minutes and check with:"
    echo "kubectl get service better-chatbot-service -n better-chatbot"
fi

print_status "Deployment script completed!"
print_status ""
print_status "Useful commands:"
echo "  - View pods: kubectl get pods -n better-chatbot"
echo "  - View logs: kubectl logs -f deployment/better-chatbot -n better-chatbot"
echo "  - View services: kubectl get svc -n better-chatbot"
echo "  - Scale deployment: kubectl scale deployment/better-chatbot --replicas=3 -n better-chatbot"
echo "  - Delete deployment: kubectl delete namespace better-chatbot"
