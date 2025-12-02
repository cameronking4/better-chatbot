# Azure AKS CI/CD GitHub Action - Design Specification

## Executive Summary

This document outlines the design and architecture for an end-to-end CI/CD GitHub Action workflow for deploying the Better Chatbot application to Azure Kubernetes Service (AKS). The solution automates the entire deployment pipeline from code commit to production deployment, with manual trigger capabilities and comprehensive secret management.

## Goals and Objectives

### Primary Goals
1. **Automated Deployment**: Automatically build, test, and deploy code changes to Azure AKS
2. **Security**: Secure management of Azure credentials and application secrets
3. **Flexibility**: Support both automatic triggers and manual deployments
4. **Reliability**: Include rollback capabilities and health checks
5. **Visibility**: Provide clear feedback on deployment status and logs

### Non-Goals
- Multi-region deployment (can be added in future iterations)
- Blue-green deployment strategy (using rolling updates instead)
- GitOps-based deployment (using direct kubectl/Azure CLI)

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflow                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 1: Build & Test                                          │
│  ├─ Checkout code                                               │
│  ├─ Run linters and type checks                                 │
│  ├─ Run unit tests                                              │
│  └─ Build Next.js application                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 2: Build & Push Container                                │
│  ├─ Login to Azure Container Registry                           │
│  ├─ Build Docker image                                          │
│  ├─ Tag with commit SHA and timestamp                           │
│  └─ Push to ACR                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 3: Deploy to AKS                                         │
│  ├─ Login to Azure                                              │
│  ├─ Get AKS credentials                                         │
│  ├─ Update Kubernetes secrets (if changed)                      │
│  ├─ Update deployment with new image                            │
│  └─ Wait for rollout to complete                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 4: Verify & Report                                       │
│  ├─ Check pod health                                            │
│  ├─ Fetch recent logs                                           │
│  ├─ Get service endpoint                                        │
│  └─ Report deployment status                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  .github/workflows/azure-aks-deploy.yml                  │  │
│  │  - Main workflow definition                              │  │
│  │  - Triggered on push to main or manual dispatch          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GitHub Secrets                                           │  │
│  │  ├─ AZURE_CREDENTIALS (Service Principal JSON)           │  │
│  │  ├─ ACR_LOGIN_SERVER                                     │  │
│  │  ├─ AKS_NAME                                             │  │
│  │  ├─ AKS_RESOURCE_GROUP                                   │  │
│  │  ├─ AKS_NAMESPACE                                        │  │
│  │  └─ APP_ENV_SECRETS (Base64 encoded .env)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      Azure Resources                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Azure Container Registry (ACR)                          │  │
│  │  - Stores Docker images                                  │  │
│  │  - Tags: latest, commit-SHA, timestamp                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Azure Kubernetes Service (AKS)                          │  │
│  │  ├─ Deployment: better-chatbot                           │  │
│  │  ├─ Service: LoadBalancer                                │  │
│  │  ├─ ConfigMaps/Secrets: App configuration                │  │
│  │  └─ Persistent Volumes: Data storage                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Workflow Triggers

### Automatic Triggers
1. **Push to Main Branch**:
   - Triggers on every push to the `main` branch
   - Runs full CI/CD pipeline
   - Deploys to production environment

2. **Pull Request** (Optional):
   - Can be configured to deploy to staging environment
   - Runs tests but doesn't deploy by default

### Manual Triggers
1. **Workflow Dispatch**:
   - Manually triggered from GitHub Actions UI
   - Allows selecting branch to deploy
   - Useful for hotfixes and specific deployments

## Secret Management

