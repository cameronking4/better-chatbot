# Azure AKS CI/CD Research & Best Practices

## Research Grounding

This document provides the research foundation and best practices that informed the design of our Azure AKS CI/CD pipeline.

## Industry Best Practices

### 1. Continuous Integration/Continuous Deployment (CI/CD)

#### Key Principles

1. **Automate Everything**
   - Build, test, and deployment processes should be fully automated
   - Manual interventions should be rare and well-documented
   - Automation reduces human error and increases consistency

2. **Fast Feedback Loops**
   - Developers should know within minutes if their code breaks
   - Automated testing catches issues before production
   - Quick rollbacks minimize downtime

3. **Immutable Infrastructure**
   - Container images are immutable and versioned
   - Deployments are reproducible across environments
   - No manual changes to running containers

4. **Progressive Delivery**
   - Rolling updates ensure zero-downtime deployments
   - Health checks validate new versions before completing rollout
   - Automatic rollback on failures

### 2. Azure AKS Deployment Strategies

#### Compared Deployment Methods

| Method | Pros | Cons | Use Case |
|--------|------|------|----------|
| **Rolling Update** | Zero downtime, resource efficient, automatic rollback | Gradual rollout, both versions run simultaneously | Standard deployments (our choice) |
| **Blue-Green** | Instant switch, easy rollback, no mixed versions | Requires 2x resources, more complex | Critical applications with strict SLA |
| **Canary** | Risk mitigation, gradual testing, metrics-based | Complex traffic management, longer deployment | Large-scale applications |
| **Recreate** | Simple, no version mixing | Downtime during deployment | Dev/test environments only |

**Why We Chose Rolling Updates:**
- Balances zero-downtime with resource efficiency
- Native Kubernetes support (no additional tools required)
- Automatic rollback on failures
- Suitable for most production workloads

### 3. Container Registry Options

#### Azure Container Registry (ACR) vs Alternatives

| Feature | ACR | Docker Hub | GitHub Container Registry | ECR |
|---------|-----|------------|---------------------------|-----|
| **Integration** | Excellent with Azure | Universal | GitHub-native | AWS-native |
| **Private images** | ✅ Included | 💰 Paid plans | ✅ Free for public | ✅ Included |
| **Geo-replication** | ✅ Available | ❌ No | ❌ No | ✅ Regional |
| **Azure RBAC** | ✅ Native | ❌ No | ❌ No | ❌ No |
| **Cost** | $5-$100/month | Free-$15/month | Free | $0.10/GB |
| **Build service** | ✅ ACR Tasks | ❌ No | ✅ Actions | ❌ No |

**Why We Chose ACR:**
- Seamless AKS integration with `attach-acr`
- Built-in Azure AD authentication
- Network proximity to AKS clusters (lower latency)
- ACR Tasks for container builds in Azure
- Included in existing Azure subscription

### 4. Secret Management Approaches

#### Options Evaluated

1. **GitHub Secrets** (Our Choice)
   - ✅ Native GitHub Actions integration
   - ✅ Encrypted at rest
   - ✅ Audit logging
   - ✅ Simple to use
   - ❌ Limited to GitHub
   - **Best for:** GitHub-based workflows

2. **Azure Key Vault**
   - ✅ Enterprise-grade
   - ✅ Centralized management
   - ✅ Advanced access policies
   - ❌ Additional cost
   - ❌ More complex setup
   - **Best for:** Multi-tool/platform secrets

3. **Kubernetes Secrets**
   - ✅ Native to Kubernetes
   - ✅ Pod-level access control
   - ❌ Base64 encoded (not encrypted by default)
   - ❌ Requires external secret management
   - **Best for:** Application runtime secrets

**Our Approach:**
- GitHub Secrets for Azure credentials and ACR access
- Kubernetes Secrets for application environment variables
- Future enhancement: Integrate Azure Key Vault for sensitive data

### 5. Authentication Methods

