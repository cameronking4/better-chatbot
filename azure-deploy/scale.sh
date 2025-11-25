#!/bin/bash

# Scale the deployment

if [ -z "$1" ]; then
    echo "Usage: ./scale.sh <number-of-replicas>"
    echo "Example: ./scale.sh 5"
    exit 1
fi

REPLICAS=$1

echo "🔄 Scaling to $REPLICAS replicas..."
kubectl scale deployment better-chatbot --replicas=$REPLICAS -n better-chatbot

echo "⏳ Waiting for scale to complete..."
kubectl rollout status deployment/better-chatbot -n better-chatbot

echo "✅ Scaled to $REPLICAS replicas"
kubectl get pods -n better-chatbot

