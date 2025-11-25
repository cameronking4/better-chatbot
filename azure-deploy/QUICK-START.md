# Better Chatbot - Azure Deployment Quick Start

## 🎯 Your Deployment is Ready!

Your application is already deployed and running on Azure AKS.

**Application URL**: http://135.234.147.179

## 📝 Common Tasks

### Deploy Code Changes

When you make changes to your Next.js app:

```bash
cd azure-deploy
./update-deploy.sh
```

This will:
1. Build new Docker image with your changes
2. Push to Azure Container Registry
3. Rolling update to your pods (zero downtime)
4. Verify health

**Time**: ~3-5 minutes

### Check Application Status

```bash
./status.sh
```

Shows everything: pods, services, Azure resources, recent events.

### View Live Logs

```bash
# Follow logs in real-time
./logs.sh --follow

# View last 50 lines
./logs.sh --lines 50
```

### Scale Up/Down

```bash
# Scale to 3 pods
./scale.sh 3

# Scale down to 1 pod
./scale.sh 1
```

## 📂 Files

| File | Purpose | You Need This? |
|------|---------|----------------|
| `update-deploy.sh` | ⭐ Deploy code changes | **YES - Use often** |
| `status.sh` | Check deployment status | **YES - Very useful** |
| `logs.sh` | View application logs | **YES - For debugging** |
| `scale.sh` | Change number of pods | Maybe |
| `deployment-config.sh` | Configuration variables | Auto-generated |
| `deployment-info.txt` | Full documentation | Reference only |
| `initial-deploy.sh` | Create new deployment | Only for new environments |
| `cleanup.sh` | Delete everything | Danger zone! |
| `README.md` | Full documentation | When you need details |

## 🔄 Typical Workflow

1. **Make code changes** in your project
2. **Test locally** if needed
3. **Deploy to Azure**:
   ```bash
   cd azure-deploy
   ./update-deploy.sh
   ```
4. **Check it worked**:
   ```bash
   ./status.sh
   # or
   ./logs.sh --follow
   ```
5. **Test live**: Visit http://135.234.147.179

## 🐛 Something Wrong?

### Pods not starting after update?

```bash
# Check pod status
./status.sh

# View recent logs
./logs.sh --lines 100

# Rollback to previous version
source deployment-config.sh
kubectl rollout undo deployment/better-chatbot -n $NAMESPACE
```

### Want to see what's in persistent storage?

```bash
source deployment-config.sh
kubectl exec -it deployment/better-chatbot -n $NAMESPACE -- ls -la /app/data
```

### Update stuck or taking too long?

```bash
# Check what's happening
kubectl get pods -n better-chatbot -w

# Force restart if needed
source deployment-config.sh
kubectl rollout restart deployment/better-chatbot -n $NAMESPACE
```

## 💡 Pro Tips

1. **Keep deployment-config.sh** - Other scripts need it
2. **Monitor costs** - Check Azure Portal regularly
3. **Scale down when not in use** - `./scale.sh 1` saves money
4. **Test updates locally first** - Docker build before deploying
5. **Watch logs during deployment** - Catch issues early

## 🔗 Quick Links

- **Application**: http://135.234.147.179
- **Azure Portal**: https://portal.azure.com → better-chatbot-rg
- **Container Registry**: betterchatbotacr1764026475.azurecr.io

## 💰 Cost Note

Current setup costs ~$165/month. To reduce:
- Scale down: `./scale.sh 1`
- Stop when not using: `az aks stop --name better-chatbot-aks --resource-group better-chatbot-rg`

## 📚 Need More Help?

See full documentation in `README.md`

---

**Most Important Commands**:
- Deploy changes: `./update-deploy.sh`
- Check status: `./status.sh`  
- View logs: `./logs.sh --follow`

That's it! 🚀
