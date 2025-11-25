#!/bin/bash
# Better Chatbot - Deployment Configuration
# This file contains the current Azure deployment configuration
# Source this file to load environment variables: source deployment-config.sh

export RESOURCE_GROUP="better-chatbot-rg"
export LOCATION="eastus"
export ACR_NAME="betterchatbotacr1764026475"
export ACR_LOGIN_SERVER="betterchatbotacr1764026475.azurecr.io"
export AKS_NAME="better-chatbot-aks"
export NAMESPACE="better-chatbot"
export STORAGE_ACCOUNT_NAME="betterchatbotsa"
export FILE_SHARE_NAME="app-data"

# Display configuration when sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Deployment Configuration"
    echo "========================"
    echo "Resource Group:      $RESOURCE_GROUP"
    echo "Location:            $LOCATION"
    echo "ACR Name:            $ACR_NAME"
    echo "ACR Login Server:    $ACR_LOGIN_SERVER"
    echo "AKS Cluster:         $AKS_NAME"
    echo "Namespace:           $NAMESPACE"
    echo "Storage Account:     $STORAGE_ACCOUNT_NAME"
    echo "File Share:          $FILE_SHARE_NAME"
fi
