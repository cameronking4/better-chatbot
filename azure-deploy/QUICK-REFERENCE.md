# Deployment Quick Reference

## 🚀 One-Command Deployment

```bash
pnpm deploy:quick
```

## 📋 Common Commands

| Command | Description |
|---------|-------------|
| `pnpm deploy` | Full deployment with prompts |
| `pnpm deploy:quick` | Quick deployment (non-interactive) |
| `pnpm deploy:skip-build` | Deploy without rebuilding image |
| `pnpm deploy:skip-env` | Deploy without updating env vars |

## 🔍 Check Status

```bash
# Pods status
kubectl get pods -n better-chatbot

# Deployment status
kubectl get deployment better-chatbot -n better-chatbot

# Redis status
kubectl get pods -n better-chatbot -l app=redis

# View logs
kubectl logs -f deployment/better-chatbot -n better-chatbot
```

## 🔄 Rollback

```bash
kubectl rollout undo deployment/better-chatbot -n better-chatbot
```

## 🌐 Application URL

```bash
kubectl get service better-chatbot-service -n better-chatbot
```

## 📝 Typical Workflow

1. Make your changes (UI/API)
2. Test locally: `pnpm dev`
3. Deploy: `pnpm deploy:quick`
4. Verify: Check pods and test URL

## ⚡ GitHub Actions

- Auto-deploys on push to `main`
- Manual trigger available in Actions tab
- Options to skip build/env update

