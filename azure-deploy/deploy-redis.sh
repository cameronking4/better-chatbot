#!/bin/bash

# Better Chatbot - Deploy Redis to AKS
# This script deploys Redis for BullMQ scheduled tasks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - Deploy Redis${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if deployment-config.sh exists
if [ ! -f deployment-config.sh ]; then
    echo -e "${RED}Error: deployment-config.sh not found${NC}"
    echo "Please run ./initial-deploy.sh first to create the initial deployment"
    exit 1
fi

# Load configuration
echo -e "${BLUE}Loading deployment configuration...${NC}"
source deployment-config.sh

echo -e "${GREEN}✓ Configuration loaded${NC}"
echo "Resource Group: $RESOURCE_GROUP"
echo "AKS Cluster: $AKS_NAME"
echo "Namespace: $NAMESPACE"

# Verify Azure login
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Azure. Please run 'az login' first.${NC}"
    exit 1
fi

# Verify kubectl context
CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ ! $CURRENT_CONTEXT =~ $AKS_NAME ]]; then
    echo -e "${YELLOW}⚠ kubectl context may not be set to the correct cluster${NC}"
    echo "Current context: $CURRENT_CONTEXT"
    echo "Expected cluster: $AKS_NAME"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Check if Redis already exists
if kubectl get deployment redis -n $NAMESPACE &> /dev/null; then
    echo -e "${YELLOW}⚠ Redis deployment already exists${NC}"
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# Get the absolute path to k8s directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$SCRIPT_DIR/../k8s"

echo -e "\n${BLUE}[1/3] Creating Redis PVC...${NC}"
kubectl apply -f "$K8S_DIR/redis-pvc.yaml" -n $NAMESPACE
echo -e "${GREEN}✓ Redis PVC created${NC}"

echo -e "\n${BLUE}[2/3] Deploying Redis...${NC}"
kubectl apply -f "$K8S_DIR/redis-deployment.yaml" -n $NAMESPACE
kubectl apply -f "$K8S_DIR/redis-service.yaml" -n $NAMESPACE
echo -e "${GREEN}✓ Redis deployment and service created${NC}"

# Wait for Redis to be ready
echo -e "\n${BLUE}[3/3] Waiting for Redis to be ready...${NC}"
kubectl wait --for=condition=available --timeout=5m deployment/redis -n $NAMESPACE || {
    echo -e "${RED}✗ Redis deployment failed or timed out${NC}"
    echo "Check status: kubectl get pods -n $NAMESPACE"
    exit 1
}
echo -e "${GREEN}✓ Redis is ready${NC}"

# Verify Redis is working
echo -e "\n${BLUE}Verifying Redis connection...${NC}"
REDIS_POD=$(kubectl get pods -n $NAMESPACE -l app=redis -o jsonpath='{.items[0].metadata.name}')
if kubectl exec -n $NAMESPACE $REDIS_POD -- redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✓ Redis is responding to ping${NC}"
else
    echo -e "${YELLOW}⚠ Redis ping test failed, but deployment is running${NC}"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Redis Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${BLUE}Redis Status:${NC}"
kubectl get deployment redis -n $NAMESPACE
kubectl get service redis-service -n $NAMESPACE
kubectl get pods -n $NAMESPACE -l app=redis

echo -e "\n${YELLOW}⚠ Next Steps:${NC}"
echo "1. Update your app deployment to include REDIS_URL environment variable"
echo "2. The deployment.yaml has been updated with REDIS_URL=redis://redis-service:6379"
echo "3. Run ./update-deploy.sh to rebuild and deploy your app with Redis support"

echo -e "\n${BLUE}Useful commands:${NC}"
echo "  # View Redis logs"
echo "  kubectl logs -f deployment/redis -n $NAMESPACE"
echo ""
echo "  # Test Redis connection"
echo "  kubectl exec -it deployment/redis -n $NAMESPACE -- redis-cli ping"
echo ""
echo "  # Connect to Redis CLI"
echo "  kubectl exec -it deployment/redis -n $NAMESPACE -- redis-cli"

