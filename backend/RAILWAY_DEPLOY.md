# Railway Deployment Instructions

## Method 1: Deploy via GitHub (Recommended)

### Step 1: Push to GitHub
```bash
cd C:\Projects\ImgURLConverter\backend
# Create new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/linkcaster-backend.git
git push -u origin master
```

### Step 2: Deploy on Railway
1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Select your `linkcaster-backend` repository
5. Railway will auto-detect Node.js and deploy

### Step 3: Set Environment Variables
In Railway dashboard:
1. Click on your project
2. Go to **"Variables"** tab
3. Add these variables:
   - `GOOGLE_CLIENT_ID` = (your real Google OAuth Client ID)
   - `GOOGLE_CLIENT_SECRET` = (your real Google OAuth Client Secret)
   - `PORT` = 3000

4. **IMPORTANT:** Don't set `GOOGLE_REDIRECT_URI` yet - wait until you get your Railway URL

### Step 4: Get Your Railway URL
1. Go to **"Settings"** tab
2. Under **"Domains"**, you'll see a URL like: `https://linkcaster-backend-production-xxxx.up.railway.app`
3. Copy this URL

### Step 5: Update GOOGLE_REDIRECT_URI
1. Go back to **"Variables"** tab
2. Add: `GOOGLE_REDIRECT_URI` = `https://your-railway-url.up.railway.app/oauth/callback`

---

## Method 2: Deploy via Railway CLI

### Step 1: Login
```bash
railway login
```
(This opens browser for authentication)

### Step 2: Initialize and Deploy
```bash
cd C:\Projects\ImgURLConverter\backend
railway init
railway up
```

### Step 3: Set Environment Variables
```bash
railway variables set GOOGLE_CLIENT_ID="your-client-id"
railway variables set GOOGLE_CLIENT_SECRET="your-client-secret"
railway variables set PORT=3000
```

### Step 4: Get Domain
```bash
railway domain
```

### Step 5: Set Redirect URI
```bash
railway variables set GOOGLE_REDIRECT_URI="https://your-railway-url.up.railway.app/oauth/callback"
```

---

## After Deployment

### Update Extension
Edit `C:\Projects\ImgURLConverter\background.js` line 531:
```javascript
const BACKEND_URL = 'https://your-railway-url.up.railway.app';
```

### Update Google Cloud Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client ID
3. Add to **"Authorized redirect URIs"**:
   ```
   https://your-railway-url.up.railway.app/oauth/callback
   ```
4. Click **Save**

---

## Troubleshooting

### Check Logs
Railway Dashboard → Your Project → **"Deployments"** tab → Click latest deployment → View logs

### Test Endpoint
Visit: `https://your-railway-url.up.railway.app/health`
Should return: `{"status":"ok","timestamp":"..."}`

### Common Issues
- **"Application failed to respond"**: Check that PORT is set to 3000
- **"OAuth error"**: Verify redirect URI matches exactly in both Railway and Google Console
- **"Build failed"**: Check deployment logs for missing dependencies
