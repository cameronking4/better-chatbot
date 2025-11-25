#!/bin/bash

# Better Chatbot - Scale Deployment
# 
# Usage: ./scale.sh <number_of_replicas>

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ ! -f deployment-config.sh ]; then
    echo -e "${RED}Error: deployment-config.sh not found${NC}"
    echo "Run ./initial-deploy.sh first"
    exit 1
fi

source deployment-config.sh

if [ -z "$1" ]; then
    echo "Usage: ./scale.sh <number_of_replicas>"
    echo ""
    echo "Current deployment:"
    kubectl get deployment better-chatbot -n $NAMESPACE
    exit 1
fi

REPLICAS=$1

echo -e "${BLUE}Scaling deployment to $REPLICAS replicas...${NC}"
kubectl scale deployment better-chatbot --replicas=$REPLICAS -n $NAMESPACE

echo -e "${BLUE}Waiting for scaling to complete...${NC}"
kubectl rollout status deployment/better-chatbot -n $NAMESPACE

echo -e "\n${GREEN}✓ Scaling complete!${NC}"
echo ""
kubectl get deployment better-chatbot -n $NAMESPACE
echo ""
kubectl get pods -n $NAMESPACE -l app=better-chatbot

