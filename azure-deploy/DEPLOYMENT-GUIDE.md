# Smooth Deployment Guide

This guide explains how to deploy changes to your AKS cluster with ease.

## Quick Start

### One-Command Deployment

```bash
pnpm deploy:quick
```

This will:
- Update environment variables from `.env`
- Build Docker image locally
- Push to Azure Container Registry
- Deploy to AKS cluster
- Wait for rollout to complete

### Manual Deployment

```bash
cd azure-deploy
./deploy.sh
```

## Deployment Options

### Using npm scripts (recommended)

```bash
# Full deployment (build + env update + deploy)
pnpm deploy

# Quick deployment (non-interactive)
pnpm deploy:quick

# Skip Docker build (use existing image)
pnpm deploy:skip-build

# Skip environment variable update
pnpm deploy:skip-env
```

### Using deployment scripts directly

```bash
cd azure-deploy

# Full deployment with prompts
./deploy.sh

# Quick deployment (non-interactive)
./quick-deploy.sh

# Skip Docker build
./deploy.sh --skip-build

# Skip environment update
./deploy.sh --skip-env

# Use specific image tag
./deploy.sh --tag v1.0.0

# Non-interactive mode
./deploy.sh --yes
```

## Automated Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically deploys when you push to `main` branch.

### Setup

1. Add these secrets to your GitHub repository:
   - `AZURE_CLIENT_ID` - Azure service principal client ID
   - `AZURE_TENANT_ID` - Azure tenant ID
   - `AZURE_SUBSCRIPTION_ID` - Azure subscription ID

2. The workflow will automatically:
   - Build Docker image
   - Push to ACR
   - Update environment variables (if `.env` exists)
   - Deploy to AKS

### Manual Trigger

You can also trigger deployments manually from GitHub Actions tab with options to:
- Skip Docker build
- Skip environment variable update

## What Gets Deployed

### Environment Variables
- Automatically synced from `.env` file
- Stored in Kubernetes secret `better-chatbot-env`
- Applied to all pods on restart

### Azure CLI Authentication

The Docker container includes Azure CLI and will automatically authenticate using service principal credentials from environment variables. Add these to your `.env` file:

```bash
AZURE_CLIENT_ID=your-service-principal-client-id
AZURE_CLIENT_SECRET=your-service-principal-secret
AZURE_TENANT_ID=your-azure-tenant-id
```

Azure CLI's `DefaultAzureCredential` will automatically detect and use these variables, giving your container full access to Azure resources based on the service principal's permissions.

**To create a service principal:**
```bash
az ad sp create-for-rbac --name "better-chatbot-sp" --role contributor --scopes /subscriptions/{subscription-id}
```

**To grant specific permissions:**
```bash
az role assignment create \
  --assignee {service-principal-client-id} \
  --role {role-name} \
  --scope /subscriptions/{subscription-id}/resourceGroups/{resource-group-name}
```

### Docker Image
- Built for `linux/amd64` platform (required for AKS)
- Tagged with `latest` and timestamp
- Pushed to Azure Container Registry

### Kubernetes Resources
- Deployment restarted to pull new image
- Pods rolled out with zero downtime
- Health checks ensure successful deployment

## Troubleshooting

### Check deployment status
```bash
kubectl get pods -n better-chatbot
kubectl get deployment better-chatbot -n better-chatbot
```

### View logs
```bash
kubectl logs -f deployment/better-chatbot -n better-chatbot
```

### Rollback if needed
```bash
kubectl rollout undo deployment/better-chatbot -n better-chatbot
```

### Check Redis status
```bash
kubectl get pods -n better-chatbot -l app=redis
```

## Best Practices

1. **Test locally first**: Always test changes locally before deploying
2. **Use feature branches**: Make changes in branches, test, then merge to main
3. **Monitor deployment**: Watch the deployment logs during rollout
4. **Keep .env updated**: Ensure `.env` has latest values before deploying
5. **Use tags for releases**: Tag important releases for easy rollback

## Common Workflows

### Deploy UI Changes
```bash
# Make your UI changes
git add .
git commit -m "feat: update UI"
git push origin main
# GitHub Actions will auto-deploy, or run:
pnpm deploy:quick
```

### Deploy API Changes
```bash
# Make your API changes
git add .
git commit -m "feat: add new API endpoint"
pnpm deploy:quick
```

### Update Environment Variables Only
```bash
# Update .env file
pnpm deploy:skip-build
```

### Quick Hotfix
```bash
# Make fix
git add .
git commit -m "fix: critical bug"
pnpm deploy:quick
```

## Deployment Checklist

- [ ] Code changes tested locally
- [ ] `.env` file updated if needed
- [ ] Azure CLI logged in (`az login`)
- [ ] kubectl context set to correct cluster
- [ ] Run deployment command
- [ ] Verify pods are ready
- [ ] Check application URL
- [ ] Test critical functionality

## Need Help?

- Check deployment logs: `kubectl logs -f deployment/better-chatbot -n better-chatbot`
- View pod status: `kubectl get pods -n better-chatbot`
- Check events: `kubectl get events -n better-chatbot --sort-by='.lastTimestamp'`

