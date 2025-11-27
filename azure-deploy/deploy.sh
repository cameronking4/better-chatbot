#!/bin/bash

# Better Chatbot - Smooth Deployment Script
# This script builds locally, pushes to ACR, and deploys to AKS
# 
# Usage: ./deploy.sh [--skip-build] [--skip-env] [--tag TAG]
#
# Options:
#   --skip-build    Skip Docker build (use existing image)
#   --skip-env      Skip environment variable update
#   --tag TAG       Use specific image tag (default: latest)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SKIP_BUILD=false
SKIP_ENV=false
IMAGE_TAG="latest"
NON_INTERACTIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-env)
            SKIP_ENV=true
            shift
            ;;
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --yes|-y)
            NON_INTERACTIVE=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: ./deploy.sh [--skip-build] [--skip-env] [--tag TAG] [--yes]"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - Smooth Deployment${NC}"
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
echo "ACR: $ACR_NAME"
echo "AKS Cluster: $AKS_NAME"
echo "Namespace: $NAMESPACE"
echo "Image Tag: $IMAGE_TAG"

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
    if [ "$NON_INTERACTIVE" = false ]; then
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Deployment cancelled."
            exit 1
        fi
    else
        echo -e "${YELLOW}Continuing (non-interactive mode)...${NC}"
    fi
fi

# Ensure ACR login
echo -e "\n${BLUE}Logging into ACR...${NC}"
az acr login --name $ACR_NAME || {
    echo -e "${RED}Failed to login to ACR${NC}"
    exit 1
}
echo -e "${GREEN}✓ ACR login successful${NC}"

# Step 1: Update environment variables from .env
if [ "$SKIP_ENV" = false ]; then
    echo -e "\n${BLUE}[1/4] Updating environment variables from .env...${NC}"
    
    if [ ! -f ../.env ]; then
        echo -e "${YELLOW}⚠ .env file not found, skipping environment update${NC}"
    else
        # Clean .env file (remove comments, empty lines, duplicates, fix quotes)
        grep -v '^#' ../.env | grep -v '^$' | \
            sed 's/^POSTGRES_URL="\(.*\)"$/POSTGRES_URL=\1/' | \
            sed 's/^POSTGRES_URL_DEV="\(.*\)"$/POSTGRES_URL_DEV=\1/' | \
            grep -v '^FILE_BASED_MCP_CONFIG' | \
            sort -u > /tmp/env-clean.txt
        
        # Delete and recreate secret
        kubectl delete secret better-chatbot-env -n $NAMESPACE 2>/dev/null || true
        kubectl create secret generic better-chatbot-env \
            --from-env-file=/tmp/env-clean.txt \
            --namespace=$NAMESPACE
        
        rm /tmp/env-clean.txt
        echo -e "${GREEN}✓ Environment variables updated${NC}"
    fi
else
    echo -e "\n${YELLOW}[1/4] Skipping environment variable update${NC}"
fi

# Step 2: Build and push Docker image
if [ "$SKIP_BUILD" = false ]; then
    echo -e "\n${BLUE}[2/4] Building Docker image locally...${NC}"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    IMAGE_FULL="$ACR_LOGIN_SERVER/better-chatbot:$IMAGE_TAG"
    IMAGE_TIMESTAMP="$ACR_LOGIN_SERVER/better-chatbot:$TIMESTAMP"
    
    # Build for linux/amd64 platform (required for AKS)
    cd ..
    docker buildx build \
        --platform linux/amd64 \
        -t $IMAGE_FULL \
        -t $IMAGE_TIMESTAMP \
        -f docker/Dockerfile \
        . --load
    
    echo -e "${GREEN}✓ Image built successfully${NC}"
    
    # Push to ACR
    echo -e "\n${BLUE}Pushing image to ACR...${NC}"
    docker push $IMAGE_FULL
    docker push $IMAGE_TIMESTAMP
    echo -e "${GREEN}✓ Image pushed successfully${NC}"
    echo "Tags: $IMAGE_TAG, $TIMESTAMP"
    cd azure-deploy
