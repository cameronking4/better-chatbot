# Azure AKS Deployment Guide for Better Chatbot

This directory contains scripts to deploy your Better Chatbot application to Azure Kubernetes Service (AKS).

## Prerequisites

- Azure CLI installed and logged in (`az login`)
- Docker installed and running
- kubectl installed
- Active Azure subscription
- `.env` file in project root with your configuration

## Quick Start

### 1. Deploy to Azure AKS

Run the main deployment script:

```bash
./azure-aks-deploy/deploy.sh
```

This script will:
- Create an Azure Resource Group
- Create an Azure Container Registry (ACR)
- Build and push your Docker image to ACR
- Create an AKS cluster
- Create Kubernetes secrets from your `.env` file
- Deploy your application to AKS
- Expose the application via a LoadBalancer

**Default Configuration:**
- Resource Group: `better-chatbot-rg`
- Location: `eastus`
- AKS Name: `better-chatbot-aks`
- Node Count: `2`
- Node Size: `Standard_D2s_v3`

**Custom Configuration:**
You can override defaults by setting environment variables:

```bash
RESOURCE_GROUP=my-custom-rg \
LOCATION=westus2 \
NODE_COUNT=3 \
./azure-aks-deploy/deploy.sh
```

### 2. Check Deployment Status

```bash
./azure-aks-deploy/status.sh
```

This shows:
- Azure resources
- Kubernetes nodes
- Pods status
- Service details
- External IP address

### 3. View Application Logs

```bash
./azure-aks-deploy/logs.sh
```

Press `Ctrl+C` to exit.

## Update Deployment

### Update Code Changes

After making code changes, rebuild and redeploy:

```bash
./azure-aks-deploy/update-deployment.sh
```

This will:
- Build a new Docker image with timestamp tag
- Push to ACR
- Restart the deployment with the new image

### Update Environment Variables

After changing `.env` file:

```bash
./azure-aks-deploy/update-secrets.sh
```

This will:
- Update Kubernetes secrets from `.env`
- Restart the deployment to apply changes

## Manual kubectl Commands

### View Pods
```bash
kubectl get pods -n better-chatbot
```

### View Logs
```bash
kubectl logs -f deployment/better-chatbot -n better-chatbot
```

### Scale Deployment
```bash
kubectl scale deployment/better-chatbot --replicas=3 -n better-chatbot
```

### Get Service Info
```bash
kubectl get service better-chatbot-service -n better-chatbot
```

### Get External IP
```bash
kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### Execute Commands in Pod
```bash
kubectl exec -it deployment/better-chatbot -n better-chatbot -- /bin/sh
```

### Describe Pod (for troubleshooting)
```bash
kubectl describe pod <pod-name> -n better-chatbot
```

## Monitoring

### Check Pod Status
```bash
kubectl get pods -n better-chatbot -o wide
```

### View Events
```bash
kubectl get events -n better-chatbot --sort-by='.lastTimestamp'
```

### Check Resource Usage
```bash
kubectl top pods -n better-chatbot
kubectl top nodes
```

## Troubleshooting

### Pods Not Starting

1. Check pod status:
```bash
kubectl get pods -n better-chatbot
```

2. Describe the pod:
```bash
kubectl describe pod <pod-name> -n better-chatbot
```

3. Check logs:
```bash
kubectl logs <pod-name> -n better-chatbot
```

### Image Pull Errors

Ensure ACR is attached to AKS:
```bash
az aks update -n better-chatbot-aks -g better-chatbot-rg --attach-acr <acr-name>
```

### Database Connection Issues

Verify your `.env` file has the correct `POSTGRES_URL` for your Neon database.

Update secrets if needed:
```bash
./azure-aks-deploy/update-secrets.sh
```

### External IP Not Assigned

Wait a few minutes, then check:
```bash
kubectl get service better-chatbot-service -n better-chatbot --watch
```

## Cleanup

⚠️ **WARNING**: This will delete ALL resources and cannot be undone!

```bash
./azure-aks-deploy/cleanup.sh
```

This will:
- Delete the Kubernetes namespace
- Delete the entire Azure resource group
- Remove all AKS, ACR, and related resources

## Cost Management

To minimize costs:

1. **Scale down when not in use:**
```bash
kubectl scale deployment/better-chatbot --replicas=0 -n better-chatbot
```

2. **Stop the AKS cluster:**
```bash
az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg
```

3. **Start it again:**
```bash
az aks start --name better-chatbot-aks --resource-group better-chatbot-rg
```

4. **Delete completely:**
```bash
./azure-aks-deploy/cleanup.sh
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Azure Load Balancer            │
│              (Public IP)                 │
└───────────────┬─────────────────────────┘
                │
        ┌───────▼────────┐
        │  AKS Service   │
        │ (LoadBalancer) │
        └───────┬────────┘
                │
    ┌───────────▼────────────┐
    │                        │
┌───▼────┐              ┌────▼───┐
│  Pod 1 │              │ Pod 2  │
│(App)   │              │(App)   │
└───┬────┘              └────┬───┘
    │                        │
    └────────┬───────────────┘
             │
     ┌───────▼────────┐
     │  Neon Database │
     │  (PostgreSQL)  │
     └────────────────┘
```

## Security Notes

- The `.env` file contains sensitive credentials
- All secrets are stored as Kubernetes secrets
- ACR credentials are managed via Managed Identity
- Consider using Azure Key Vault for production secrets
- Ensure `.env` is in `.gitignore`

## Support

For issues or questions:
- Check logs: `./azure-aks-deploy/logs.sh`
- Check status: `./azure-aks-deploy/status.sh`
- Review Kubernetes events: `kubectl get events -n better-chatbot`

## File Structure

```
azure-aks-deploy/
├── deploy.sh              # Main deployment script
├── update-deployment.sh   # Update app with new code
├── update-secrets.sh      # Update environment variables
├── status.sh             # Check deployment status
├── logs.sh               # View application logs
├── cleanup.sh            # Delete all resources
├── README.md             # This file
└── k8s/                  # Generated during deployment
    ├── deployment.yaml   # Kubernetes deployment manifest
    └── service.yaml      # Kubernetes service manifest
```