#### Service Principal vs Managed Identity

| Feature | Service Principal | Managed Identity |
|---------|-------------------|------------------|
| **Setup** | Manual creation | Automatic |
| **Rotation** | Manual | Automatic |
| **Scope** | Cross-subscription | Subscription-bound |
| **GitHub Actions** | ✅ Supported | ⚠️ Limited support |
| **Security** | Requires secret management | No secrets needed |

**Why We Chose Service Principal:**
- Full GitHub Actions support with `azure/login@v1`
- Works across subscriptions and tenants
- Explicit permission scoping
- Industry standard for CI/CD pipelines

**Note:** Azure is pushing toward Managed Identities with Workload Identity Federation for GitHub Actions. This is a future enhancement opportunity.

## Technical Research

### 1. GitHub Actions for Azure

#### Native Azure Actions

GitHub provides official Azure actions:

```yaml
# Azure Login
- uses: azure/login@v1
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

# Set AKS Context
- uses: azure/aks-set-context@v3
  with:
    resource-group: ${{ secrets.RESOURCE_GROUP }}
    cluster-name: ${{ secrets.CLUSTER_NAME }}

# Deploy to Kubernetes
- uses: azure/k8s-deploy@v4
  with:
    manifests: |
      k8s/deployment.yaml
```

**Our Approach:**
- Use native Azure actions for authentication
- Use `kubectl` directly for deployments (more control)
- Avoid `k8s-deploy` action (less flexible for our use case)

### 2. Docker Build Optimization

#### Compared Build Methods

1. **docker/build-push-action** (Our Choice)
   ```yaml
   - uses: docker/build-push-action@v6
     with:
       cache-from: type=gha
       cache-to: type=gha,mode=max
   ```
   - ✅ GitHub Actions cache integration
   - ✅ BuildKit support (parallel builds)
   - ✅ Multi-platform builds
   - ✅ Proven reliability

2. **ACR Build Tasks**
   ```bash
   az acr build --registry $ACR_NAME --image app:tag .
   ```
   - ✅ Builds in Azure (no GitHub runner needed)
   - ✅ Network proximity to ACR
   - ❌ Slower feedback to GitHub Actions
   - ❌ Less control over build process

**Why We Chose docker/build-push-action:**
- Better integration with GitHub Actions
- Faster feedback in workflow runs
- Layer caching with GitHub Actions cache
- More control over build process

### 3. Image Tagging Strategies

#### Industry Practices

1. **Semantic Versioning** (e.g., v1.2.3)
   - Pro: Clear version progression
   - Con: Requires version management

2. **Git SHA** (e.g., a3f8c91)
   - Pro: Direct commit traceability
   - Con: Not human-readable

3. **Timestamp** (e.g., 20250126-143052)
   - Pro: Clear chronological order
   - Con: No code traceability

4. **Latest** (always latest build)
   - Pro: Simple to use
   - Con: Not immutable

**Our Multi-Tag Strategy:**
```
latest                    # Always current
a3f8c91                  # Git commit SHA
20250126-143052          # Build timestamp
```

Benefits:
- `latest` for simplicity
- SHA for traceability
- Timestamp for chronological ordering
- All tags point to same image (no duplication)

### 4. Kubernetes Deployment Updates

#### Methods Evaluated

1. **kubectl set image** (Our Choice)
   ```bash
   kubectl set image deployment/app app=image:tag
   kubectl rollout restart deployment/app
   ```
   - ✅ Simple and direct
   - ✅ Forces new image pull
   - ✅ Works with rolling updates
   - ✅ Native kubectl commands

2. **kubectl apply -f**
   ```bash
   kubectl apply -f deployment.yaml
   ```
   - ✅ Declarative
   - ❌ Requires manifest updates
   - ❌ More complex in CI/CD

