#!/bin/bash

# Better Chatbot - Update Deployment
# This script rebuilds the Docker image and deploys it to the existing AKS cluster
# 
# Usage: ./update-deploy.sh [--force] [--tag TAG]
#
# Options:
#   --force    Force update even if image build fails
#   --tag TAG  Use specific image tag (default: latest)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
FORCE_UPDATE=false
IMAGE_TAG="latest"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_UPDATE=true
            shift
            ;;
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: ./update-deploy.sh [--force] [--tag TAG]"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - Update Deployment${NC}"
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
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Update cancelled."
        exit 1
    fi
fi

# Show current deployment status
echo -e "\n${BLUE}Current deployment status:${NC}"
kubectl get deployment better-chatbot -n $NAMESPACE -o wide || echo "No deployment found"

echo -e "\n${YELLOW}This will rebuild the image and update the running deployment.${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Update cancelled."
    exit 1
fi

# Step 1: Build and push new image
echo -e "\n${BLUE}[1/3] Building and pushing Docker image...${NC}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

if az acr build \
    --registry $ACR_NAME \
    --image better-chatbot:$IMAGE_TAG \
    --image better-chatbot:$TIMESTAMP \
    --file ../docker/Dockerfile \
    ..; then
    echo -e "${GREEN}✓ Image built and pushed successfully${NC}"
    echo "Tags: $IMAGE_TAG, $TIMESTAMP"
else
    echo -e "${RED}✗ Image build failed${NC}"
    if [ "$FORCE_UPDATE" = true ]; then
        echo -e "${YELLOW}⚠ Continuing with update (--force flag set)${NC}"
    else
        echo "Update cancelled. Use --force to update anyway."
        exit 1
    fi
fi

# Step 2: Update deployment
echo -e "\n${BLUE}[2/3] Updating Kubernetes deployment...${NC}"

# Option 1: Force pod restart (uses latest image from registry)
if kubectl rollout restart deployment/better-chatbot -n $NAMESPACE; then
    echo -e "${GREEN}✓ Deployment restart initiated${NC}"
else
    echo -e "${RED}✗ Failed to restart deployment${NC}"
    exit 1
fi

# Wait for rollout to complete
echo -e "${BLUE}Waiting for rollout to complete...${NC}"
if kubectl rollout status deployment/better-chatbot -n $NAMESPACE --timeout=5m; then
    echo -e "${GREEN}✓ Rollout completed successfully${NC}"
else
    echo -e "${RED}✗ Rollout failed or timed out${NC}"
    echo "Check pod status: kubectl get pods -n $NAMESPACE"
    echo "Check logs: kubectl logs -f deployment/better-chatbot -n $NAMESPACE"
    exit 1
fi

# Step 3: Verify deployment
echo -e "\n${BLUE}[3/3] Verifying deployment...${NC}"

# Get pod status
PODS=$(kubectl get pods -n $NAMESPACE -l app=better-chatbot -o json)
READY_PODS=$(echo $PODS | jq -r '.items | map(select(.status.conditions[] | select(.type=="Ready" and .status=="True"))) | length')
TOTAL_PODS=$(echo $PODS | jq -r '.items | length')

echo "Ready pods: $READY_PODS/$TOTAL_PODS"

if [ "$READY_PODS" -gt 0 ]; then
    echo -e "${GREEN}✓ Deployment is healthy${NC}"
    
    # Show recent logs from new pod
    echo -e "\n${BLUE}Recent logs from new pod:${NC}"
    NEW_POD=$(kubectl get pods -n $NAMESPACE -l app=better-chatbot --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')
    echo "Pod: $NEW_POD"
    kubectl logs $NEW_POD -n $NAMESPACE --tail=20 || echo "Logs not available yet"
else
    echo -e "${YELLOW}⚠ No pods are ready yet${NC}"
    echo "This may be normal if pods are still starting up"
fi

# Get service information
echo -e "\n${BLUE}Service information:${NC}"
kubectl get service better-chatbot-service -n $NAMESPACE

EXTERNAL_IP=$(kubectl get service better-chatbot-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Update Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

if [ "$EXTERNAL_IP" != "pending" ]; then
    echo -e "\n${GREEN}🚀 Application URL: http://$EXTERNAL_IP${NC}"
fi

echo -e "\n${BLUE}Deployment details:${NC}"
kubectl get deployment better-chatbot -n $NAMESPACE

echo -e "\n${BLUE}Running pods:${NC}"
kubectl get pods -n $NAMESPACE -l app=better-chatbot

echo -e "\n${BLUE}Useful commands:${NC}"
echo "  # View logs"
echo "  kubectl logs -f deployment/better-chatbot -n $NAMESPACE"
echo ""
echo "  # Check pod status"
echo "  kubectl get pods -n $NAMESPACE"
echo ""
echo "  # Rollback to previous version (if issues)"
echo "  kubectl rollout undo deployment/better-chatbot -n $NAMESPACE"
echo ""
echo "  # View rollout history"
echo "  kubectl rollout history deployment/better-chatbot -n $NAMESPACE"

# Update deployment-info.txt with timestamp
if [ -f deployment-info.txt ]; then
    echo "" >> deployment-info.txt
    echo "Last Updated: $(date)" >> deployment-info.txt
    echo "Image Tags: $IMAGE_TAG, $TIMESTAMP" >> deployment-info.txt
fi

echo -e "\n${YELLOW}💡 Monitor the deployment with: kubectl get pods -n $NAMESPACE -w${NC}"

