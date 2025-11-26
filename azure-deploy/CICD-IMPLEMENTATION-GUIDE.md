# Azure AKS CI/CD Implementation Guide

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Prepare Azure Resources](#step-1-prepare-azure-resources)
- [Step 2: Create Azure Service Principal](#step-2-create-azure-service-principal)
- [Step 3: Configure GitHub Secrets](#step-3-configure-github-secrets)
- [Step 4: Add GitHub Actions Workflow](#step-4-add-github-actions-workflow)
- [Step 5: Test the Workflow](#step-5-test-the-workflow)
- [Step 6: Monitor and Maintain](#step-6-monitor-and-maintain)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

Before implementing the CI/CD pipeline, ensure you have:

- ✅ Azure subscription with active resources
- ✅ Existing AKS cluster (created via `initial-deploy.sh`)
- ✅ Azure Container Registry configured
- ✅ GitHub repository with appropriate permissions
- ✅ Azure CLI installed locally
- ✅ kubectl configured for your cluster

## Step 1: Prepare Azure Resources

### 1.1 Verify Existing Infrastructure

First, ensure your Azure infrastructure is properly set up:

```bash
# Source your deployment configuration
cd azure-deploy
source deployment-config.sh

# Verify resource group exists
az group show --name $RESOURCE_GROUP

# Verify ACR exists and is accessible
az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP

# Verify AKS cluster is running
az aks show --name $AKS_NAME --resource-group $RESOURCE_GROUP

# Test kubectl access
kubectl get nodes
kubectl get pods -n $NAMESPACE
```

### 1.2 Enable ACR Admin Access (if not already enabled)

```bash
az acr update --name $ACR_NAME --admin-enabled true
```

### 1.3 Get ACR Credentials

```bash
# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer --output tsv)
echo "ACR Login Server: $ACR_LOGIN_SERVER"

# Get ACR credentials
ACR_CREDENTIALS=$(az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP)
ACR_USERNAME=$(echo $ACR_CREDENTIALS | jq -r '.username')
ACR_PASSWORD=$(echo $ACR_CREDENTIALS | jq -r '.passwords[0].value')

echo "ACR Username: $ACR_USERNAME"
echo "ACR Password: [HIDDEN]"
```

**Save these values** - you'll need them for GitHub Secrets.

## Step 2: Create Azure Service Principal

### 2.1 Create Service Principal with Required Permissions

Create a Service Principal that GitHub Actions will use to authenticate with Azure:

```bash
# Create service principal with contributor access to resource group
SP_OUTPUT=$(az ad sp create-for-rbac \
  --name "github-actions-better-chatbot" \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP \
  --sdk-auth)

echo "$SP_OUTPUT"
```

This will output JSON like:

```json
{
  "clientId": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "clientSecret": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "subscriptionId": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "tenantId": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

**⚠️ IMPORTANT**: Save this entire JSON output securely. You'll need it for GitHub Secrets.

### 2.2 Grant Additional Permissions

Ensure the Service Principal can pull from ACR:

```bash
# Get the Service Principal ID
SP_ID=$(echo "$SP_OUTPUT" | jq -r '.clientId')

# Get ACR resource ID
ACR_ID=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query id --output tsv)

# Assign AcrPull role
az role assignment create --assignee $SP_ID --scope $ACR_ID --role AcrPull

# Assign AcrPush role (for pushing images)
az role assignment create --assignee $SP_ID --scope $ACR_ID --role AcrPush
```

### 2.3 Grant AKS Permissions

```bash
# Get AKS resource ID
AKS_ID=$(az aks show --name $AKS_NAME --resource-group $RESOURCE_GROUP --query id --output tsv)

# Assign Azure Kubernetes Service Cluster User Role
az role assignment create --assignee $SP_ID --scope $AKS_ID --role "Azure Kubernetes Service Cluster User Role"
```

## Step 3: Configure GitHub Secrets

### 3.1 Prepare Secret Values

First, gather all the values you'll need:

```bash
# From Step 1 and Step 2, you should have:
# - ACR_LOGIN_SERVER
# - ACR_USERNAME
# - ACR_PASSWORD
# - SP_OUTPUT (the entire JSON)

# Also need from deployment-config.sh:
source deployment-config.sh
echo "AKS Name: $AKS_NAME"
echo "Resource Group: $RESOURCE_GROUP"
echo "Namespace: $NAMESPACE"

# Encode your .env file for secrets
cd ..  # Back to project root
base64 -i .env > .env.base64
cat .env.base64
```

### 3.2 Add Secrets to GitHub

Go to your GitHub repository:

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add each of the following secrets:

| Secret Name | Value | Notes |
|-------------|-------|-------|
| `AZURE_CREDENTIALS` | Entire JSON output from Step 2.1 | Copy the entire JSON |
| `ACR_LOGIN_SERVER` | From Step 1.3 | e.g., `betterchatbotacr123.azurecr.io` |
| `ACR_USERNAME` | From Step 1.3 | Usually the ACR name |
| `ACR_PASSWORD` | From Step 1.3 | Admin password from ACR |
| `AKS_NAME` | From deployment-config.sh | e.g., `better-chatbot-aks` |
| `AKS_RESOURCE_GROUP` | From deployment-config.sh | e.g., `better-chatbot-rg` |
| `AKS_NAMESPACE` | From deployment-config.sh | e.g., `better-chatbot` |
| `APP_ENV_SECRETS` | Base64-encoded .env file | From Step 3.1 |

### 3.3 Verify Secrets

After adding all secrets, you should see them listed (values will be hidden):

![GitHub Secrets Example](https://docs.github.com/assets/cb-48698/images/help/settings/actions-secrets-environment.png)

## Step 4: Add GitHub Actions Workflow

### 4.1 Create Workflow File

**IMPORTANT**: Due to GitHub App permissions, I cannot directly create files in the `.github/workflows` directory. You'll need to add this file manually.

Create a new file at `.github/workflows/azure-aks-deploy.yml` with the following content:

See the file `azure-aks-deploy.yml` in this directory for the complete workflow definition.

### 4.2 Copy the Workflow

```bash
# From your local machine:
# 1. Copy the provided azure-aks-deploy.yml to .github/workflows/
cp azure-deploy/azure-aks-deploy.yml .github/workflows/

# 2. Commit and push
git add .github/workflows/azure-aks-deploy.yml
git commit -m "Add Azure AKS CI/CD workflow"
git push origin main
```

### 4.3 Workflow Features

The workflow includes:

- ✅ **Automatic trigger** on push to main branch
- ✅ **Manual trigger** via workflow_dispatch
- ✅ **Build and test** stage with linting and type checking
- ✅ **Docker build** and push to ACR
- ✅ **Kubernetes deployment** with rolling update
- ✅ **Health checks** and verification
- ✅ **Rollback** on failure
- ✅ **Status reporting** with logs

## Step 5: Test the Workflow

### 5.1 Trigger Manual Deployment

1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. Select **Deploy to Azure AKS** workflow
4. Click **Run workflow**
5. Select branch (default: main)
6. Click **Run workflow**

### 5.2 Monitor the Workflow

Watch the workflow execution in real-time:

1. Click on the running workflow
2. Observe each job's progress:
   - Build and Test
   - Build Docker Image
   - Deploy to AKS
   - Verify Deployment

### 5.3 Verify Deployment

After the workflow completes:

```bash
# Check deployment status
kubectl get deployment better-chatbot -n better-chatbot

# Check pod status
kubectl get pods -n better-chatbot

# Check service
kubectl get service better-chatbot-service -n better-chatbot

# View recent logs
kubectl logs -f deployment/better-chatbot -n better-chatbot --tail=50

# Get application URL
EXTERNAL_IP=$(kubectl get service better-chatbot-service -n better-chatbot -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Application URL: http://$EXTERNAL_IP"

# Test the application
curl http://$EXTERNAL_IP
```

### 5.4 Test Automatic Trigger

Make a small code change and push to main:

```bash
# Make a small change
echo "# CI/CD Test" >> README.md

# Commit and push
git add README.md
git commit -m "Test CI/CD pipeline"
git push origin main
```

The workflow should automatically trigger. Verify in the Actions tab.

## Step 6: Monitor and Maintain

### 6.1 Set Up Notifications

Configure GitHub Actions notifications:

1. Go to your GitHub profile → **Settings** → **Notifications**
2. Under **Actions**, enable notifications for workflow runs
3. Choose your preferred notification method (email, web, mobile)

### 6.2 Review Workflow Runs

Regularly review workflow runs:

1. **Actions** tab shows all workflow runs
2. Check for failures and patterns
3. Review build times and optimize if needed

### 6.3 Monitor Azure Resources

```bash
# Check AKS cluster health
az aks show --name $AKS_NAME --resource-group $RESOURCE_GROUP --query "powerState"

# Check ACR storage usage
az acr show-usage --name $ACR_NAME

# List recent images
az acr repository show-tags --name $ACR_NAME --repository better-chatbot --orderby time_desc --top 10
```

### 6.4 Clean Up Old Images

Implement retention policy:

```bash
# Delete images older than 30 days (keep last 10)
az acr config retention update --registry $ACR_NAME --status enabled --days 30 --type UntaggedManifests

# Manually delete specific tags if needed
az acr repository delete --name $ACR_NAME --image better-chatbot:old-tag --yes
```

## Troubleshooting

### Issue: Authentication Failed

**Error**: `Error: Login failed with Error: Az CLI Login failed.`

**Solution**:
```bash
# Verify service principal still exists
az ad sp show --id <CLIENT_ID_FROM_AZURE_CREDENTIALS>

# If expired, create new service principal and update GitHub secrets
# See Step 2
```

### Issue: ACR Login Failed

**Error**: `Error response from daemon: Get https://xxx.azurecr.io/v2/: unauthorized`

**Solution**:
```bash
# Verify ACR credentials are correct
az acr credential show --name $ACR_NAME

# Update GitHub secrets ACR_USERNAME and ACR_PASSWORD
# Verify ACR admin is enabled
az acr update --name $ACR_NAME --admin-enabled true
```

### Issue: Kubectl Context Not Set

**Error**: `Error from server (Forbidden): deployments.apps is forbidden`

**Solution**:
- Verify Service Principal has correct AKS permissions (Step 2.3)
- Check that `AKS_NAME` and `AKS_RESOURCE_GROUP` secrets are correct

### Issue: Image Pull Errors

**Error**: `Failed to pull image "xxx.azurecr.io/better-chatbot:latest": rpc error: code = Unknown desc = Error response from daemon: unauthorized`

**Solution**:
```bash
# Verify AKS-ACR integration
az aks update --name $AKS_NAME --resource-group $RESOURCE_GROUP --attach-acr $ACR_NAME

# Or check imagePullSecrets in deployment
kubectl describe pod <POD_NAME> -n better-chatbot
```

### Issue: Deployment Timeout

**Error**: `error: timed out waiting for the condition`

**Solution**:
```bash
# Check pod events
kubectl get events -n better-chatbot --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs deployment/better-chatbot -n better-chatbot

# Describe pod to see detailed status
kubectl describe pod <POD_NAME> -n better-chatbot

# Common causes:
# - Missing environment variables
# - Resource limits too low
# - Health check misconfigured
```

### Issue: Secrets Not Updated

**Error**: Application uses old environment variables after deployment

**Solution**:
```bash
# Manually update secrets
kubectl create secret generic better-chatbot-env \
  --from-env-file=.env \
  --namespace=better-chatbot \
  --dry-run=client -o yaml | kubectl apply -f -

# Force pod restart to pick up new secrets
kubectl rollout restart deployment/better-chatbot -n better-chatbot
```

## Best Practices

### Development Workflow

1. **Feature Branches**: Develop features in separate branches
2. **Pull Requests**: Review code before merging to main
3. **Staging Environment**: Test in staging before production
4. **Tag Releases**: Use semantic versioning for releases

### Security

1. **Rotate Secrets**: Regularly rotate Azure credentials and GitHub secrets
2. **Principle of Least Privilege**: Grant minimal required permissions
3. **Audit Logs**: Enable Azure audit logging
4. **Secret Scanning**: Enable GitHub secret scanning
5. **Dependency Updates**: Keep dependencies updated

### Performance

1. **Build Cache**: GitHub Actions caches are enabled by default
2. **Resource Limits**: Set appropriate CPU/memory limits
3. **Auto-scaling**: Configure HPA for automatic scaling
4. **Image Size**: Optimize Docker images to reduce pull time

### Monitoring

1. **Application Logs**: Use centralized logging (Azure Monitor, ELK)
2. **Metrics**: Track deployment frequency, duration, success rate
3. **Alerts**: Set up alerts for failed deployments
4. **Health Checks**: Implement comprehensive health endpoints

### Cost Optimization

1. **Image Cleanup**: Implement ACR retention policies
2. **Resource Scaling**: Scale down non-production environments
3. **Build Optimization**: Reduce GitHub Actions minutes
4. **Spot Instances**: Consider spot nodes for dev/staging

## Advanced Configuration

### Multi-Environment Setup

To support staging and production:

1. Create separate GitHub environments:
   - Settings → Environments → New environment
   - Add environment-specific secrets

2. Modify workflow to use environments:
```yaml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    if: github.ref == 'refs/heads/develop'
    # ... deployment steps

  deploy-production:
    runs-on: ubuntu-latest
    environment: production
    if: github.ref == 'refs/heads/main'
    # ... deployment steps
```

### Manual Approval Gates

Add manual approval for production:

1. Go to Settings → Environments → production
2. Enable "Required reviewers"
3. Add team members who can approve

### Slack Notifications

Add Slack notifications:

```yaml
- name: Notify Slack
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Deployment ${{ job.status }}: ${{ github.repository }}"
      }
```

### Rollback Job

Add a separate rollback workflow:

Create `.github/workflows/rollback.yml`:

```yaml
name: Rollback Deployment

on:
  workflow_dispatch:
    inputs:
      revision:
        description: 'Revision number to rollback to (leave empty for previous)'
        required: false

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Set AKS Context
        uses: azure/aks-set-context@v3
        with:
          resource-group: ${{ secrets.AKS_RESOURCE_GROUP }}
          cluster-name: ${{ secrets.AKS_NAME }}

      - name: Rollback Deployment
        run: |
          if [ -z "${{ github.event.inputs.revision }}" ]; then
            kubectl rollout undo deployment/better-chatbot -n ${{ secrets.AKS_NAMESPACE }}
          else
            kubectl rollout undo deployment/better-chatbot -n ${{ secrets.AKS_NAMESPACE }} --to-revision=${{ github.event.inputs.revision }}
          fi

      - name: Check Rollout Status
        run: |
          kubectl rollout status deployment/better-chatbot -n ${{ secrets.AKS_NAMESPACE }}
```

## Success Checklist

Before considering the implementation complete, verify:

- [ ] All GitHub secrets configured correctly
- [ ] Workflow file added to `.github/workflows/`
- [ ] Manual workflow trigger tested successfully
- [ ] Automatic trigger (push to main) tested successfully
- [ ] Deployment completes without errors
- [ ] Pods are healthy and running
- [ ] Application accessible via LoadBalancer IP
- [ ] Logs showing no errors
- [ ] Rollback capability tested
- [ ] Team trained on using the workflow
- [ ] Documentation reviewed and accessible
- [ ] Monitoring and alerts configured

## Next Steps

After successful implementation:

1. **Document**: Share this guide with your team
2. **Train**: Ensure team knows how to use the workflow
3. **Monitor**: Set up dashboards for deployment metrics
4. **Iterate**: Continuously improve based on feedback
5. **Scale**: Consider multi-environment and advanced features

## Support and Resources

### Documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Azure AKS Documentation](https://docs.microsoft.com/en-us/azure/aks/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Azure CLI Reference](https://docs.microsoft.com/en-us/cli/azure/)

### Tools
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Azure Portal](https://portal.azure.com)
- [GitHub Actions Status](https://www.githubstatus.com/)

### Community
- [GitHub Community Forum](https://github.community/)
- [Azure Community](https://techcommunity.microsoft.com/t5/azure/ct-p/Azure)
- [Kubernetes Slack](https://kubernetes.slack.com/)

---

**Congratulations!** You now have a fully automated CI/CD pipeline for Azure AKS deployments. 🎉