3. **Helm upgrade**
   ```bash
   helm upgrade app ./chart --set image.tag=new-tag
   ```
   - ✅ Structured releases
   - ✅ Rollback history
   - ❌ Requires Helm chart
   - ❌ Overkill for simple deployments

4. **GitOps (ArgoCD/Flux)**
   ```yaml
   # Automated sync from Git
   ```
   - ✅ Git as single source of truth
   - ✅ Automated sync
   - ❌ More infrastructure
   - ❌ Learning curve

**Why We Chose kubectl set image:**
- Simplest for current scale
- Direct control over deployment
- No additional tools required
- Easy to understand and debug

### 5. Health Checks

#### Best Practices

1. **Readiness Probes**
   ```yaml
   readinessProbe:
     httpGet:
       path: /api/health
       port: 3000
     initialDelaySeconds: 10
     periodSeconds: 5
   ```
   - Determines when pod receives traffic
   - Prevents traffic to unhealthy pods
   - Critical for rolling updates

2. **Liveness Probes**
   ```yaml
   livenessProbe:
     httpGet:
       path: /api/health
       port: 3000
     initialDelaySeconds: 30
     periodSeconds: 10
   ```
   - Restarts unhealthy pods
   - Prevents zombie processes
   - Longer delays to avoid restart loops

**Implementation Requirements:**
- Application must have health check endpoint
- Endpoint should verify critical dependencies
- Fast response (< 1 second)
- Idempotent (safe to call repeatedly)

## Performance Research

### 1. GitHub Actions Runtime Optimization

#### Factors Affecting Build Time

| Stage | Typical Duration | Optimization |
|-------|------------------|--------------|
| Checkout | 5-10s | Use `actions/checkout@v4` |
| Dependencies | 1-3min | Cache node_modules |
| Build | 2-5min | Cache Next.js build |
| Docker Build | 3-7min | Multi-stage build, layer cache |
| Push to ACR | 1-2min | Compress layers |
| Deploy | 2-5min | Parallel operations |
| **Total** | **~10-20min** | With optimizations |

#### Our Optimizations

1. **Dependency Caching**
   ```yaml
   - uses: actions/setup-node@v4
     with:
       cache: 'npm'  # Automatic caching
   ```

2. **Docker Layer Caching**
   ```yaml
   - uses: docker/build-push-action@v6
     with:
       cache-from: type=gha
       cache-to: type=gha,mode=max
   ```

3. **Parallel Jobs**
   ```yaml
   jobs:
     test:
       # Run tests
     lint:
       # Run linter in parallel
   ```

### 2. Kubernetes Rollout Performance

#### Rolling Update Configuration

```yaml
strategy:
  rollingUpdate:
    maxSurge: 1        # Add 1 extra pod
    maxUnavailable: 0   # Keep all pods running
```

**Performance Characteristics:**
- Update time: ~2-5 minutes for 2 pods
- Zero downtime (0 unavailable)
- Resource overhead: 1 extra pod temporarily
- Safe rollout with health checks

**Alternative Configurations:**

Fast Update (Higher Risk):
```yaml
maxSurge: 2
maxUnavailable: 1
```
- Faster: ~1-3 minutes
- Brief unavailability
- Use for dev/staging

Conservative (Safer):
```yaml
maxSurge: 1
maxUnavailable: 0
```
- Slower: ~3-6 minutes
- Zero unavailability
- Use for production (our choice)

## Security Research

### 1. Principle of Least Privilege

#### Service Principal Permissions

Minimum required permissions:

1. **Resource Group Level**
   - Role: `Contributor`
   - Scope: `/subscriptions/{sub-id}/resourceGroups/{rg-name}`
   - Why: Create/modify resources in RG

2. **ACR Level**
   - Roles: `AcrPush`, `AcrPull`
   - Scope: `/subscriptions/{sub-id}/resourceGroups/{rg-name}/providers/Microsoft.ContainerRegistry/registries/{acr-name}`
   - Why: Push images, pull for verification

