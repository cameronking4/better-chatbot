#!/bin/bash

echo "Checking Docker build status..."
if ps aux | grep -E "docker build.*better-chatbot" | grep -v grep > /dev/null; then
    echo "✓ Docker build is still running"
    echo "Build process(es):"
    ps aux | grep -E "docker build.*better-chatbot" | grep -v grep
else
    echo "✗ No Docker build process found"
fi

echo ""
echo "Checking ACR repositories..."
RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv 2>/dev/null)

if [ ! -z "$ACR_NAME" ]; then
    echo "ACR: $ACR_NAME"
    az acr repository list --name $ACR_NAME --output table 2>/dev/null || echo "No repositories yet"
    
    if az acr repository show --name $ACR_NAME --repository better-chatbot &>/dev/null; then
        echo ""
        echo "✓ better-chatbot image exists in ACR"
        az acr repository show-tags --name $ACR_NAME --repository better-chatbot --output table
    fi
fi
