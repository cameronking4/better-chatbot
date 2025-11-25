#!/bin/bash

# View logs from the application

echo "📋 Better Chatbot - Logs Viewer"
echo "==============================="
echo ""

if [ "$1" == "postgres" ]; then
    echo "🗄️  PostgreSQL Logs:"
    echo "-------------------"
    kubectl logs -f -l app=postgres -n better-chatbot
elif [ "$1" == "all" ]; then
    echo "📋 All Logs:"
    echo "-----------"
    kubectl logs -l app=better-chatbot -n better-chatbot --all-containers=true --tail=100
    kubectl logs -l app=postgres -n better-chatbot --tail=50
else
    echo "📱 Application Logs (following):"
    echo "--------------------------------"
    echo "Press Ctrl+C to exit"
    echo ""
    kubectl logs -f -l app=better-chatbot -n better-chatbot
fi