3. **AKS Level**
   - Role: `Azure Kubernetes Service Cluster User Role`
   - Scope: `/subscriptions/{sub-id}/resourceGroups/{rg-name}/providers/Microsoft.ContainerService/managedClusters/{aks-name}`
   - Why: Get cluster credentials

**What We Don't Grant:**
- ❌ Subscription-level permissions
- ❌ Ability to delete resources (except deployment rollback)
- ❌ Access to other resource groups
- ❌ Azure AD directory permissions

### 2. Secret Protection

#### GitHub Actions Secret Handling

1. **Automatic Masking**
   - GitHub automatically masks secret values in logs
   - Prevents accidental exposure
   - Works for all registered secrets

2. **Secret Scope**
   - Repository secrets: Access to all workflows
   - Environment secrets: Require environment approval
   - Organization secrets: Shared across repos

3. **Audit Logging**
   - All secret access is logged
   - Audit trail for compliance
   - Review in Security settings

#### Base64 Encoding for Environment Variables

```bash
# Encode .env file
base64 -i .env > .env.base64

# In workflow (automatic decoding)
echo "${{ secrets.APP_ENV_SECRETS }}" | base64 -d > /tmp/.env
```

**Why Base64:**
- ✅ Preserves multiline content
- ✅ Handles special characters
- ✅ GitHub-friendly format
- ⚠️ Not encryption (secrets still encrypted by GitHub)

### 3. Network Security

#### Current Setup

```
Internet → Azure Load Balancer → AKS Service → Pods
             ↓
         Public IP (HTTP)
```

#### Production Recommendations

1. **HTTPS/TLS**
   ```yaml
   # Use Azure Application Gateway or Ingress Controller
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     annotations:
       cert-manager.io/cluster-issuer: letsencrypt
   ```

2. **Network Policies**
   ```yaml
   # Restrict pod-to-pod traffic
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   ```

3. **Private AKS Cluster**
   - API server not publicly accessible
   - Requires VPN or Azure Bastion
   - Higher security for production

## Cost Research

### 1. GitHub Actions Costs

#### Free Tier
- 2,000 minutes/month (public repos: unlimited)
- Linux runners (our usage)

#### Estimated Usage
- Build + Deploy: ~10 minutes per run
- 10 deployments/day: 100 minutes/day = 3,000 minutes/month
- **Cost: $8/month** (1,000 extra minutes at $0.008/min)

#### Optimization
- Cache dependencies: Save 1-2 minutes
- Parallel jobs: Reduce by 2-3 minutes
- Skip builds for docs: Reduce by 30-50%

### 2. Azure Resources Costs

Based on existing infrastructure:

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| AKS Nodes | 2x Standard_D2s_v3 | ~$140 |
| ACR | Basic tier | ~$5 |
| Storage | Azure File Share | ~$0.10 |
| Load Balancer | Standard | ~$18 |
| Bandwidth | 10GB outbound | ~$1 |
| **Total** | | **~$164/month** |

**No Additional CI/CD Costs:**
- Service Principal: Free
- Azure AD: Free tier sufficient
- ACR bandwidth: Included

## Monitoring and Observability

### 1. Metrics to Track

#### Deployment Metrics (DORA Metrics)

1. **Deployment Frequency**
   - How often: Daily/Weekly
   - Target: Multiple times per day
   - Track: GitHub Actions history

2. **Lead Time for Changes**
   - Commit to production
   - Target: < 1 hour
   - Track: Git commit to deployment completion

3. **Mean Time to Recovery (MTTR)**
   - Downtime to recovery
   - Target: < 1 hour
   - Track: Incident logs + rollback time

4. **Change Failure Rate**
   - % of deployments causing issues
   - Target: < 15%
   - Track: Rollbacks / Total deployments

#### Application Metrics

1. **Pod Health**
   - Ready vs Total pods
   - Restart count
   - Resource usage

2. **Response Time**
   - API endpoint latency
   - 95th percentile response time

