#!/bin/bash

# Quick deployment script - one command deployment
# Usage: ./quick-deploy.sh

cd "$(dirname "$0")"
./deploy.sh --yes

