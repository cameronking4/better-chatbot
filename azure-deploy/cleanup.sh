#!/bin/bash

# Cleanup script - delete everything

set -e

if [ ! -f deployment-info.txt ]; then
    echo "❌ Error: deployment-info.txt not found"
    exit 1
fi

RESOURCE_GROUP=$(grep "Resource Group:" deployment-info.txt | cut -d: -f2 | xargs)

echo "🗑️  Cleanup - Better Chatbot"
echo "============================"
echo ""
echo "⚠️  This will DELETE the following resource group and ALL its contents:"
echo "   Resource Group: $RESOURCE_GROUP"
echo ""
echo "This includes:"
echo "  - AKS Cluster"
echo "  - Container Registry"
echo "  - All data and databases"
echo "  - Network resources"
echo ""
read -p "Are you SURE you want to delete everything? (type 'yes' to confirm): " -r
echo

if [[ ! $REPLY == "yes" ]]; then
    echo "Cancelled."
    exit 1
fi

echo "🗑️  Deleting resource group $RESOURCE_GROUP..."
az group delete --name $RESOURCE_GROUP --yes

echo ""
echo "✅ Cleanup complete!"
echo "All Azure resources have been deleted."
echo ""
echo "You can safely delete:"
echo "  - deployment-info.txt"
echo "  - kubectl config entry (optional)"