else
    echo -e "\n${YELLOW}[2/4] Skipping Docker build${NC}"
fi

# Step 3: Ensure imagePullSecret exists
echo -e "\n${BLUE}[3/4] Ensuring ACR authentication...${NC}"
if ! kubectl get secret acr-secret -n $NAMESPACE &>/dev/null; then
    echo "Creating ACR pull secret..."
    ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
    ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)
    kubectl create secret docker-registry acr-secret \
        --docker-server=$ACR_LOGIN_SERVER \
        --docker-username=$ACR_USERNAME \
        --docker-password=$ACR_PASSWORD \
        -n $NAMESPACE
    echo -e "${GREEN}✓ ACR secret created${NC}"
else
    echo -e "${GREEN}✓ ACR secret exists${NC}"
fi

# Ensure deployment has imagePullSecrets
if ! kubectl get deployment better-chatbot -n $NAMESPACE -o jsonpath='{.spec.template.spec.imagePullSecrets}' | grep -q acr-secret; then
    echo "Adding imagePullSecrets to deployment..."
    kubectl patch deployment better-chatbot -n $NAMESPACE -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"acr-secret"}]}}}}'
    echo -e "${GREEN}✓ imagePullSecrets configured${NC}"
fi

# Step 4: Restart deployment
echo -e "\n${BLUE}[4/4] Restarting deployment...${NC}"
kubectl rollout restart deployment/better-chatbot -n $NAMESPACE
echo -e "${GREEN}✓ Deployment restart initiated${NC}"

# Wait for rollout
echo -e "${BLUE}Waiting for rollout to complete (this may take a few minutes)...${NC}"
if kubectl rollout status deployment/better-chatbot -n $NAMESPACE --timeout=5m; then
    echo -e "${GREEN}✓ Rollout completed successfully${NC}"
else
    echo -e "${RED}✗ Rollout failed or timed out${NC}"
    echo -e "\n${YELLOW}Troubleshooting:${NC}"
    echo "  kubectl get pods -n $NAMESPACE"
    echo "  kubectl logs -f deployment/better-chatbot -n $NAMESPACE"
    echo "  kubectl describe pod -n $NAMESPACE -l app=better-chatbot"
    exit 1
fi

# Verify deployment
echo -e "\n${BLUE}Verifying deployment...${NC}"
READY_PODS=$(kubectl get pods -n $NAMESPACE -l app=better-chatbot -o json | jq -r '.items | map(select(.status.conditions[] | select(.type=="Ready" and .status=="True"))) | length')
TOTAL_PODS=$(kubectl get pods -n $NAMESPACE -l app=better-chatbot -o json | jq -r '.items | length')

echo "Ready pods: $READY_PODS/$TOTAL_PODS"

if [ "$READY_PODS" -eq "$TOTAL_PODS" ] && [ "$READY_PODS" -gt 0 ]; then
    echo -e "${GREEN}✓ All pods are ready!${NC}"
else
    echo -e "${YELLOW}⚠ Some pods may still be starting${NC}"
fi

# Get service information
EXTERNAL_IP=$(kubectl get service better-chatbot-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

if [ "$EXTERNAL_IP" != "pending" ]; then
    echo -e "\n${GREEN}🚀 Application URL: http://$EXTERNAL_IP${NC}"
fi

echo -e "\n${BLUE}Deployment Status:${NC}"
kubectl get deployment better-chatbot -n $NAMESPACE

echo -e "\n${BLUE}Redis Status:${NC}"
kubectl get deployment redis -n $NAMESPACE 2>/dev/null || echo "Redis deployment not found"

echo -e "\n${BLUE}Quick Commands:${NC}"
echo "  # View logs:"
echo "  kubectl logs -f deployment/better-chatbot -n $NAMESPACE"
echo ""
echo "  # Check status:"
echo "  kubectl get pods -n $NAMESPACE"
echo ""
echo "  # Rollback (if needed):"
echo "  kubectl rollout undo deployment/better-chatbot -n $NAMESPACE"