3. **Error Rate**
   - 4xx/5xx responses
   - Application exceptions

### 2. Monitoring Tools

#### Azure Native (Included)

1. **Azure Monitor**
   - AKS cluster metrics
   - Container insights
   - Log analytics

2. **Application Insights**
   - APM (Application Performance Monitoring)
   - Distributed tracing
   - Exception tracking

#### Third-Party Options

| Tool | Purpose | Cost |
|------|---------|------|
| Datadog | Full observability | $15-31/host/month |
| New Relic | APM | $25-100/month |
| Grafana Cloud | Dashboards | Free-$49/month |
| Sentry | Error tracking | Free-$26/month |

**Recommendation:**
- Start with Azure Monitor (included)
- Add Sentry for error tracking (free tier)
- Consider Datadog as application scales

## Lessons from Industry

### 1. Common Pitfalls

1. **Insufficient Testing**
   - Problem: Deploy broken code to production
   - Solution: Comprehensive test suite in CI

2. **No Rollback Strategy**
   - Problem: Extended downtime during issues
   - Solution: Automatic rollback + manual rollback workflow

3. **Poor Secret Management**
   - Problem: Secrets in code or logs
   - Solution: GitHub Secrets + masked logging

4. **Missing Health Checks**
   - Problem: Broken pods receive traffic
   - Solution: Readiness and liveness probes

5. **No Monitoring**
   - Problem: Don't know about issues until users report
   - Solution: Proactive monitoring and alerting

### 2. Success Patterns

1. **Small, Frequent Deployments**
   - Deploy multiple times per day
   - Each deployment is small and reviewable
   - Reduces risk per deployment

2. **Fast Feedback**
   - Developers know within 10 minutes if deployment fails
   - Quick rollback minimizes impact
   - Continuous improvement based on failures

3. **Automated Everything**
   - No manual deployment steps
   - Consistent process every time
   - Reduces human error

4. **Progressive Rollout**
   - Rolling updates with health checks
   - Automatic rollback on failures
   - Zero-downtime deployments

## Future Research Areas

### 1. GitOps

Tools like ArgoCD or Flux CD:
- Git as single source of truth
- Automated synchronization
- Declarative deployments
- Better audit trail

**When to Consider:**
- Multiple environments (dev/staging/prod)
- Multiple teams
- Complex deployment requirements

### 2. Service Mesh

Tools like Istio or Linkerd:
- Advanced traffic management
- Canary deployments
- Circuit breaking
- mTLS between services

**When to Consider:**
- Microservices architecture
- Need for advanced routing
- Security requirements (mTLS)

### 3. Observability Platforms

Modern observability:
- Distributed tracing (Jaeger, Tempo)
- Metrics (Prometheus, Grafana)
- Logs (Loki, ELK)
- Unified platforms (Datadog, New Relic)

**When to Consider:**
- Application complexity increases
- Multiple services
- Performance optimization needs

## Conclusion

This research informed our pragmatic, scalable CI/CD design:

✅ **Simple**: Uses standard tools (GitHub Actions, kubectl)
✅ **Secure**: Proper secret management and RBAC
✅ **Reliable**: Health checks and automatic rollback
✅ **Fast**: Optimized build and deployment times
✅ **Scalable**: Can grow with project needs

The design balances immediate needs with future growth potential, avoiding over-engineering while maintaining professional standards.

## References

1. [Azure AKS Best Practices](https://docs.microsoft.com/en-us/azure/aks/best-practices)
2. [GitHub Actions for Azure](https://github.com/Azure/actions)
3. [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
4. [DORA Metrics](https://cloud.google.com/blog/products/devops-sre/using-the-four-keys-to-measure-your-devops-performance)
5. [Container Security Best Practices](https://docs.microsoft.com/en-us/azure/container-registry/container-registry-best-practices)
6. [Kubernetes Security](https://kubernetes.io/docs/concepts/security/)
