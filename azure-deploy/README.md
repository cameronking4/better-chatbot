# Better Chatbot - Azure AKS Deployment Guide

Complete guide for deploying Better Chatbot to Azure Kubernetes Service (AKS).

## 🚀 Quick Start (Recommended)

The fastest way to get your app running on Azure:

```bash
cd azure-deploy
./quick-deploy.sh
```

This will:
- ✅ Create all Azure resources (ACR, AKS cluster)
- ✅ Build and push your Docker image
- ✅ Deploy PostgreSQL database
- ✅ Deploy your application
- ✅ Provide you with a public URL

**Time:** ~10-15 minutes  
**Cost:** ~$70-100/month (with 2 Standard_B2s nodes)

## 📋 Prerequisites

1. **Azure CLI** - Already logged in ✅
   ```bash
   az account show
   ```

2. **kubectl** - Install if needed:
   ```bash
   az aks install-cli
   ```

3. **Environment File** - Create `.env` in project root with your API keys:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

## 📁 Project Structure

```
better-chatbot/
├── azure-deploy/
│   ├── quick-deploy.sh    # 🚀 Main deployment script
│   ├── deploy.sh          # Full featured deployment
│   ├── update.sh          # Update running deployment
│   ├── scale.sh           # Scale replicas
│   ├── status.sh          # Check deployment status
│   ├── cleanup.sh         # Delete all resources
│   └── README.md          # This file
├── k8s/
│   ├── deployment.yaml           # App deployment
│   ├── service.yaml              # LoadBalancer service
│   ├── postgres-deployment.yaml  # PostgreSQL
│   ├── postgres-service.yaml     # PostgreSQL service
│   ├── postgres-pvc.yaml         # Persistent storage
│   └── ingress.yaml              # Ingress configuration
└── docker/
    └── Dockerfile         # Container image
```

## 🎯 Deployment Options

### Option 1: Quick Deploy (Recommended)
Perfect for getting started quickly with sensible defaults.

```bash
cd azure-deploy
./quick-deploy.sh
```

**Configuration:**
- Resource Group: `better-chatbot-rg`
- Location: `eastus`
- Node Count: 2
- Node Size: `Standard_B2s` (2 vCPUs, 4GB RAM)

### Option 2: Full Deploy
More control over configuration and options.

```bash
cd azure-deploy
./deploy.sh
```

Edit the script to customize:
- `RESOURCE_GROUP` - Your resource group name
- `LOCATION` - Azure region (eastus, westus2, etc.)
- `NODE_COUNT` - Number of nodes (2-10)
- `NODE_SIZE` - VM size (Standard_B2s, Standard_D2s_v3, etc.)

## 🔄 Post-Deployment Operations

### Check Status
```bash
./status.sh
```

### Update Application
After making code changes:
```bash
./update.sh
```

### Scale Application
Scale to 5 replicas:
```bash
./scale.sh 5
```

### View Logs
```bash
kubectl logs -f deployment/better-chatbot -n better-chatbot
```

### Connect to Database
```bash
# Forward PostgreSQL port to localhost
kubectl port-forward service/postgres-service 5432:5432 -n better-chatbot

# Connect with psql
psql -h localhost -U postgres -d better_chatbot
```

### Access Kubernetes Dashboard
```bash
az aks browse --resource-group better-chatbot-rg --name better-chatbot-aks
```

## 🛠️ Manual Kubectl Commands

### View Resources
```bash
# All resources
kubectl get all -n better-chatbot

# Pods
kubectl get pods -n better-chatbot

# Services
kubectl get services -n better-chatbot

# Deployments
kubectl get deployments -n better-chatbot
```

### Debug Issues
```bash
# Describe pod
kubectl describe pod <pod-name> -n better-chatbot

# View logs
kubectl logs <pod-name> -n better-chatbot

# Follow logs
kubectl logs -f <pod-name> -n better-chatbot

# Execute commands in pod
kubectl exec -it <pod-name> -n better-chatbot -- /bin/sh
```

### Restart Deployment
```bash
kubectl rollout restart deployment/better-chatbot -n better-chatbot
```

### Update Environment Variables
```bash
# Update .env file, then:
kubectl create secret generic better-chatbot-env \
    --from-env-file=../.env \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/better-chatbot -n better-chatbot
```

## 💰 Cost Optimization

