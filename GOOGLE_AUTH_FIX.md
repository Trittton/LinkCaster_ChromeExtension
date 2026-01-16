# Google Drive Auth Session Fix

## Issue
Google Drive authentication session expires too quickly, especially when the backend server sleeps (common on Railway and similar platforms). Users have to re-authenticate frequently.

## Root Cause
The OAuth tokens (access token and refresh token) are stored **in-memory on the server** (`const sessions = new Map()`). When the server sleeps or restarts:
1. All in-memory session data is lost
2. The extension still has the `sessionId` but the server has no corresponding tokens
3. Uploads fail with "Invalid session" errors
4. User must re-authenticate

## Solution: Client-Side Token Storage

Instead of relying on the server to store tokens, we'll store them **locally in the Chrome extension** and handle token refresh client-side.

### Architecture Changes

#### Before (Server-Side Storage):
```
Extension → Server (stores tokens) → Google Drive API
           ↓ Server sleeps
           ✗ Tokens lost
```

#### After (Client-Side Storage):
```
Extension (stores tokens) → Google Drive API
           ↓ Server sleeps
           ✓ Tokens persist in extension storage
```

### Implementation Plan

1. **Store tokens in Chrome extension storage** (`chrome.storage.local`)
   - Access token
   - Refresh token
   - Expiration time
   - Connected timestamp

2. **Use server only for OAuth flow**
   - Initial authorization
   - Token exchange
   - Return tokens to extension (don't store on server)

3. **Handle token refresh in extension**
   - Check token expiration before each upload
   - Refresh automatically if expired
   - Update stored tokens

4. **Upload directly from extension**
   - Use stored access token
   - No need for sessionId
   - Independent of server state

### Benefits

✅ **Persistent authentication** - Tokens survive server restarts  
✅ **Offline-first** - Works even if server is temporarily down  
✅ **Better UX** - Users authenticate once, tokens last until revoked  
✅ **Reduced server load** - No session storage or verification needed  
✅ **Standard OAuth pattern** - How most OAuth clients work  

### Security Considerations

- Tokens stored in `chrome.storage.local` (encrypted by Chrome)
- Refresh tokens allow long-term access (standard OAuth 2.0 pattern)
- Users can revoke access via Google account settings
- No tokens transmitted except to Google's API

## Files to Modify

1. ✅ `background.js` - Store tokens locally, handle refresh
2. ✅ `js/modules/uploadServices.js` - Upload with local tokens
3. ⚠️ `backend/server.js` - Simplify to return tokens (optional, for backward compatibility)

## Implementation Details

### 1. Store Tokens After OAuth (`background.js`)

```javascript
// After successful OAuth, store tokens locally
await chrome.storage.local.set({
  googleDriveAccessToken: tokenData.access_token,
  googleDriveRefreshToken: tokenData.refresh_token,
  googleDriveTokenExpiry: Date.now() + (tokenData.expires_in * 1000),
  googleDriveConnected: true,
  googleDriveConnectedAt: Date.now()
});
```

### 2. Token Refresh Function (`background.js`)

```javascript
async function refreshGoogleDriveToken() {
  const storage = await chrome.storage.local.get(['googleDriveRefreshToken']);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: storage.googleDriveRefreshToken,
      grant_type: 'refresh_token'
    })
  });
  
  const tokenData = await response.json();
  
  // Update stored tokens
  await chrome.storage.local.set({
    googleDriveAccessToken: tokenData.access_token,
    googleDriveTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
  });
  
  return tokenData.access_token;
}
```

### 3. Upload with Local Tokens (`background.js`)

```javascript
async function uploadToGoogleDrive(fileData, fileName) {
  // Get tokens from local storage
  let storage = await chrome.storage.local.get([
    'googleDriveAccessToken',
    'googleDriveRefreshToken',
    'googleDriveTokenExpiry'
  ]);
  
  // Refresh if expired
  if (Date.now() >= storage.googleDriveTokenExpiry) {
    storage.googleDriveAccessToken = await refreshGoogleDriveToken();
  }
  
  // Upload directly to Google Drive
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${storage.googleDriveAccessToken}`,
        'Content-Type': 'multipart/related; boundary="boundary"'
      },
      body: multipartBody
    }
  );
  
  // ... handle response
}
```

## Migration Strategy

For existing users with server-side sessions:
1. Keep backward compatibility initially
2. On next authentication, migrate to client-side storage
3. Eventually deprecate server-side session storage

## Testing Checklist

- [ ] Fresh authentication stores tokens locally
- [ ] Tokens persist after browser restart
- [ ] Tokens persist after server restart
- [ ] Token refresh works automatically
- [ ] Upload works with refreshed tokens
- [ ] Error handling for revoked tokens
- [ ] Disconnect clears local tokens

---

**Status**: 🚧 Implementation in progress  
**Priority**: High  
**Impact**: Significantly improves user experience