### Required GitHub Secrets

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `AZURE_CREDENTIALS` | Azure Service Principal JSON with permissions to ACR and AKS | Create via `az ad sp create-for-rbac` |
| `ACR_LOGIN_SERVER` | Azure Container Registry login server URL | From `az acr show` command |
| `ACR_USERNAME` | ACR admin username | From `az acr credential show` |
| `ACR_PASSWORD` | ACR admin password | From `az acr credential show` |
| `AKS_NAME` | Name of the AKS cluster | From deployment config |
| `AKS_RESOURCE_GROUP` | Azure resource group name | From deployment config |
| `AKS_NAMESPACE` | Kubernetes namespace | Default: `better-chatbot` |
| `APP_ENV_SECRETS` | Base64-encoded .env file | Encode local .env file |

### Security Best Practices

1. **Service Principal Scope**: Create dedicated Service Principal with minimal required permissions
2. **Secret Rotation**: Regularly rotate Azure credentials and GitHub secrets
3. **Environment Separation**: Use different secrets for staging/production
4. **Audit Logging**: Enable Azure audit logs for deployment activities
5. **RBAC**: Use Kubernetes RBAC to limit deployment permissions

## Deployment Strategy

### Rolling Update Strategy

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # Max additional pods during update
    maxUnavailable: 0   # Always maintain availability
```

**Benefits**:
- Zero downtime deployments
- Gradual rollout with automatic rollback on failure
- Resource efficient (doesn't require double resources)

### Image Tagging Strategy

Images are tagged with multiple tags for flexibility:

1. **`latest`**: Always points to the most recent successful build
2. **`<commit-sha>`**: Specific commit identifier for traceability
3. **`<timestamp>`**: Build timestamp for versioning

Example:
```
betterchatbotacr.azurecr.io/better-chatbot:latest
betterchatbotacr.azurecr.io/better-chatbot:a3f8c91
betterchatbotacr.azurecr.io/better-chatbot:20250126-143052
```

## Health Checks and Verification

### Pod Readiness Checks

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  successThreshold: 1
  failureThreshold: 3
```

### Liveness Checks

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Post-Deployment Verification

1. **Pod Status**: Verify all pods are in `Running` state
2. **Readiness**: Check all pods pass readiness probes
3. **Logs**: Fetch and display recent logs for verification
4. **Service**: Verify LoadBalancer has external IP assigned
5. **Rollout**: Confirm rollout completed successfully

## Rollback Strategy

### Automatic Rollback

Kubernetes automatically rolls back if:
- New pods fail readiness checks repeatedly
- Deployment update times out (default: 10 minutes)
- Pod crash loop detected

### Manual Rollback

GitHub Actions workflow provides rollback job:

```bash
kubectl rollout undo deployment/better-chatbot -n $NAMESPACE
```

Users can also rollback to specific revision:

```bash
kubectl rollout history deployment/better-chatbot -n $NAMESPACE
kubectl rollout undo deployment/better-chatbot -n $NAMESPACE --to-revision=3
```

## Monitoring and Observability

### Deployment Metrics

Track the following metrics:
1. **Deployment Frequency**: How often deployments occur
2. **Deployment Duration**: Time from start to completion
3. **Success Rate**: Percentage of successful deployments
4. **Rollback Rate**: Frequency of rollbacks

### Logging

Logs captured at multiple levels:
1. **GitHub Actions Logs**: Full CI/CD pipeline execution logs
2. **Build Logs**: Docker build output
3. **Kubernetes Events**: Deployment events and pod status changes
4. **Application Logs**: Pod logs for verification

### Alerting

Recommended alerts:
1. **Deployment Failed**: Alert on workflow failure
2. **Pods Not Ready**: Alert if pods don't become ready within threshold
3. **Rollback Occurred**: Notify team of automatic rollbacks
4. **Resource Limits**: Alert on resource constraints

## Performance Considerations

### Build Optimization

1. **Docker Layer Caching**: Use GitHub Actions cache for Docker layers
2. **Multi-stage Builds**: Minimize final image size
3. **Parallel Jobs**: Run tests and linting in parallel

### Deployment Optimization

