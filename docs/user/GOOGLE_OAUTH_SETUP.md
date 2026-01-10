# Google OAuth Setup Guide for LinkCaster

This guide will help you set up Google Drive OAuth authentication for the LinkCaster extension.

## Prerequisites

- Google Account
- Backend server installed (see `backend/README.md`)

## Step-by-Step Setup

### 1. Access Google Cloud Console

1. Open your browser and go to: https://console.cloud.google.com/
2. Sign in with your Google account

### 2. Create a New Project

1. Click the **project dropdown** in the top navigation bar (next to "Google Cloud")
2. Click **"New Project"** in the dialog that appears
3. Enter project details:
   - **Project name**: `LinkCaster` (or your preferred name)
   - **Organization**: Leave as default (optional)
4. Click **"Create"**
5. Wait for the project to be created (notification will appear in top-right)
6. **Select your new project** from the project dropdown

### 3. Enable Google Drive API

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. In the search box, type: `Google Drive API`
3. Click on **"Google Drive API"** in the results
4. Click the **"Enable"** button
5. Wait for the API to be enabled (you'll be redirected to the API page)

### 4. Configure OAuth Consent Screen

Before creating credentials, you need to configure the OAuth consent screen:

1. In the left sidebar, click **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** user type (unless you have a Google Workspace account)
3. Click **"Create"**

4. **App information** page:
   - **App name**: `LinkCaster`
   - **User support email**: Your email address
   - **App logo**: (Optional) You can upload the extension icon
   - **Application home page**: (Optional) Leave blank or add your GitHub repo
   - **Developer contact information**: Your email address
   - Click **"Save and Continue"**

5. **Scopes** page:
   - Click **"Add or Remove Scopes"**
   - In the filter box, search for: `drive.file`
   - Check the box for: `.../auth/drive.file` (View and manage Google Drive files and folders that you have opened or created with this app)
   - Click **"Update"**
   - Click **"Save and Continue"**

6. **Test users** page:
   - Click **"+ Add Users"**
   - Enter your Gmail address (the one you'll use to connect Google Drive)
   - Click **"Add"**
   - Click **"Save and Continue"**

7. **Summary** page:
   - Review your settings
   - Click **"Back to Dashboard"**

### 5. Create OAuth 2.0 Credentials

1. In the left sidebar, click **"APIs & Services"** → **"Credentials"**
2. Click **"+ Create Credentials"** at the top
3. Select **"OAuth client ID"**

4. Configure the OAuth client:
   - **Application type**: Select **"Web application"**
   - **Name**: `LinkCaster Backend`
   - **Authorized JavaScript origins**: (Leave empty)
   - **Authorized redirect URIs**: Click **"+ Add URI"**
     - For local development: `http://localhost:3000/oauth/callback`
     - For production: `https://your-domain.com/oauth/callback` (replace with your actual domain)
   - Click **"Create"**

5. A dialog will appear with your credentials:
   - **Client ID**: Something like `123456789-abc123def456.apps.googleusercontent.com`
   - **Client Secret**: Something like `GOCSPX-ABC123def456GHI789`
   - **Important**: Copy both values NOW - you'll need them in the next step!
   - Click **"OK"** to close the dialog

### 6. Configure Backend Server

1. Open your backend folder:
   ```
   cd c:\Projects\ImgURLConverter\backend
   ```

2. Open the `.env` file in a text editor (create it if it doesn't exist):
   ```
   notepad .env
   ```

3. Update the file with your credentials:
   ```env
   GOOGLE_CLIENT_ID=123456789-abc123def456.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-ABC123def456GHI789
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
   PORT=3000
   ```

4. **Replace** the placeholder values:
   - `GOOGLE_CLIENT_ID`: Paste your Client ID from step 5
   - `GOOGLE_CLIENT_SECRET`: Paste your Client Secret from step 5
   - `GOOGLE_REDIRECT_URI`: Should match the redirect URI you added in step 5

5. Save the file

### 7. Start the Backend Server

1. If the backend is already running, stop it (Ctrl+C in the terminal)

2. Start the backend server:
   ```bash
   npm start
   ```

3. You should see:
   ```
   ==================================================
   LinkCaster Backend Server
   ==================================================
   Status: Running on port 3000
   Google Client ID: 123456789-abc123de...
   Redirect URI: http://localhost:3000/oauth/callback
   ==================================================
   ```

### 8. Test OAuth in Extension

1. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Find LinkCaster
   - Click the refresh icon 🔄

2. **Open the extension popup**
3. Go to the **"Upload Vid"** tab
4. Click **"Connect to Google Drive"**
5. A Google sign-in window should open
6. **Sign in** with the Google account you added as a test user (in step 4.6)
7. **Grant permissions** when prompted
8. You should see "Connected to Google Drive!" message
9. OAuth is now working! ✅

## Troubleshooting

### Error: "Access blocked: This app's request is invalid"
- **Solution**: Make sure you configured the OAuth consent screen (Step 4)
- Make sure the redirect URI in `.env` matches exactly what you added in Google Cloud Console

### Error: "401: invalid_client"
- **Solution**: Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` are correct
- Make sure you copied them exactly from Google Cloud Console (no extra spaces)

### Error: "redirect_uri_mismatch"
- **Solution**: The redirect URI in your `.env` file must EXACTLY match what you configured in Google Cloud Console
- Check for trailing slashes, http vs https, localhost vs 127.0.0.1

### Error: "This app is blocked"
- **Solution**: You need to add your email as a test user (Step 4.6)
- Or publish your app (not recommended for personal use)

### Backend won't start
- **Solution**: Make sure you have Node.js installed
- Run `npm install` in the backend folder
- Check that port 3000 is not already in use

### "Unable to connect to backend server"
- **Solution**: Make sure the backend server is running (`npm start`)
- Check that `BACKEND_URL` in `background.js` is set to `http://localhost:3000`

## Production Deployment

When deploying to production (Heroku, Railway, etc.):

1. Update `GOOGLE_REDIRECT_URI` in `.env` to your production URL:
   ```env
   GOOGLE_REDIRECT_URI=https://your-backend.com/oauth/callback
   ```

2. Add the same URL to **Authorized redirect URIs** in Google Cloud Console

3. Update `BACKEND_URL` in `background.js`:
   ```javascript
   const BACKEND_URL = 'https://your-backend.com';
   ```

4. Redeploy the extension

## Security Notes

- ⚠️ **Never commit `.env` file to git** - it contains sensitive credentials
- The `.gitignore` file already excludes `.env`
- For production, use environment variables provided by your hosting platform
- Keep your Client Secret private - treat it like a password

## Next Steps

After OAuth is working:
1. Test video upload functionality
2. Configure your preferred folder for scanning (click ⚙️ button)
3. Upload videos and get Google Drive links!

---

**Need Help?**
- Check the console for error messages (F12 → Console tab)
- Review the backend logs in the terminal
- Verify all URLs match exactly (no typos!)
