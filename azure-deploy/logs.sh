#!/bin/bash

# Better Chatbot - View Application Logs
# 
# Usage: ./logs.sh [OPTIONS]
#
# Options:
#   -f, --follow      Follow log output
#   -p, --pod NAME    View logs from specific pod
#   -n, --lines NUM   Number of lines to show (default: 100)
#   --previous        View logs from previous pod instance

set -e

# Colors
BLUE='\033[0;34m'
NC='\033[0m'

if [ ! -f deployment-config.sh ]; then
    echo "Error: deployment-config.sh not found"
    echo "Run ./initial-deploy.sh first"
    exit 1
fi

source deployment-config.sh

# Default values
FOLLOW=""
POD_NAME=""
LINES=100
PREVIOUS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW="-f"
            shift
            ;;
        -p|--pod)
            POD_NAME="$2"
            shift 2
            ;;
        -n|--lines)
            LINES="$2"
            shift 2
            ;;
        --previous)
            PREVIOUS="--previous"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./logs.sh [-f] [-p POD_NAME] [-n LINES] [--previous]"
            exit 1
            ;;
    esac
done

if [ -z "$POD_NAME" ]; then
    # Get logs from deployment (all pods)
    echo -e "${BLUE}Viewing logs from deployment: better-chatbot${NC}"
    kubectl logs deployment/better-chatbot -n $NAMESPACE --tail=$LINES $FOLLOW $PREVIOUS
else
    # Get logs from specific pod
    echo -e "${BLUE}Viewing logs from pod: $POD_NAME${NC}"
    kubectl logs $POD_NAME -n $NAMESPACE --tail=$LINES $FOLLOW $PREVIOUS
fi

