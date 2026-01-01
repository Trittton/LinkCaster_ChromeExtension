# Gyazo Setup Guide

To enable Gyazo integration in the Image Link Converter extension, you need to create a Gyazo application and get an access token.

## Steps to Set Up Gyazo

### 1. Create a Gyazo Application

1. Go to [Gyazo OAuth Applications](https://gyazo.com/oauth/applications)
2. Log in to your Gyazo account (or create one if you don't have one)
3. Click "Register new application" or "Generate new application"
4. Fill in the application details:
   - **Application name**: Image Link Converter (or your preferred name)
   - **Description**: Personal image upload tool
   - **Callback URL**: You can use `http://localhost` (not needed for access token)

### 2. Get Your Access Token

After creating the app, you'll see your application details page with:
- **Client ID**: A long string (you don't need this)
- **Client Secret**: Another long string (you don't need this)
- **Generate Access Token**: Click this button to generate a personal access token

Click the "Generate Access Token" button to create a personal access token. This is the token you'll use in the extension.

**Important**: Copy this access token - you'll need it in the next step.

### 3. Configure the Extension

1. Install the extension in your browser
2. Open the extension popup
3. Select "Gyazo" from the dropdown
4. Click the gear icon (⚙️) to expand settings
5. Paste your access token in the "Gyazo Access Token" field
6. Click "Save API Key"

### 4. Usage

Once configured:
- The extension will use your access token for uploads
- You can upload images directly to Gyazo
- Images will be uploaded to your Gyazo account
- The extension returns direct image URLs (`https://i.gyazo.com/...`)

## How It Works

### Upload Process
- Images uploaded to: `https://upload.gyazo.com/api/upload`
- Authorization: `Bearer {access_token}` in the Authorization header
- Returns direct image URL: `https://i.gyazo.com/...`

## Troubleshooting

### "Invalid Gyazo access token" Error
- Make sure you copied the full access token from Gyazo
- Verify you clicked "Save API Key" after pasting the token
- Try generating a new access token from your Gyazo app settings

### Upload Errors
- Verify your Gyazo account has upload permissions
- Check that the access token hasn't been revoked
- Re-generate and save a new access token if needed

### Token Not Saved
- Make sure you clicked the "Save API Key" button
- Check browser console (F12) for any error messages
- Try refreshing the extension and re-entering the token

## Security Notes

⚠️ **Important Security Information:**

1. **Keep your access token private**
   - The access token grants upload access to your Gyazo account
   - Never share it publicly or commit it to version control
   - Anyone with your token can upload images to your account

2. **Access Token Storage**
   - Access tokens are stored in Chrome's sync storage
   - They sync across your Chrome browsers when signed in
   - Revoke access from [Gyazo OAuth Applications](https://gyazo.com/oauth/applications) if needed

3. **Token Revocation**
   - You can revoke or regenerate tokens at any time from your Gyazo app settings
   - If you suspect your token was compromised, immediately revoke it and generate a new one

## API Documentation

For more details about Gyazo's Upload API:
- [Gyazo API Documentation](https://gyazo.com/api/docs)
- [Gyazo OAuth Applications](https://gyazo.com/oauth/applications)

## Benefits of This Approach

- **Simple setup**: Just copy and paste your access token
- **No file editing**: Everything is done through the extension UI
- **Secure**: Token is stored in Chrome's encrypted storage
- **Personal use**: Perfect for individual users who want to upload to their own Gyazo account
