# Better Chatbot - Azure AKS Deployment

This directory contains scripts for deploying and managing the Better Chatbot application on Azure Kubernetes Service (AKS).

## 📋 Prerequisites

- **Azure CLI**: [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- **kubectl**: [Install kubectl](https://kubernetes.io/docs/tasks/tools/)
- **Azure Subscription**: Active Azure account with permissions to create resources
- **.env file**: Required environment variables in project root

## 🚀 Quick Start

### Initial Deployment (First Time)

For a brand new deployment with fresh Azure resources:

```bash
# Login to Azure
az login

# Run initial deployment
./initial-deploy.sh
```

This will:
1. Create Azure Resource Group
2. Create Azure Container Registry (ACR)
3. Create Azure Storage Account with File Share
4. Build and push Docker image
5. Create AKS cluster
6. Deploy application with persistent storage
7. Configure kubectl
8. Generate deployment configuration files

**Duration**: ~15-20 minutes

### Update Deployment (Existing Infrastructure)

To deploy code changes to your existing AKS cluster:

```bash
./update-deploy.sh
```

This will:
1. Build new Docker image from latest code
2. Push to existing ACR
3. Rolling update of Kubernetes deployment
4. Verify new pods are healthy

**Duration**: ~3-5 minutes

**Options**:
- `--force`: Continue update even if build fails
- `--tag TAG`: Use specific image tag instead of 'latest'

## 📁 Files Overview

### Deployment Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `initial-deploy.sh` | Full infrastructure setup | First deployment or new environment |
| `update-deploy.sh` | Update running app | Deploy code changes |
| `deployment-config.sh` | Configuration variables | Auto-generated, sourced by other scripts |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `status.sh` | View deployment status |
| `logs.sh` | View application logs |
| `scale.sh` | Scale pod count |
| `cleanup.sh` | Delete all Azure resources |

### Generated Files

| File | Contents |
|------|----------|
| `deployment-config.sh` | Environment variables for scripts |
| `deployment-info.txt` | Complete deployment information |

## 🔧 Common Operations

### View Application Status

```bash
./status.sh
```

Shows:
- Azure resource status
- Container images
- Pod status
- Service endpoints
- Recent events

### View Logs

```bash
# View recent logs
./logs.sh

# Follow logs (real-time)
./logs.sh --follow

# View specific pod
./logs.sh --pod POD_NAME

# View last 50 lines
./logs.sh --lines 50

# View previous pod instance
./logs.sh --previous
```

### Scale Application

```bash
# Scale to 3 replicas
./scale.sh 3

# Scale down to 1 replica
./scale.sh 1
```

### Access Pod Shell

```bash
source deployment-config.sh
kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- /bin/sh
```

### Check Persistent Data

```bash
source deployment-config.sh
kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- ls -la /app/data
```

## 🗄️ Architecture

### Azure Resources

```
better-chatbot-rg (Resource Group)
├── betterchatbotacr* (Container Registry)
│   └── better-chatbot:latest (Docker Image)
├── better-chatbot-aks (AKS Cluster)
│   ├── 2 nodes (Standard_D2s_v3)
│   └── Azure Monitor integration
└── betterchatbotsa* (Storage Account)
    └── app-data (File Share)
```

### Kubernetes Resources

```
better-chatbot (Namespace)
├── Deployment: better-chatbot (2 replicas)
├── Service: better-chatbot-service (LoadBalancer)
├── PVC: azure-file-share (persistent data)
└── Secrets:
    ├── better-chatbot-env (app config)
    └── azure-storage-secret (storage credentials)
```

### Data Flow

```
Internet → LoadBalancer → Service → Pods
                                     │
                                     └─→ Azure File Share (/app/data)
```

## 🔐 Configuration

### Environment Variables

Application configuration is loaded from `.env` file in project root. Required variables:

```bash
# See main project README for full list
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
# ... etc
```

These are automatically deployed as Kubernetes secrets during `initial-deploy.sh`.

### Persistent Storage

Data is stored in Azure File Share mounted at `/app/data` in containers. This includes:
- Uploaded files
- Application data
- Any persistent state

Data persists across pod restarts and deployments.

## 📊 Monitoring

### Check Pod Health

```bash
source deployment-config.sh
kubectl get pods -n $NAMESPACE -w
```

### View Resource Usage

```bash
source deployment-config.sh
kubectl top pods -n $NAMESPACE
kubectl top nodes
```

### View Events

```bash
source deployment-config.sh
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'
```

### Access Azure Portal

Monitor resources at: https://portal.azure.com
- Navigate to Resource Group: `better-chatbot-rg`

## 🔄 Rollback

If an update causes issues:

```bash
source deployment-config.sh

# Rollback to previous version
kubectl rollout undo deployment/better-chatbot -n $NAMESPACE

# View rollout history
kubectl rollout history deployment/better-chatbot -n $NAMESPACE

# Rollback to specific revision
kubectl rollout undo deployment/better-chatbot -n $NAMESPACE --to-revision=2
```

## 🧹 Cleanup

To delete all Azure resources:

```bash
./cleanup.sh
```

⚠️ **WARNING**: This permanently deletes:
- All Azure resources
- Container images
- Persistent data
- Configuration

This action cannot be undone!

## 💰 Cost Optimization

### Current Configuration Costs (Approximate)

- **AKS**: ~$140/month (2 x Standard_D2s_v3 nodes)
- **ACR**: ~$5/month (Basic tier)
- **Storage**: ~$0.10/month (File Share)
- **Load Balancer**: ~$18/month
- **Monitoring**: ~$2/month

**Total**: ~$165/month

### Cost Reduction Options

1. **Scale down when not in use**:
   ```bash
   ./scale.sh 1  # Reduce to 1 replica
   ```

2. **Stop AKS cluster** (deallocate nodes):
   ```bash
   az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg
   # Start later with:
   az aks start --name better-chatbot-aks --resource-group better-chatbot-rg
   ```

3. **Use smaller node size** (edit `initial-deploy.sh`):
   ```bash
   NODE_SIZE="Standard_B2s"  # ~$30/month per node
   ```

## 🐛 Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n better-chatbot

# Describe pod for events
kubectl describe pod POD_NAME -n better-chatbot

# Check logs
./logs.sh --lines 100
```

### Image Pull Errors

```bash
# Verify ACR connection
source deployment-config.sh
az acr login --name $ACR_NAME

# Check AKS-ACR integration
az aks check-acr --name $AKS_NAME --resource-group $RESOURCE_GROUP --acr $ACR_LOGIN_SERVER
```

### External IP Pending

```bash
# Check service
kubectl get service better-chatbot-service -n better-chatbot

# Check events
kubectl describe service better-chatbot-service -n better-chatbot
```

Usually takes 2-5 minutes to assign external IP.

### Deployment Config Lost

If `deployment-config.sh` is deleted, recreate it:

```bash
cat > deployment-config.sh << 'CONFIG'
#!/bin/bash
export RESOURCE_GROUP="better-chatbot-rg"
export LOCATION="eastus"
export ACR_NAME="betterchatbotacr1764026475"
export ACR_LOGIN_SERVER="betterchatbotacr1764026475.azurecr.io"
export AKS_NAME="better-chatbot-aks"
export NAMESPACE="better-chatbot"
export STORAGE_ACCOUNT_NAME="betterchatbotsa"
export FILE_SHARE_NAME="app-data"
CONFIG

chmod +x deployment-config.sh
```

## 📚 Additional Resources

- [Azure AKS Documentation](https://docs.microsoft.com/en-us/azure/aks/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Azure Container Registry](https://docs.microsoft.com/en-us/azure/container-registry/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## 🤝 Support

For issues:
1. Check logs: `./logs.sh --follow`
2. Check status: `./status.sh`
3. Review Kubernetes events
4. Check Azure Portal for resource health

## 📝 Notes

- Always test updates in a non-production environment first
- Keep `deployment-config.sh` and `deployment-info.txt` backed up
- Monitor costs in Azure Portal
- Set up budget alerts in Azure
- Use Azure DevOps or GitHub Actions for CI/CD in production

