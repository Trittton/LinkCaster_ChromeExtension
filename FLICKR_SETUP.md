# Flickr OAuth Setup Guide

To enable Flickr integration in the Image Link Converter extension, you need to create a Flickr app and configure the OAuth credentials.

## Steps to Set Up Flickr OAuth

### 1. Create a Flickr App

1. Go to [Flickr App Garden](https://www.flickr.com/services/apps/create/apply)
2. Click "Request an API Key"
3. Choose "Apply for a Non-Commercial Key" (or Commercial if applicable)
4. Fill in the application details:
   - **App Name**: Image Link Converter (or your preferred name)
   - **App Description**: Browser extension for converting and uploading images
   - Check the boxes to agree to terms
5. Click "Submit"

### 2. Get Your API Credentials

After creating the app, you'll receive:
- **API Key** (Consumer Key)
- **API Secret** (Consumer Secret)

Keep these credentials secure and do not share them publicly.

### 3. Configure the Extension

1. Open `popup.js` in a text editor
2. Find the `FLICKR_CONFIG` object (around line 35)
3. Replace the placeholder values:

```javascript
const FLICKR_CONFIG = {
  apiKey: 'YOUR_FLICKR_API_KEY',        // Replace with your API Key
  apiSecret: 'YOUR_FLICKR_API_SECRET',  // Replace with your API Secret
  callbackUrl: chrome.identity.getRedirectURL('flickr'),
  requestTokenUrl: 'https://www.flickr.com/services/oauth/request_token',
  authorizeUrl: 'https://www.flickr.com/services/oauth/authorize',
  accessTokenUrl: 'https://www.flickr.com/services/oauth/access_token',
  uploadUrl: 'https://up.flickr.com/services/upload/'
};
```

### 4. Reload the Extension

1. Open Chrome/Edge and go to `chrome://extensions/` or `edge://extensions/`
2. Click the "Reload" button under the Image Link Converter extension
3. Open the extension popup
4. Select "Flickr" from the dropdown
5. Click the gear icon to expand settings
6. Click "Connect to Flickr"
7. Authorize the app when prompted by Flickr

### 5. Usage

Once authenticated:
- The extension will remember your OAuth tokens
- You can upload images directly to Flickr
- The button will show "Connected to Flickr" when authenticated
- Your username will be displayed below the button

## Troubleshooting

### OAuth Errors
- Make sure your API Key and Secret are correctly entered in `popup.js`
- Ensure the extension has the `identity` permission in `manifest.json`
- Check the browser console (F12) for detailed error messages

### Upload Errors
- Verify your Flickr account has upload permissions
- Check that the OAuth token hasn't expired
- Re-authenticate by clicking the "Connect to Flickr" button again

### Token Storage
- OAuth tokens are stored securely in Chrome's sync storage
- Tokens persist across browser sessions
- To reset, remove the extension and reinstall

## Security Notes

⚠️ **Important Security Information:**

1. **Never commit API credentials to version control**
   - Add `popup.js` to `.gitignore` if you're using Git
   - Or use environment variables/build scripts to inject credentials

2. **Keep your API Secret private**
   - The API Secret should never be shared or exposed
   - It's used to sign OAuth requests

3. **OAuth Tokens**
   - OAuth tokens are stored in Chrome's sync storage
   - They grant access to your Flickr account
   - Revoke access from [Flickr's App Settings](https://www.flickr.com/services/auth/list.gne) if needed

## Alternative: Using a Configuration File

For better security, you can modify the extension to load credentials from Chrome storage:

1. Store API credentials in Chrome storage during setup
2. Read them dynamically instead of hardcoding in the script
3. This prevents accidental exposure in version control

This would require additional setup UI but provides better security for distributed extensions.
