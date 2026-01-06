# Deployment Guide

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `dogechain-bubblemaps-api`
3. Make it **Public** (required for free Vercel)
4. **Don't** initialize with README (we already have files)
5. Click "Create repository"

## Step 2: Push to GitHub

From the API project directory:

```bash
cd "/Volumes/DEV Projects/dogechain-bubblemaps-api"

# Add the remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/dogechain-bubblemaps-api.git

# Push to GitHub
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Vercel CLI (Faster)

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Login:**
```bash
vercel login
```

3. **Deploy:**
```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? (Select your account)
- Link to existing project? **N**
- What's your project's name? **dogechain-bubblemaps-api**
- In which directory is your code located? **.** (current directory)
- Want to override settings? **N**

4. **Add DATABASE_URL:**
```bash
vercel env add DATABASE_URL
```

Paste your Neon connection string (get it from https://console.neon.tech):
```
postgresql://user:password@ep-xxx.aws.neon.tech/dbname?sslmode=require
```

Select all environments (Production, Preview, Development).

5. **Deploy to Production:**
```bash
vercel --prod
```

### Option B: Vercel Dashboard (Easier)

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select `dogechain-bubblemaps-api` from GitHub
4. **Environment Variables:**
   - Click "Environment Variables"
   - Name: `DATABASE_URL`
   - Value: Your Neon connection string
   - Click "Add"
5. Click "Deploy"

## Step 4: Verify Deployment

Once deployed, test the endpoints:

```bash
# Health check
curl https://your-project.vercel.app/api/health

# Expected response:
# {
#   "status": "healthy",
#   "database": "connected",
#   "timestamp": "2024-01-06T..."
# }
```

## Step 5: Connect Frontend to Backend

Update your main Vite app to call the API:

**File:** `/services/searchAnalytics.ts`

Update the API endpoints:

```typescript
// Change from relative paths to full API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://your-project.vercel.app";

// Example in trackSearch():
await fetch(`${API_BASE_URL}/api/analytics/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ... })
});
```

**File:** `.env.local` (in main Vite app)

```bash
VITE_API_URL=https://your-project.vercel.app
```

## Vercel Dashboard Features

After deployment, you can monitor:

- **Deployments**: View build logs and deployment history
- **Analytics**: API invocation count, error rate
- **Environment Variables**: Manage DATABASE_URL
- **Domains**: Set up custom domain (optional)

## Cost Monitoring

**Free Tier Limits:**
- 100K invocations/month
- 100GB bandwidth/month
- 10GB-Hrs serverless execution

**Check Usage:**
- Vercel Dashboard → Project → Usage
- Upgrade to Pro ($20/mo) when needed

## Troubleshooting

### "DATABASE_URL not configured"
- Add environment variable in Vercel Dashboard
- Redeploy after adding

### "Connection refused"
- Check DATABASE_URL is correct
- Verify Neon database is active
- Check IP allowlist in Neon (should allow all)

### 504 Timeout
- Function execution timeout (10s max on free tier)
- Optimize queries or upgrade to Pro

### Build Failures
- Check Vercel build logs
- Verify Node version (>=18.0.0)
- Run `npm run build` locally to test

## Next Steps

1. ✅ Deploy API to Vercel
2. ✅ Test all endpoints
3. ✅ Update frontend to call API
4. ✅ Deploy frontend changes
5. ✅ Monitor usage in Vercel dashboard

## Production Checklist

- [ ] DATABASE_URL set in Vercel
- [ ] All endpoints tested
- [ ] Frontend configured with API URL
- [ ] Health check passing
- [ ] Error monitoring set up
- [ ] Usage alerts configured
- [ ] Custom domain (optional)
