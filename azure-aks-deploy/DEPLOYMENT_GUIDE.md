# Better Chatbot - Azure AKS Deployment Guide

## Current Status

Your deployment is in progress! Docker images are currently being built.

## Deployment Methods

### Method 1: Step-by-Step (Recommended for monitoring)

Run these commands one at a time:

```bash
# Step 1: Build and push Docker image (5-10 minutes)
cd /Users/cameronking/Downloads/better-chatbot-main
./azure-aks-deploy/step1-build-image.sh

# Step 2: Create AKS cluster (5-10 minutes)
./azure-aks-deploy/step2-create-aks.sh

# Step 3: Deploy application (2-3 minutes)
./azure-aks-deploy/step3-deploy-app.sh
```

### Method 2: All-in-One

Run the complete deployment:

```bash
cd /Users/cameronking/Downloads/better-chatbot-main
./azure-aks-deploy/deploy.sh
```

## Monitor Progress

### Check build status:
```bash
./azure-aks-deploy/check-build-status.sh
```

### Check overall deployment status:
```bash
./azure-aks-deploy/status.sh
```

### View application logs:
```bash
./azure-aks-deploy/logs.sh
```

## After Deployment

### Get your application URL:
```bash
kubectl get service better-chatbot-service -n better-chatbot
```

The EXTERNAL-IP column will show your public IP address. Access your app at:
```
http://<EXTERNAL-IP>
```

### Common kubectl commands:

```bash
# View pods
kubectl get pods -n better-chatbot

# View detailed pod info
kubectl describe pod <pod-name> -n better-chatbot

# View logs
kubectl logs -f deployment/better-chatbot -n better-chatbot

# Scale deployment
kubectl scale deployment/better-chatbot --replicas=3 -n better-chatbot

# Restart deployment
kubectl rollout restart deployment/better-chatbot -n better-chatbot

# Check deployment status
kubectl rollout status deployment/better-chatbot -n better-chatbot
```

## Update Application

### After code changes:
```bash
./azure-aks-deploy/update-deployment.sh
```

### After .env changes:
```bash
./azure-aks-deploy/update-secrets.sh
```

## Troubleshooting

### If Docker build fails:

1. Check Docker is running:
```bash
docker info
```

2. Check Dockerfile syntax:
```bash
cat docker/Dockerfile
```

3. Try building locally:
```bash
docker build -t test -f docker/Dockerfile .
```

### If pods won't start:

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

### If external IP not assigned:

Wait 2-5 minutes, then check:
```bash
kubectl get service better-chatbot-service -n better-chatbot --watch
```

### Database connection issues:

1. Verify .env has correct POSTGRES_URL
2. Update secrets:
```bash
./azure-aks-deploy/update-secrets.sh
```

## Cleanup

⚠️ **WARNING**: This deletes everything!

```bash
./azure-aks-deploy/cleanup.sh
```

## Cost Management

### Stop AKS (keeps resources, stops billing for nodes):
```bash
az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg
```

### Start AKS:
```bash
az aks start --name better-chatbot-aks --resource-group better-chatbot-rg
```

### Scale to zero (keeps cluster, stops pods):
```bash
kubectl scale deployment/better-chatbot --replicas=0 -n better-chatbot
```

## Resources Created

- **Resource Group**: better-chatbot-rg
- **Azure Container Registry**: betterchatbotacr*
- **AKS Cluster**: better-chatbot-aks
- **Kubernetes Namespace**: better-chatbot
- **Load Balancer**: Automatically created by AKS
- **Secrets**: better-chatbot-env (from .env file)

## Architecture

```
Internet
   ↓
Azure Load Balancer (Public IP)
   ↓
AKS Service (LoadBalancer)
   ↓
   ├─→ Pod 1 (better-chatbot)
   └─→ Pod 2 (better-chatbot)
         ↓
   Neon PostgreSQL (External)
```

## Environment Variables

All environment variables from your `.env` file are automatically injected as Kubernetes secrets.

Key variables:
- `POSTGRES_URL`: Your Neon database connection string
- `NODE_ENV=production`
- `PORT=3000`
- `NO_HTTPS=1`
- All your API keys (Google, OpenAI, Anthropic, etc.)

## Next Steps After Deployment

1. **Test the application**: Visit http://<EXTERNAL-IP>
2. **Set up custom domain**: Point your domain to the external IP
3. **Configure SSL/TLS**: Add ingress with cert-manager
4. **Set up monitoring**: Add Azure Monitor or Prometheus
5. **Configure autoscaling**: Set up HPA (Horizontal Pod Autoscaler)

## Support

If you encounter issues:

1. Check logs: `./azure-aks-deploy/logs.sh`
2. Check status: `./azure-aks-deploy/status.sh`
3. Check build status: `./azure-aks-deploy/check-build-status.sh`
4. Review Kubernetes events: `kubectl get events -n better-chatbot --sort-by='.lastTimestamp'`

## Additional Configuration

### Enable SSL with Let's Encrypt:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer and Ingress resources
# (See Azure AKS + cert-manager documentation)
```

### Set up Horizontal Pod Autoscaler:

```bash
kubectl autoscale deployment better-chatbot \
  --cpu-percent=70 \
  --min=2 \
  --max=10 \
  -n better-chatbot
```

### Add persistent storage:

```bash
# Create PersistentVolumeClaim
# Update deployment to mount volume
# (See Kubernetes storage documentation)
```

## File Structure

```
azure-aks-deploy/
├── deploy.sh                  # Full deployment script
├── step1-build-image.sh       # Build & push Docker image
├── step2-create-aks.sh        # Create AKS cluster
├── step3-deploy-app.sh        # Deploy application
├── update-deployment.sh       # Update with new code
├── update-secrets.sh          # Update environment variables
├── status.sh                  # Check deployment status
├── logs.sh                    # View application logs
├── cleanup.sh                 # Delete all resources
├── check-build-status.sh      # Check Docker build progress
├── README.md                  # General documentation
├── DEPLOYMENT_GUIDE.md        # This file
└── k8s/                       # Kubernetes manifests (generated)
    ├── deployment.yaml
    └── service.yaml
```
