#!/bin/bash

# Better Chatbot - Check Deployment Status
# Shows comprehensive status of all deployment components

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ ! -f deployment-config.sh ]; then
    echo -e "${RED}Error: deployment-config.sh not found${NC}"
    echo "Run ./initial-deploy.sh first"
    exit 1
fi

source deployment-config.sh

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Better Chatbot - Deployment Status${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${BLUE}Azure Resources${NC}"
echo "---------------"
echo "Resource Group: $RESOURCE_GROUP"
echo "ACR: $ACR_NAME"
echo "AKS Cluster: $AKS_NAME"
echo "Namespace: $NAMESPACE"

echo -e "\n${BLUE}Azure Container Registry${NC}"
az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "{Name:name,LoginServer:loginServer,Status:provisioningState}" -o table 2>/dev/null || echo "Not found"

echo -e "\n${BLUE}Recent Images${NC}"
az acr repository show-tags --name $ACR_NAME --repository better-chatbot --orderby time_desc --output table 2>/dev/null | head -10 || echo "No images found"

echo -e "\n${BLUE}AKS Cluster Status${NC}"
az aks show --name $AKS_NAME --resource-group $RESOURCE_GROUP --query "{Name:name,Status:powerState.code,K8sVersion:kubernetesVersion,NodeCount:agentPoolProfiles[0].count}" -o table 2>/dev/null || echo "Not found"

echo -e "\n${BLUE}Kubernetes Deployment${NC}"
kubectl get deployment better-chatbot -n $NAMESPACE -o wide 2>/dev/null || echo "Deployment not found"

echo -e "\n${BLUE}Pods${NC}"
kubectl get pods -n $NAMESPACE -l app=better-chatbot -o wide 2>/dev/null || echo "No pods found"

echo -e "\n${BLUE}Service${NC}"
kubectl get service better-chatbot-service -n $NAMESPACE 2>/dev/null || echo "Service not found"

EXTERNAL_IP=$(kubectl get service better-chatbot-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

if [ "$EXTERNAL_IP" != "pending" ]; then
    echo -e "\n${GREEN}🚀 Application URL: http://$EXTERNAL_IP${NC}"
else
    echo -e "\n${YELLOW}⏳ External IP is pending...${NC}"
fi

echo -e "\n${BLUE}Persistent Volume${NC}"
kubectl get pvc -n $NAMESPACE 2>/dev/null || echo "No PVC found"

echo -e "\n${BLUE}Recent Events${NC}"
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' 2>/dev/null | tail -10 || echo "No events"

echo -e "\n${BLUE}Resource Usage (per pod)${NC}"
kubectl top pods -n $NAMESPACE -l app=better-chatbot 2>/dev/null || echo "Metrics not available (may need to wait a moment)"

