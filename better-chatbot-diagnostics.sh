#!/bin/bash

set -e

# --------- CONFIGURATION ---------
RG="better-chatbot-rg"
CLUSTER="better-chatbot-aks"
ACR="betterchatbotacr1764026475"
STORAGE="betterchatbot40731"

# --------- FUNCTIONS ------------

print_header() {
    echo ""
    echo "======================================"
    echo "$1"
    echo "======================================"
}

# --------- 1. AKS CLUSTER METRICS & HEALTH ---------
print_header "AKS: Cluster & Node Metrics"

# Get AKS credentials (idempotent)
az aks get-credentials -g "$RG" -n "$CLUSTER" --overwrite-existing &>/dev/null

echo "Kubernetes Nodes:"
kubectl get nodes -o wide

echo ""
echo "Node Resource Usage:"
# Check if metrics-server is available
if kubectl top nodes &>/dev/null; then
    kubectl top nodes
else
    echo "Metrics server not responding or not installed."
fi

echo ""
echo "Top 10 Pods by CPU Usage:"
if kubectl top pods --all-namespaces &>/dev/null; then
    kubectl top pods --all-namespaces | sort -k3 -nr | head -10
else
    echo "Metrics not available."
fi

echo ""
echo "Top 10 Pods by Memory Usage:"
if kubectl top pods --all-namespaces &>/dev/null; then
    kubectl top pods --all-namespaces | sort -k4 -nr | head -10
else
    echo "Metrics not available."
fi

echo ""
echo "Pods with restarts >0 in last hour:"
kubectl get pods --all-namespaces -o json | \
jq -r '.items[] | select(.status.containerStatuses[]?.restartCount > 0) | [.metadata.namespace, .metadata.name, (.status.containerStatuses | map(.restartCount)|join(","))] | @tsv'

echo ""
echo "Pods in CrashLoopBackOff/Pending/OOMKilled:"
PODS_ISSUES=$(kubectl get pods --all-namespaces | grep -E 'CrashLoopBackOff|Pending|OOMKilled' || true)
if [[ -z "$PODS_ISSUES" ]]; then
    echo "None detected."
else
    echo "$PODS_ISSUES"
fi

# --------- 2. APP INSIGHTS: REQUESTS, AVAILABILITY, FAILURES ---------
print_header "Application Insights Telemetry"

# Attempt to find App Insights resource
APPINSIGHTS_NAME=$(az monitor app-insights component list -g "$RG" --query "[?contains(name, 'better')].name" -o tsv | head -n1)

if [[ -n "$APPINSIGHTS_NAME" ]]; then
    echo "Resource found: $APPINSIGHTS_NAME"
    echo "Fetching Request rate, Availability, and Failure Ratio (last 1h)..."
    
    # We use a try/catch style by checking exit code, as query might fail if no data
    set +e
    az monitor app-insights query -a "$APPINSIGHTS_NAME" -g "$RG" --analytics-query \
    "requests | where timestamp > ago(1h) | summarize totalReq=count(), failReq=sum(success==false), avgDurationMs=avg(duration) by bin(timestamp, 1h)" -o table
    set -e

    echo ""
    echo "Top 5 recent exceptions (last 1h):"
    set +e
    az monitor app-insights query -a "$APPINSIGHTS_NAME" -g "$RG" --analytics-query \
    "exceptions | where timestamp > ago(1h) | summarize count() by type, outerMessage | top 5 by count_" -o table
    set -e
else
    echo "No Application Insights resource found in '$RG' matching 'better'."
    echo "Check if you have enabled it or if it is in a different Resource Group."
fi

# --------- 3. AZURE RESOURCE METRICS (Compute/Storage/ACR) ---------
print_header "Azure Metrics: Compute, Storage, Container Registry"

## AKS Compute: Scale set node count
echo "Resolving Node Resource Group..."
MC_RG=$(az aks show -g "$RG" -n "$CLUSTER" --query nodeResourceGroup -o tsv)
VMSS_NAME=$(az vmss list -g "$MC_RG" --query "[0].name" -o tsv)

if [[ -n "$VMSS_NAME" ]]; then
    echo "AKS Node Pool VMSS: $VMSS_NAME"
    echo "Current Instance Status:"
    az vmss list-instances -g "$MC_RG" -n "$VMSS_NAME" --query "[].{InstanceId:instanceId, State:provisioningState, PowerState:powerState.code}" -o table
    
    echo ""
    echo "Auto-scaling Config (Capacity):"
    az vmss show -g "$MC_RG" -n "$VMSS_NAME" --query "sku" -o table
else
    echo "Cannot resolve VMSS information."
fi

# --------- STORAGE ACCOUNT HEALTH ---------
print_header "Storage Account: Health & Capacity"
az storage account show -n "$STORAGE" -g "$RG" --query "{Status:statusOfPrimary, Kind:kind, SKU:sku.name, Location:primaryLocation}" -o table
echo ""
echo "Recent Transactions (Last 1h):"
STORAGE_ID=$(az storage account show -n "$STORAGE" -g "$RG" --query id -o tsv)
az monitor metrics list --resource "$STORAGE_ID" --metric Transactions --interval PT1H --aggregation Total --output table

# --------- ACR USAGE/HEALTH ---------
print_header "Container Registry (ACR)"
az acr show -n "$ACR" -g "$RG" --query "{Status:provisioningState, LoginServer:loginServer, SKU:sku.name}" -o table

# --------- PLATFORM HEALTH & ACTIVITY ---------
print_header "Azure Resource Health & Activity Log"

for RES in "$CLUSTER" "$STORAGE" "$ACR"; do
    echo "--- Health: $RES ---"
    RID=$(az resource show -g "$RG" -n "$RES" --query id -o tsv)
    az resource health list --resource-id "$RID" --query "[?properties.availabilityState!='Available']" -o table
    if [ $? -eq 0 ]; then
       echo "(If table is empty, resource is Available/Healthy)"
    fi
done

echo ""
echo "Activity Log (Failed operations, last 24h):"
az monitor activity-log list --resource-group "$RG" --status Failed --max-events 10 --select eventTimestamp operationName status message -o table

echo ""
echo "Diagnostics Complete."
