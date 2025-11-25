#!/bin/bash

# Check deployment status

echo "📊 Better Chatbot - Status Check"
echo "================================="
echo ""

if [ -f deployment-info.txt ]; then
    echo "📝 Deployment Info:"
    cat deployment-info.txt
    echo ""
fi

echo "☸️  Kubernetes Status:"
echo "--------------------"

echo ""
echo "📦 Pods:"
kubectl get pods -n better-chatbot

echo ""
echo "🌐 Services:"
kubectl get services -n better-chatbot

echo ""
echo "📊 Deployments:"
kubectl get deployments -n better-chatbot

echo ""
echo "💾 Persistent Volumes:"
kubectl get pvc -n better-chatbot

echo ""
EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)

if [ ! -z "$EXTERNAL_IP" ]; then
    echo "🌍 Public URL: http://$EXTERNAL_IP"
else
    echo "⏳ External IP not yet assigned"
fi

echo ""
echo "📋 Recent Logs (last 20 lines):"
echo "--------------------------------"
kubectl logs --tail=20 -l app=better-chatbot -n better-chatbot 2>/dev/null || echo "No logs available yet"