1. **Image Pull Policy**: Use `IfNotPresent` to reduce registry pulls
2. **Resource Requests**: Set appropriate CPU/memory requests
3. **Horizontal Pod Autoscaler**: Auto-scale based on load

## Cost Optimization

### CI/CD Costs

1. **GitHub Actions Minutes**: Optimize workflow to reduce build time
2. **ACR Storage**: Implement image retention policies
3. **Data Transfer**: Minimize unnecessary image pulls

### Infrastructure Costs

1. **Right-sizing**: Use appropriate node sizes for workload
2. **Auto-scaling**: Scale down during low-usage periods
3. **Spot Instances**: Consider spot nodes for non-production

## Disaster Recovery

### Backup Strategy

1. **Image Retention**: Keep last 10 successful images in ACR
2. **Configuration Backup**: Store Kubernetes manifests in Git
3. **Data Backup**: Regular backups of persistent volumes

### Recovery Procedures

1. **Rollback**: Use Kubernetes rollout undo
2. **Re-deploy**: Trigger manual deployment of known-good version
3. **Infrastructure Recovery**: Re-run `initial-deploy.sh` if needed

## Testing Strategy

### Pre-deployment Testing

1. **Unit Tests**: Run via `pnpm test`
2. **Type Checking**: Run `pnpm check-types`
3. **Linting**: Run `pnpm lint`
4. **Build Verification**: Ensure Next.js builds successfully

### Post-deployment Testing

1. **Smoke Tests**: Basic health check endpoint
2. **Integration Tests**: Verify key functionality
3. **Load Tests**: Ensure performance under load (manual)

## Compliance and Governance

### Audit Requirements

1. **Change Tracking**: Git commits provide full audit trail
2. **Deployment Logs**: All GitHub Actions runs are logged
3. **Approval Gates**: Can add manual approval for production

### Compliance Considerations

1. **Data Residency**: Ensure AKS region meets requirements
2. **Access Control**: Use Azure AD for authentication
3. **Encryption**: Enable encryption at rest and in transit

## Future Enhancements

### Phase 2 Improvements

1. **Multi-environment Support**: Add staging/production environments
2. **Blue-Green Deployments**: Zero-downtime with instant rollback
3. **Canary Deployments**: Gradual rollout with traffic splitting
4. **GitOps Integration**: Use ArgoCD or FluxCD
5. **Advanced Monitoring**: Integrate Prometheus/Grafana
6. **Automated Testing**: Add E2E tests in CI pipeline
7. **Multi-region**: Deploy to multiple regions for HA
8. **Infrastructure as Code**: Manage Azure resources with Terraform

### Integration Opportunities

1. **Slack Notifications**: Deployment status updates
2. **PagerDuty**: Incident management integration
3. **DataDog**: APM and monitoring
4. **Sentry**: Error tracking and reporting

## Risk Assessment

### Identified Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Failed deployment causes downtime | High | Low | Rolling updates + auto-rollback |
| Secrets exposed in logs | High | Medium | Use secret masking, audit logs |
| Resource exhaustion | Medium | Low | Set resource limits, monitoring |
| ACR quota exceeded | Medium | Low | Image retention policies |
| Service Principal expiration | High | Low | Automated expiration alerts |

## Success Criteria

The CI/CD implementation is considered successful when:

1. ✅ Deployments complete in under 10 minutes
2. ✅ Zero-downtime deployments achieved
3. ✅ Automatic rollback works on failures
4. ✅ All secrets properly managed and secured
5. ✅ Manual trigger capability working
6. ✅ Comprehensive logs and status reporting
7. ✅ Documentation complete and accessible
8. ✅ Team trained on workflow usage

## Conclusion

This design specification provides a comprehensive blueprint for implementing a production-ready CI/CD pipeline for Azure AKS deployments. The solution balances automation, security, and flexibility while maintaining operational excellence.

The architecture is designed to grow with the project's needs, with clear paths for future enhancements while delivering immediate value through automated, reliable deployments.
