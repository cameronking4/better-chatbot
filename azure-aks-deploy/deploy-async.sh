#!/bin/bash

# Run deployment in background and log to file
cd /Users/cameronking/Downloads/better-chatbot-main

echo "Starting deployment in background..."
echo "Logs will be written to: deployment.log"

nohup ./azure-aks-deploy/deploy.sh > deployment.log 2>&1 &

DEPLOY_PID=$!
echo "Deployment PID: $DEPLOY_PID"
echo "$DEPLOY_PID" > deployment.pid

echo ""
echo "To monitor progress, run:"
echo "  tail -f deployment.log"
echo ""
echo "To check if still running:"
echo "  ps -p $DEPLOY_PID"
