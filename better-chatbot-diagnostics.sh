#!/bin/bash

set -e

# --------- CONFIGURATION ---------
RG="better-chatbot-rg"
CLUSTER="better-chatbot-aks"
ACR="betterchatbotacr1764026475"
STORAGE="betterchatbot40731"
LOCATION="eastus"

# --------- FUNCTIONS ------------

print_header() {
    echo; echo "======================================"
    echo "$1"
    echo "======================================"
}

# --------- 1. AKS CLUSTER METRICS & HEALTH ---------
print_header "AKS: Cluster & Node Metrics"

# Get AKS credentials (idempotent)
az aks get-credentials -g "$RG" -n "$CLUSTER" --overwrite-existing &>/dev/null

echo "Kubernetes Nodes:"
kubectl get nodes -o wide

echo; echo "Node Resource Usage:"
kubectl top nodes || echo "kubectl top nodes requires metrics-server; skipped if unavailable."

echo; echo "Top 10 Pods by CPU Usage:"
kubectl top pods --all-namespaces | sort -k3 -nr | head -10

echo; echo "Top 10 Pods by Memory Usage:"
kubectl top pods --all-namespaces | sort -k4 -nr | head -10

echo; echo "Pods with restarts >0 in last hour:"
kubectl get pods --all-namespaces -o json | \
jq -r '.items[] | select(.status.containerStatuses[].restartCount > 0) | [.metadata.namespace, .metadata.name, (.status.containerStatuses | map(.restartCount)|join(","))] | @tsv'

echo; echo "Pods in CrashLoopBackOff/Pending/OOMKilled:"
kubectl get pods --all-namespaces | grep -E 'CrashLoopBackOff|Pending|OOMKilled' || echo "None detected."

# --------- 2. APP INSIGHTS: REQUESTS, AVAILABILITY, FAILURES ---------
print_header "Application Insights Telemetry (Requests, Failures, Performance)"

APPINSIGHTS_NAME=$(az monitor app-insights component list -g "$RG" --query "[?contains(name,'better')].name" -o tsv | head -n1)
if [[ -n "$APPINSIGHTS_NAME" ]]; then
    echo "Request rate, Availability, and Failure Ratio (last 1h):"
    az monitor app-insights query -a "$APPINSIGHTS_NAME" -g "$RG" --analytics-query \
    "requests | where timestamp > ago(1h) | summarize totalReq=count(), failReq=sum(success==false), avgDurationMs=avg(duration), availability=100.0*(sum(success==true)/count()) by bin(timestamp, 10m)"

    echo; echo "Dependency (backend/service) failure stats (last 1h):"
    az monitor app-insights query -a "$APPINSIGHTS_NAME" -g "$RG" --analytics-query \
    "dependencies | where timestamp > ago(1h) | summarize failures=sum(success==false), calls=count(), avgDurationMs=avg(duration) by target | order by failures desc"

    echo; echo "Top 5 recent exceptions (last 1h):"
    az monitor app-insights query -a "$APPINSIGHTS_NAME" -g "$RG" --analytics-query \
    "exceptions | where timestamp > ago(1h) | summarize count() by type, outerMessage | top 5 by count_"
else
    echo "No Application Insights resource found for keyword 'better'."
fi

# --------- 3. AZURE RESOURCE METRICS (Compute/Storage/ACR) ---------
print_header "Azure Metrics: Compute, Storage, Container Registry"

## AKS Compute: Scale set node count, CPU/Memory trending
MC_RG=$(az aks show -g "$RG" -n "$CLUSTER" --query nodeResourceGroup -o tsv)
VMSS_NAME=$(az vmss list -g "$MC_RG" --query "[0].name" -o tsv)
if [[ -n "$VMSS_NAME" ]]; then
    echo "AKS Node Pool VMSS ($VMSS_NAME) current node count:"
    az vmss list-instances -g "$MC_RG" -n "$VMSS_NAME" --query "[].{id:instanceId, state:statuses[?code=='PowerState/running'] | length(@) > 0}" -o table

    echo; echo "AKS Node Pool Auto-scaling settings:"
    az vmss show -g "$MC_RG" -n "$VMSS_NAME" --query "sku" -o table
else
    echo "Cannot resolve VMSS information for AKS cluster."
fi

# --------- STORAGE ACCOUNT HEALTH & RIGHT SIZING ---------
print_header "Storage Account: Health, Capacity, Performance"
az storage account show -n "$STORAGE" -g "$RG" --query "{Status:statusOfPrimary, Kind:kind, SKU:sku.name, Location:primaryLocation}" -o table
echo "Capacity (GB):"
az storage account show-usage -g "$RG" -n "$STORAGE" 2>/dev/null || echo "Unavailable via CLI for some account types."

echo; echo "Recent Storage Transactions (Basic):"
az monitor metrics list --resource $(az storage account show -n "$STORAGE" -g "$RG" --query id -o tsv) --metric Transactions --interval PT1H --aggregation Total --output table

# --------- ACR USAGE/HEALTH ---------
print_header "Container Registry (ACR): Usage & Health"
az acr show -n "$ACR" -g "$RG" --query "{Status:provisioningState, LoginServer:loginServer, SKU:sku.name}" -o table

# List repositories, top 3 by tag count (estimate usage)
echo "Top 3 repos by tag count:"
az acr repository list -n "$ACR" --output tsv | while read repo; do
  tags=$(az acr repository show-tags -n "$ACR" --repository "$repo" --output tsv | wc -l)
  echo -e "$repo:\t$tags"
done | sort -k2 -nr | head -3

# --------- PLATFORM HEALTH: RESOURCE HEALTH & ACTIVITY ---------
print_header "Azure Resource Health and Activity Log Highlights"

for RES in "$CLUSTER" "$STORAGE" "$ACR"; do
    echo "Resource Health: $RES"
    RID=$(az resource show -g "$RG" -n "$RES" --query id -o tsv)
    az resource health list --resource-id "$RID" | jq -r '.'
done

echo; echo "Activity Log (failures, last 24h):"
az monitor activity-log list --resource-group "$RG" --status Failed --max-events 20 -o table

# --------- SUMMARY RECOMMENDATIONS ---------
print_header "Summary & Recommendations (Manual Review)"

cat <<EOM
Check the following for right-sizing and health:
- Node pool CPU/memory/allocatable pressure (use kubectl & AKS metrics).
- Pod CPU/memory usage versus requests/limits (kubectl top pods).
- Container registry repo growth: oldest images, cleanup needed?
- Storage account approaching quota? Do you see sustained high transaction rates?
- App Insights: Is failure/latency out of normal range? High error spikes?
- Activity log: Recent failed deployments or configuration changes?
EOM

echo; echo "Diagnostics complete."

# --------- END OF SCRIPT ---------