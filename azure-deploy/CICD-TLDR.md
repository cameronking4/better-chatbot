# Azure AKS CI/CD - TL;DR

> Quick reference for the Azure AKS CI/CD GitHub Action implementation

## What This Does

Automated CI/CD pipeline that:
1. ✅ Runs tests and builds on every push to main
2. ✅ Builds Docker image and pushes to Azure Container Registry
3. ✅ Deploys to Azure Kubernetes Service
4. ✅ Zero-downtime rolling updates
5. ✅ Automatic rollback on failures
6. ✅ Manual trigger support

## Quick Setup (30 minutes)

### Prerequisites
- Existing AKS cluster (from `initial-deploy.sh`)
- GitHub repository with admin access
- Azure CLI installed locally

### Setup Steps

```bash
# 1. Create Service Principal
az ad sp create-for-rbac \
  --name "github-actions-better-chatbot" \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv)/resourceGroups/better-chatbot-rg \
  --sdk-auth
# Save the JSON output

# 2. Get ACR credentials
source azure-deploy/deployment-config.sh
az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP
# Save username and password

# 3. Encode .env file
base64 -i .env > .env.base64
# Copy the output

# 4. Add GitHub Secrets (in repo Settings → Secrets → Actions):
# - AZURE_CREDENTIALS (JSON from step 1)
# - ACR_LOGIN_SERVER (e.g., betterchatbotacr123.azurecr.io)
# - ACR_USERNAME (from step 2)
# - ACR_PASSWORD (from step 2)
# - AKS_NAME (e.g., better-chatbot-aks)
# - AKS_RESOURCE_GROUP (e.g., better-chatbot-rg)
# - AKS_NAMESPACE (e.g., better-chatbot)
# - APP_ENV_SECRETS (from step 3)

# 5. Copy workflow file
cp azure-deploy/azure-aks-deploy.yml .github/workflows/

# 6. Commit and push
git add .github/workflows/azure-aks-deploy.yml
git commit -m "Add Azure AKS CI/CD workflow"
git push origin main
```

### Test It

1. Go to GitHub → **Actions** tab
2. Select **Deploy to Azure AKS** workflow
3. Click **Run workflow** → **Run workflow**
4. Watch it deploy! 🚀

## How It Works

```
┌─────────────┐
│  Push Code  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Build & Test│ ← Runs linter, type check, tests
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Build Image │ ← Docker build → push to ACR
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Deploy AKS  │ ← kubectl update → rolling update
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Verify    │ ← Health checks, logs, status
└─────────────┘
```

## Architecture

### Image Tags
Every build creates 3 tags:
- `latest` - Always current
- `<commit-sha>` - Git commit (e.g., `a3f8c91`)
- `<timestamp>` - Build time (e.g., `20250126-143052`)

### Deployment Strategy
- **Rolling Update**: Updates pods one at a time
- **Zero Downtime**: Always maintains availability
- **Auto Rollback**: Reverts on failure

### Secrets Flow
```
GitHub Secrets
    ↓
Azure Login (Service Principal)
    ↓
ACR Push (Container image)
    ↓
AKS Deploy (Kubernetes)
    ↓
App Runtime (Environment variables)
```

## Common Operations

### Trigger Manual Deployment
```
GitHub → Actions → Deploy to Azure AKS → Run workflow
```

### Rollback to Previous Version
```bash
kubectl rollout undo deployment/better-chatbot -n better-chatbot
```

### View Deployment Status
```bash
kubectl get deployment better-chatbot -n better-chatbot
kubectl get pods -n better-chatbot
```

### View Logs
```bash
kubectl logs -f deployment/better-chatbot -n better-chatbot
```

### Check Workflow History
```
GitHub → Actions → See all runs
```

## What Gets Deployed

1. **Automatic Triggers**:
   - Every push to `main` branch
   - Excludes: Documentation changes (*.md files)

2. **Manual Triggers**:
   - Click "Run workflow" in Actions tab
   - Can select environment (production/staging)

## Security

### Secrets Used
- `AZURE_CREDENTIALS` - Service Principal for Azure authentication
- `ACR_*` - Container registry credentials
- `AKS_*` - Kubernetes cluster info
- `APP_ENV_SECRETS` - Application environment variables

### Best Practices Implemented
✅ Secrets never appear in logs (masked)
✅ Service Principal with minimal permissions
✅ Base64-encoded environment variables
✅ Azure RBAC for resource access
✅ Audit trail in GitHub Actions logs

## Costs

### GitHub Actions
- **Free**: 2,000 minutes/month
- **Typical usage**: ~100-150 minutes/month (10-15 deployments)
- **Additional cost**: $0 (under free tier)

### Azure Resources
- **No additional costs** for CI/CD
- Existing resources: AKS, ACR, Storage (~$165/month)

## Troubleshooting

### Deployment Failed?
1. Check GitHub Actions logs
2. Check pod status: `kubectl get pods -n better-chatbot`
3. Check logs: `kubectl logs deployment/better-chatbot -n better-chatbot`
4. Rollback if needed: `kubectl rollout undo deployment/better-chatbot -n better-chatbot`

### Image Pull Error?
```bash
# Verify AKS-ACR connection
az aks update --name better-chatbot-aks \
  --resource-group better-chatbot-rg \
  --attach-acr <ACR_NAME>
```

### Authentication Error?
- Verify GitHub secrets are correct
- Check Service Principal hasn't expired
- Re-create Service Principal if needed

## Performance

### Typical Deployment Times
- Build & Test: 2-4 minutes
- Docker Build: 3-5 minutes
- Push to ACR: 1-2 minutes
- Deploy to AKS: 2-5 minutes
- **Total: ~10-15 minutes**

### Optimizations Included
✅ npm dependency caching
✅ Docker layer caching
✅ Parallel test execution
✅ Next.js build cache

## Files Created

```
azure-deploy/
├── CICD-DESIGN-SPEC.md        ← Full design document
├── CICD-IMPLEMENTATION-GUIDE.md ← Step-by-step setup
├── CICD-RESEARCH.md           ← Research & best practices
├── CICD-TLDR.md              ← This file
└── azure-aks-deploy.yml      ← Workflow file

.github/workflows/
└── azure-aks-deploy.yml      ← Copy here to enable
```

## Next Steps

After setup:
1. ✅ Test manual deployment
2. ✅ Push a change to trigger auto-deployment
3. ✅ Set up Slack notifications (optional)
4. ✅ Configure environment protection rules
5. ✅ Add monitoring/alerting

## Key Benefits

| Benefit | Description |
|---------|-------------|
| 🚀 **Speed** | Deploy in ~10 minutes |
| 🔒 **Security** | Secrets managed securely |
| 🔄 **Reliability** | Auto-rollback on failures |
| 🎯 **Zero Downtime** | Rolling updates |
| 📊 **Visibility** | Full deployment logs |
| 🛠️ **Flexibility** | Manual + auto triggers |

## Support

- 📖 Full docs: See other CICD-*.md files
- 🐛 Issues: Check troubleshooting section
- 💬 Questions: Review implementation guide
- 📚 Azure docs: https://docs.microsoft.com/azure/aks/

---

**Ready to deploy?** Follow the Quick Setup section above! 🚀
