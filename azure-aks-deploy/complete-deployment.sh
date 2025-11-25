#!/bin/bash

# Complete deployment script - runs all steps with progress tracking

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

cd /Users/cameronking/Downloads/better-chatbot-main

print_header "Better Chatbot - Azure AKS Deployment"
echo "This script will deploy your application to Azure Kubernetes Service"
echo "Total estimated time: 15-20 minutes"
echo ""

# Step 1
print_header "Step 1/3: Build and Push Docker Image"
print_status "Building Docker image and pushing to Azure Container Registry..."
print_status "This will take 5-10 minutes depending on your internet speed"
echo ""

./azure-aks-deploy/step1-build-image.sh

echo ""
print_status "✅ Step 1 complete!"
sleep 2

# Step 2
print_header "Step 2/3: Create AKS Cluster"
print_status "Creating Azure Kubernetes Service cluster..."
print_status "This will take 5-10 minutes"
echo ""

./azure-aks-deploy/step2-create-aks.sh

echo ""
print_status "✅ Step 2 complete!"
sleep 2

# Step 3
print_header "Step 3/3: Deploy Application"
print_status "Deploying your application to Kubernetes..."
print_status "This will take 2-3 minutes"
echo ""

./azure-aks-deploy/step3-deploy-app.sh

echo ""
print_status "✅ Step 3 complete!"

# Final summary
print_header "Deployment Complete! 🎉"

echo "Your application has been deployed to Azure AKS!"
echo ""

# Get external IP
print_status "Checking for external IP..."
sleep 5

EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

if [ ! -z "$EXTERNAL_IP" ]; then
    echo -e "${GREEN}Your application is accessible at: http://$EXTERNAL_IP${NC}"
else
    print_warning "External IP is still being assigned. Run this command in a few minutes:"
    echo "  kubectl get service better-chatbot-service -n better-chatbot"
fi

echo ""
echo "Useful commands:"
echo "  View status: ./azure-aks-deploy/status.sh"
echo "  View logs:   ./azure-aks-deploy/logs.sh"
echo "  Update app:  ./azure-aks-deploy/update-deployment.sh"
echo ""
print_header "Enjoy your deployed application!"
