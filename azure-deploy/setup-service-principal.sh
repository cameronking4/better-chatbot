#!/bin/bash

# Better Chatbot - Setup Azure Service Principal for Container Authentication
# This script creates a service principal and adds credentials to .env and cluster
#
# Usage: ./setup-service-principal.sh [--yes]

set -e

# Parse arguments
NON_INTERACTIVE=false
if [[ "$1" == "--yes" ]] || [[ "$1" == "-y" ]]; then
    NON_INTERACTIVE=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load deployment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deployment-config.sh" ]; then
    source "$SCRIPT_DIR/deployment-config.sh"
else
    echo -e "${RED}Error: deployment-config.sh not found${NC}"
    echo "Please run initial-deploy.sh first or create deployment-config.sh"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Azure Service Principal Setup${NC}"
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

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Azure. Please run 'az login' first.${NC}"
    exit 1
fi

# Get subscription ID
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo -e "${GREEN}✓ All prerequisites met${NC}"

echo -e "\n${YELLOW}Configuration:${NC}"
echo "Subscription ID: $SUBSCRIPTION_ID"
echo "Tenant ID: $TENANT_ID"
echo "Resource Group: $RESOURCE_GROUP"
echo "Namespace: $NAMESPACE"

# Service principal name
SP_NAME="better-chatbot-sp-$(date +%s)"

echo -e "\n${BLUE}Creating service principal: $SP_NAME${NC}"
echo "This will grant Contributor access to resource group: $RESOURCE_GROUP"

if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 1
    fi
else
    echo -e "${GREEN}Non-interactive mode: proceeding automatically${NC}"
fi

# Create service principal with Contributor role on the resource group
echo -e "\n${BLUE}Creating service principal...${NC}"
SP_OUTPUT=$(az ad sp create-for-rbac \
    --name "$SP_NAME" \
    --role contributor \
    --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
    --output json)

# Extract values
CLIENT_ID=$(echo "$SP_OUTPUT" | jq -r '.appId')
CLIENT_SECRET=$(echo "$SP_OUTPUT" | jq -r '.password')

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" == "null" ]; then
    echo -e "${RED}Error: Failed to create service principal${NC}"
    echo "$SP_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✓ Service principal created${NC}"
echo -e "\n${YELLOW}Service Principal Details:${NC}"
echo "Client ID: $CLIENT_ID"
echo "Tenant ID: $TENANT_ID"
echo "Client Secret: ${CLIENT_SECRET:0:10}... (hidden)"

# Check if .env file exists
ENV_FILE="$SCRIPT_DIR/../.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "\n${YELLOW}⚠ .env file not found. Creating new one...${NC}"
    touch "$ENV_FILE"
fi

# Backup .env file
ENV_BACKUP="${ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$ENV_BACKUP"
echo -e "${GREEN}✓ Backed up .env to $ENV_BACKUP${NC}"

# Add or update Azure credentials in .env
echo -e "\n${BLUE}Updating .env file...${NC}"

# Remove existing Azure credential lines if they exist
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' '/^AZURE_CLIENT_ID=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^AZURE_CLIENT_SECRET=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^AZURE_TENANT_ID=/d' "$ENV_FILE" 2>/dev/null || true
else
    # Linux
    sed -i '/^AZURE_CLIENT_ID=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '/^AZURE_CLIENT_SECRET=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '/^AZURE_TENANT_ID=/d' "$ENV_FILE" 2>/dev/null || true
fi

# Append new credentials
echo "" >> "$ENV_FILE"
echo "# Azure Service Principal Credentials (for Azure CLI in container)" >> "$ENV_FILE"
echo "AZURE_CLIENT_ID=$CLIENT_ID" >> "$ENV_FILE"
echo "AZURE_CLIENT_SECRET=$CLIENT_SECRET" >> "$ENV_FILE"
echo "AZURE_TENANT_ID=$TENANT_ID" >> "$ENV_FILE"

echo -e "${GREEN}✓ Added Azure credentials to .env${NC}"

# Update Kubernetes secret
echo -e "\n${BLUE}Updating Kubernetes secret...${NC}"

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}⚠ Namespace $NAMESPACE does not exist. Creating it...${NC}"
    kubectl create namespace "$NAMESPACE"
fi

# Clean .env file (same logic as deploy.sh)
grep -v '^#' "$ENV_FILE" | grep -v '^$' | \
    sed 's/^POSTGRES_URL="\(.*\)"$/POSTGRES_URL=\1/' | \
    sed 's/^POSTGRES_URL_DEV="\(.*\)"$/POSTGRES_URL_DEV=\1/' | \
    grep -v '^FILE_BASED_MCP_CONFIG' | \
    sort -u > /tmp/env-clean.txt

# Delete and recreate secret
kubectl delete secret better-chatbot-env -n "$NAMESPACE" 2>/dev/null || true
kubectl create secret generic better-chatbot-env \
    --from-env-file=/tmp/env-clean.txt \
    --namespace="$NAMESPACE"

rm /tmp/env-clean.txt

echo -e "${GREEN}✓ Kubernetes secret updated${NC}"

# Test authentication
echo -e "\n${BLUE}Testing Azure CLI authentication...${NC}"
export AZURE_CLIENT_ID="$CLIENT_ID"
export AZURE_CLIENT_SECRET="$CLIENT_SECRET"
export AZURE_TENANT_ID="$TENANT_ID"

if az account show --query "{subscriptionId:id, tenantId:tenantId}" &> /dev/null; then
    echo -e "${GREEN}✓ Azure CLI authentication successful${NC}"
else
    echo -e "${YELLOW}⚠ Azure CLI authentication test failed (this is OK if running outside container)${NC}"
fi

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}Summary:${NC}"
echo "✓ Service principal created: $SP_NAME"
echo "✓ Credentials added to .env file"
echo "✓ Kubernetes secret updated"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. The credentials are now in your .env file"
echo "2. Kubernetes secret has been updated"
echo "3. Restart your pods to load the new credentials:"
echo "   ${BLUE}kubectl rollout restart deployment/better-chatbot -n $NAMESPACE${NC}"
echo ""
echo -e "${YELLOW}To test in a pod:${NC}"
echo "   ${BLUE}kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- az account show${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} Client secret is stored in .env and Kubernetes secret."
echo "Keep these secure and never commit .env to version control."

