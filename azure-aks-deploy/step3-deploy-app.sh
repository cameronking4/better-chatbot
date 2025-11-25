#!/bin/bash
set -e

GREEN='\033[0;32m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

RESOURCE_GROUP="${RESOURCE_GROUP:-better-chatbot-rg}"

# Get ACR and image info
ACR_NAME=$(az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
IMAGE_TAG="$ACR_LOGIN_SERVER/better-chatbot:latest"

print_status "Using image: $IMAGE_TAG"

# Create namespace
print_status "Creating namespace..."
kubectl create namespace better-chatbot --dry-run=client -o yaml | kubectl apply -f -

# Create secrets from .env
print_status "Creating secrets from .env file..."
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

kubectl create secret generic better-chatbot-env \
    --from-env-file=.env \
    --namespace=better-chatbot \
    --dry-run=client -o yaml | kubectl apply -f -

# Create K8s manifests
print_status "Creating Kubernetes manifests..."
mkdir -p azure-aks-deploy/k8s

cat > azure-aks-deploy/k8s/deployment.yaml << DEPLOYMENT_EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: better-chatbot
  namespace: better-chatbot
  labels:
    app: better-chatbot
spec:
  replicas: 2
  selector:
    matchLabels:
      app: better-chatbot
  template:
    metadata:
      labels:
        app: better-chatbot
    spec:
      containers:
      - name: better-chatbot
        image: $IMAGE_TAG
        ports:
        - containerPort: 3000
        env:
        - name: NO_HTTPS
          value: "1"
        - name: PORT
          value: "3000"
        - name: HOSTNAME
          value: "0.0.0.0"
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: better-chatbot-env
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
DEPLOYMENT_EOF

cat > azure-aks-deploy/k8s/service.yaml << SERVICE_EOF
apiVersion: v1
kind: Service
metadata:
  name: better-chatbot-service
  namespace: better-chatbot
spec:
  type: LoadBalancer
  selector:
    app: better-chatbot
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
SERVICE_EOF

# Deploy
print_status "Deploying to Kubernetes..."
kubectl apply -f azure-aks-deploy/k8s/deployment.yaml
kubectl apply -f azure-aks-deploy/k8s/service.yaml

# Wait for deployment
print_status "Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/better-chatbot -n better-chatbot

# Get service info
print_status "Getting service information..."
kubectl get services -n better-chatbot

print_status "✅ Application deployed successfully!"
echo ""
echo "To get the external IP (may take a few minutes):"
echo "  kubectl get service better-chatbot-service -n better-chatbot"
echo ""
echo "To view logs:"
echo "  ./azure-aks-deploy/logs.sh"
echo ""
echo "To check status:"
echo "  ./azure-aks-deploy/status.sh"
