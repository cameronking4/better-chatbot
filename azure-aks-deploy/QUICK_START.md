# Quick Start Guide

## 🚀 Deploy Right Now

```bash
cd /Users/cameronking/Downloads/better-chatbot-main
./azure-aks-deploy/complete-deployment.sh
```

That's it! Wait 15-20 minutes and your app will be live.

---

## 📋 Three Simple Steps

### 1. Build & Push Image (5-10 min)
```bash
./azure-aks-deploy/step1-build-image.sh
```

### 2. Create Cluster (5-10 min)
```bash
./azure-aks-deploy/step2-create-aks.sh
```

### 3. Deploy App (2-3 min)
```bash
./azure-aks-deploy/step3-deploy-app.sh
```

---

## 🔍 Check Status

```bash
./azure-aks-deploy/status.sh
```

---

## 🌐 Get Your URL

```bash
kubectl get service better-chatbot-service -n better-chatbot
```

Look for the EXTERNAL-IP. Your app will be at: `http://<EXTERNAL-IP>`

---

## 📊 View Logs

```bash
./azure-aks-deploy/logs.sh
```

---

## 🔄 Update App

After making code changes:
```bash
./azure-aks-deploy/update-deployment.sh
```

After changing .env:
```bash
./azure-aks-deploy/update-secrets.sh
```

---

## 🗑️ Delete Everything

```bash
./azure-aks-deploy/cleanup.sh
```

---

## ⏸️ Stop (but keep resources)

```bash
az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg
```

Start again:
```bash
az aks start --name better-chatbot-aks --resource-group better-chatbot-rg
```

---

## 🆘 Troubleshooting

### Build stuck?
```bash
./azure-aks-deploy/check-build-status.sh
```

### Pods not starting?
```bash
kubectl get pods -n better-chatbot
kubectl describe pod <pod-name> -n better-chatbot
kubectl logs <pod-name> -n better-chatbot
```

### No external IP?
Wait 5 minutes, then:
```bash
kubectl get service better-chatbot-service -n better-chatbot --watch
```

---

## 💡 Pro Tips

- **Scale up**: `kubectl scale deployment/better-chatbot --replicas=5 -n better-chatbot`
- **Restart**: `kubectl rollout restart deployment/better-chatbot -n better-chatbot`
- **Shell access**: `kubectl exec -it deployment/better-chatbot -n better-chatbot -- /bin/sh`
- **Port forward**: `kubectl port-forward service/better-chatbot-service 3000:80 -n better-chatbot`

---

## 📱 Important URLs

- **Azure Portal**: https://portal.azure.com
- **Your Resource Group**: better-chatbot-rg
- **Region**: East US

---

## 💰 Monthly Cost

~$173/month (can stop when not in use to save money)

---

## 📚 Full Documentation

- `AZURE_DEPLOYMENT_SUMMARY.md` - Complete overview
- `DEPLOYMENT_GUIDE.md` - Detailed guide
- `README.md` - General info

---

**Ready to deploy? Just run:**

```bash
./azure-aks-deploy/complete-deployment.sh
```

🎉 That's it!
