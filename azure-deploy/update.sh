#!/bin/bash

# Update deployment script - rebuild and redeploy

set -e

if [ ! -f deployment-info.txt ]; then
    echo "❌ Error: deployment-info.txt not found"
    echo "Please run quick-deploy.sh first"
    exit 1
fi

# Extract info from deployment file
RESOURCE_GROUP=$(grep "Resource Group:" deployment-info.txt | cut -d: -f2 | xargs)
ACR_NAME=$(grep "ACR:" deployment-info.txt | cut -d: -f2 | awk '{print $1}' | xargs)

echo "🔄 Updating Better Chatbot deployment"
echo "====================================="
echo "Resource Group: $RESOURCE_GROUP"
echo "ACR: $ACR_NAME"
echo ""

# Build new image
echo "🔨 Building new image..."
az acr build \
    --registry $ACR_NAME \
    --image better-chatbot:latest \
    --image better-chatbot:$(date +%s) \
    --file ../docker/Dockerfile \
    ..

# Restart deployment
echo "🔄 Restarting deployment..."
kubectl rollout restart deployment/better-chatbot -n better-chatbot

echo "⏳ Waiting for rollout to complete..."
kubectl rollout status deployment/better-chatbot -n better-chatbot

echo ""
echo "✅ Update complete!"
echo ""
echo "📊 Check status:"
echo "   kubectl get pods -n better-chatbot"
echo "   kubectl logs -f deployment/better-chatbot -n better-chatbot"

