#!/bin/bash

# Better Chatbot - Cleanup Azure Resources
# WARNING: This will delete ALL Azure resources in the resource group

set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ ! -f deployment-config.sh ]; then
    echo -e "${RED}Error: deployment-config.sh not found${NC}"
    echo "Nothing to cleanup"
    exit 1
fi

source deployment-config.sh

echo -e "${RED}========================================${NC}"
echo -e "${RED}WARNING: Resource Cleanup${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo "This will DELETE the following Azure resources:"
echo "  - Resource Group: $RESOURCE_GROUP"
echo "  - ACR: $ACR_NAME"
echo "  - AKS Cluster: $AKS_NAME"
echo "  - Storage Account: $STORAGE_ACCOUNT_NAME"
echo "  - All persistent data"
echo ""
echo -e "${RED}This action CANNOT be undone!${NC}"
echo ""

read -p "Type 'DELETE' to confirm: " CONFIRM

if [ "$CONFIRM" != "DELETE" ]; then
    echo "Cleanup cancelled"
    exit 0
fi

echo ""
read -p "Are you absolutely sure? (yes/no): " FINAL_CONFIRM

if [ "$FINAL_CONFIRM" != "yes" ]; then
    echo "Cleanup cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Deleting resource group: $RESOURCE_GROUP${NC}"
echo "This will take a few minutes..."

az group delete --name $RESOURCE_GROUP --yes --no-wait

echo ""
echo -e "${GREEN}✓ Deletion initiated${NC}"
echo "Resources are being deleted in the background"
echo ""
echo "To check deletion status:"
echo "  az group show --name $RESOURCE_GROUP"
echo ""
echo "When complete, you may want to remove local configuration:"
echo "  rm deployment-config.sh deployment-info.txt"