### Development/Testing
```bash
# Use smaller nodes
# Edit quick-deploy.sh:
NODE_SIZE="Standard_B2s"  # ~$30/month per node
NODE_COUNT=1
```

### Production
```bash
# Use larger nodes with autoscaling
NODE_SIZE="Standard_D2s_v3"  # ~$70/month per node
NODE_COUNT=3

# Enable autoscaling
az aks update \
    --resource-group better-chatbot-rg \
    --name better-chatbot-aks \
    --enable-cluster-autoscaler \
    --min-count 2 \
    --max-count 10
```

### Stop Resources (Save Money)
```bash
# Stop AKS cluster (save ~90% of costs)
az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg

# Start it again
az aks start --name better-chatbot-aks --resource-group better-chatbot-rg
```

## 🔒 Security Best Practices

### 1. Enable HTTPS with Let's Encrypt

Install cert-manager:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

Create ClusterIssuer and update ingress (examples in k8s/ folder).

### 2. Use Azure Key Vault for Secrets

```bash
az keyvault create \
    --name better-chatbot-kv \
    --resource-group better-chatbot-rg \
    --location eastus
```

### 3. Enable Network Policies

```bash
# Create network policy to restrict database access
kubectl apply -f k8s/network-policy.yaml
```

### 4. Enable Azure Monitor

```bash
az aks enable-addons \
    --resource-group better-chatbot-rg \
    --name better-chatbot-aks \
    --addons monitoring
```

## 📊 Monitoring & Observability

### View Metrics in Azure Portal
1. Go to Azure Portal
2. Navigate to your AKS cluster
3. Click "Insights" for detailed metrics

### Set Up Alerts
```bash
# CPU usage alert
az monitor metrics alert create \
    --name high-cpu-alert \
    --resource-group better-chatbot-rg \
    --scopes <aks-resource-id> \
    --condition "avg Percentage CPU > 80" \
    --description "Alert when CPU usage is high"
```

## 🗑️ Cleanup

### Delete Everything
```bash
./cleanup.sh
```

Or manually:
```bash
az group delete --name better-chatbot-rg --yes --no-wait
```

This will delete:
- AKS cluster
- Container registry
- Database and all data
- Network resources
- Everything in the resource group

## 🐛 Troubleshooting

### Pods not starting
```bash
kubectl describe pod <pod-name> -n better-chatbot
kubectl logs <pod-name> -n better-chatbot
```

Common issues:
- Image pull errors → Check ACR connection
- CrashLoopBackOff → Check environment variables
- Pending → Check node resources

### External IP not assigned
```bash
# Check service
kubectl get service better-chatbot-service -n better-chatbot

# Describe service
kubectl describe service better-chatbot-service -n better-chatbot
```

Takes 2-3 minutes usually. If stuck, check Azure Load Balancer in portal.

### Database connection issues
```bash
# Check postgres pod
kubectl get pods -l app=postgres -n better-chatbot

# Check postgres logs
kubectl logs -l app=postgres -n better-chatbot

# Test connection from app pod
kubectl exec -it <app-pod-name> -n better-chatbot -- sh
# Then inside pod:
nc -zv postgres-service 5432
```

### Out of resources
```bash
# Check node resources
kubectl top nodes

# Check pod resources
kubectl top pods -n better-chatbot

# Scale up nodes
az aks scale \
    --resource-group better-chatbot-rg \
    --name better-chatbot-aks \
    --node-count 3
```

## 📚 Additional Resources

- [Azure AKS Documentation](https://docs.microsoft.com/en-us/azure/aks/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Better Chatbot Main Docs](../README.md)

## 💡 Tips

1. **Save deployment-info.txt** - Contains your PostgreSQL password and resource names
2. **Use Azure Cost Management** - Monitor spending in Azure Portal
3. **Enable backups** - Set up automated backups for PostgreSQL data
4. **Use staging environment** - Test changes before production deployment
5. **Monitor logs** - Set up log aggregation (Azure Log Analytics)

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Run `./status.sh` to see current state
3. Check pod logs: `kubectl logs -f deployment/better-chatbot -n better-chatbot`
4. Review Azure Portal for resource status
5. Open an issue on GitHub with error messages

---

**Ready to deploy?**

```bash
cd azure-deploy
./quick-deploy.sh
```

Good luck! 🚀
