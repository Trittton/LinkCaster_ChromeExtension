# Features Added Since Last Git Commit

This document describes ALL features and changes made to the LinkCaster extension since the last git commit (e4100c2 - Initial commit).

---

## 🎯 Core Features Added

### 1. Multi-Tab Interface
**Status:** Implemented but not committed
**Files:** popup.html, popup.css, popup.js

**Changes:**
- Converted single-page extension to tabbed interface
- 3 tabs: Convert, Upload Img, Upload Vid
- Tab switching with active state management
- Tab state persistence (remembers last opened tab)

**HTML Structure:**
```html
<div class="tabs">
  <button class="tab-btn active" data-tab="convert">Convert</button>
  <button class="tab-btn" data-tab="upload-img">Upload Img</button>
  <button class="tab-btn" data-tab="upload-vid">Upload Vid</button>
</div>

<div id="tab-convert" class="tab-content active">...</div>
<div id="tab-upload-img" class="tab-content">...</div>
<div id="tab-upload-vid" class="tab-content">...</div>
```

**JavaScript:**
```javascript
function switchTab(tabName) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
  chrome.storage.local.set({ currentTab: tabName });
}
```

---

### 2. Google Drive OAuth Integration
**Status:** Implemented (backend deployed to Railway)
**Files:** background.js, popup.js, popup.html, backend/server.js

**Backend (Railway):**
- URL: `https://web-production-674b.up.railway.app`
- Session-based OAuth flow
- Session verification endpoint: `/auth/verify/:sessionId`
- Upload endpoint: `/api/upload`
- Automatic file sharing (public "anyone with link" access)
- Preview URL format: `https://drive.google.com/file/d/FILE_ID/view`

**Frontend (Extension):**
- OAuth button in Upload Vid tab settings
- Session storage in `chrome.storage.local`:
  - `googleDriveSessionId` - Backend session ID
  - `googleDriveConnected` - Boolean connection status
  - `googleDriveConnectedAt` - Timestamp of connection
- Connection persistence across browser restarts
- Automatic session verification on window close
- Error: "Authentication was not completed" if user cancels

**OAuth Flow:**
1. User clicks "Connect to Google Drive"
2. Extension → Backend `/auth/google/start` → Get authUrl + sessionId
3. Launch `chrome.identity.launchWebAuthFlow(authUrl)`
4. User authorizes on Google
5. Google → Backend `/oauth/callback` → Exchange code for tokens
6. Backend stores tokens in session
7. Window closes, extension verifies session
8. Session ID stored for future uploads

---

### 3. Google Drive UI Components
**Status:** Implemented
**Files:** popup.html, popup.css, popup.js

**Upload Vid Tab:**
- Settings panel (gear button ⚙️) with:
  - Folder configuration
  - Google Drive connection section
  - Connect/Reconnect button
  - Unlink button (appears when connected)
  - Connection status indicator
- First-time connection prompt (shown only if never connected)
- Error badge on settings button (if session expired)

**UI Elements:**
```html
<!-- Settings panel -->
<div class="folder-config" id="folder-config-vid" style="display: none;">
  <!-- Folder selection -->
  <label>Scan Folder</label>
  ...

  <!-- Google Drive -->
  <div style="border-top...">
    <label>Google Drive Connection</label>
    <div class="button-group">
      <button id="gdrive-connect">Connect to Google Drive</button>
      <button id="gdrive-unlink" style="display: none;">Unlink</button>
    </div>
    <small id="gdrive-status">Not connected</small>
  </div>
</div>

<!-- First-time prompt -->
<div class="gdrive-first-time" id="gdrive-first-time" style="display: none;">
  <div>🔐 Connect Google Drive</div>
  <p>Videos will be uploaded to your Google Drive with shareable links.</p>
  <button id="gdrive-connect-first">Connect to Google Drive</button>
</div>
```

**Functions:**
```javascript
async function updateGDriveStatus() {
  // Updates connection status text and button states
}

async function updateGDriveUI() {
  // Shows/hides first-time prompt and error badge
}
```

---

### 4. File System Access API Integration
**Status:** Implemented
**Files:** popup.js

**Features:**
- Folder picker for Upload Img and Upload Vid tabs
- IndexedDB storage for folder handles
- Permission persistence
- Automatic folder rescanning
- Blob URL management (refresh on reopen to prevent expiration)
- Deleted file detection

**Implementation:**
```javascript
async function selectFolder(type) {
  const handle = await window.showDirectoryPicker();
  await saveFolderHandle(type === 'image' ? 'imageFolderHandle' : 'videoFolderHandle', handle);
  await scanFolder(handle, type);
}

async function scanFolder(folderHandle, type) {
  // Scan folder for files
  // Create blob URLs
  // Store in seenDownloads
  // Remove deleted files
}
```

---

### 5. Upload History System
**Status:** Implemented
**Files:** popup.js, popup.html

**Features:**
- History button (📜) in tab headers
- Persistent storage of upload history
- Separate history for images and videos
- Storage keys:
  - `imgUploadUrls` - Generated image URLs
  - `vidUploadUrls` - Generated video URLs
- Clear button to reset URLs
- URLs persist across sessions

---

### 6. Theme System
**Status:** Implemented
**Files:** popup.css, popup.js

**Features:**
- Light/Dark theme toggle (☀️)
- Per-tab theme buttons
- Theme persistence in localStorage
- CSS variables for easy theming

**CSS Variables:**
```css
body[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --text-primary: #ffffff;
  ...
}

body[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  ...
}
```

---

### 7. Enhanced Upload Img/Vid UI
**Status:** Implemented
**Files:** popup.html, popup.css, popup.js

**Features:**
- Drag-and-drop zones
- File list with checkboxes
- Folder scanning integration
- Progress bars
- Status indicators
- Empty state / Populated state views
- "Drop files to add more" functionality

---

### 8. Settings Panels
**Status:** Implemented
**Files:** popup.html, popup.css, popup.js

**Features:**
- Gear button (⚙️) in each tab header
- Collapsible settings panels
- Per-tab configuration:
  - Upload Img: Folder selection
  - Upload Vid: Folder selection + Google Drive

---

### 9. Backend Server
**Status:** Deployed to Railway
**Files:** backend/*

**Endpoints:**
- `GET /` - Health check
- `GET /auth/google/start` - Initialize OAuth
- `GET /oauth/callback` - OAuth callback
- `GET /auth/verify/:sessionId` - Verify session
- `POST /api/upload` - Upload file to Google Drive

**Features:**
- Session-based authentication
- In-memory session storage (Map)
- Google Drive API integration
- Automatic file sharing
- Rate limiting
- CORS for Chrome extensions

**Environment Variables:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `PORT`

**Deployment:**
- Platform: Railway.app
- URL: https://web-production-674b.up.railway.app
- Auto-deploys from GitHub: https://github.com/Trittton/linkcaster-backend

---

## 📝 File Changes Summary

### Modified Files:
1. **manifest.json**
   - Added `identity` permission for OAuth
   - Added `downloads` and `alarms` permissions
   - Added Google Drive host permissions

2. **background.js**
   - Added OAuth flow handler (`handleGoogleDriveOAuth`)
   - Added upload handler (`handleGoogleDriveUpload`)
   - Session verification logic
   - Backend URL configuration

3. **popup.html**
   - Completely restructured to tabs
   - Added Upload Img tab
   - Added Upload Vid tab
   - Google Drive UI components
   - Settings panels
   - History buttons
   - Theme toggles per tab

4. **popup.css**
   - Tab styles
   - Theme system with CSS variables
   - Google Drive component styles
   - Error badge animations
   - Folder config styles
   - Responsive layouts

5. **popup.js**
   - Tab switching logic
   - Google Drive OAuth handlers
   - File system API integration
   - Upload history management
   - Theme persistence
   - Folder scanning logic
   - Session management

### New Files:
1. **backend/** - Complete Node.js backend server
2. **GOOGLE_OAUTH_SETUP.md** - OAuth setup guide
3. **FEATURES_TRACKER.md** - Feature implementation tracker
4. **REMAINING_FEATURES.md** - Planned features

---

## 🐛 Known Issues Fixed

1. **Connection Persistence** - OAuth connection now persists across browser restarts
2. **Blob URL Expiration** - Automatic refresh of blob URLs when extension reopens
3. **OAuth Window Closure** - Proper detection of user cancellation vs. success
4. **Deleted Files** - Automatic removal from file list when rescanning
5. **Duplicate Uploads** - Removed prevention to allow re-uploading same files
6. **Progress Bar** - Fixed element IDs to work correctly

---

## 🎯 Attempted But Not Completed Features

### Feature 1: Move Upload Services to Settings (Convert Tab)
**Goal:** Hide upload service selector, show in settings panel
**Status:** Attempted, caused JavaScript errors
**Issue:** Duplicate variable declarations, missing null checks

### Feature 2: Add Google Drive to Convert Tab
**Status:** Not attempted (blocked by Feature 1)

### Feature 3: Add Google Drive to Upload Img Tab
**Status:** Not attempted

### Feature 4: Share Auth UI Across Tabs
**Status:** Partially done (auth storage is already shared)

---

## 🔧 Technical Patterns Established

1. **Settings Panel Pattern:**
   - Gear button in header
   - Collapsible panel
   - Per-tab configuration

2. **Google Drive Auth Pattern:**
   - Backend-based OAuth (not client-side)
   - Session-based token storage
   - Verification on reconnection

3. **File Handling Pattern:**
   - File System Access API
   - IndexedDB for handle persistence
   - Blob URL lifecycle management

4. **Storage Pattern:**
   - `chrome.storage.local` for persistence
   - Separate keys per feature/tab
   - Timestamp tracking for "ever connected" state

---

## 📊 Code Statistics

- **popup.js:** ~2200 lines (was ~800)
- **background.js:** ~600 lines (was ~400)
- **popup.html:** ~220 lines (was ~80)
- **popup.css:** ~1400 lines (was ~500)
- **backend/server.js:** ~350 lines (new)

---

## 🚀 Deployment Information

**Backend:**
- Repository: https://github.com/Trittton/linkcaster-backend
- Platform: Railway.app (Free tier)
- URL: https://web-production-674b.up.railway.app
- Auto-deploy: On git push to master

**Google Cloud:**
- Project: LinkCaster Extension
- OAuth Client: Web application
- Redirect URI: https://web-production-674b.up.railway.app/oauth/callback
- Scopes: `https://www.googleapis.com/auth/drive.file`

---

## 📚 Documentation Created

1. **GOOGLE_OAUTH_SETUP.md** - Step-by-step OAuth setup
2. **FEATURES_TRACKER.md** - Feature implementation tracking
3. **REMAINING_FEATURES.md** - Future features plan
4. **GDRIVE_UI_CHANGES.md** - UI improvement documentation

---

## 🎓 Lessons Learned

1. **Commit frequently** - Many changes were made without commits, making rollback difficult
2. **Test incrementally** - Adding multiple features at once made debugging hard
3. **Null checks critical** - Elements may not exist in all contexts, always check
4. **Syntax validation** - Run `node -c file.js` before testing to catch errors early
5. **Backup before major changes** - Created multiple `.backup` files for safety

---

## Next Steps for Clean Implementation

1. Revert to last git commit
2. Add features one at a time:
   - Feature: Multi-tab interface
   - Feature: Google Drive OAuth (backend + frontend)
   - Feature: File system integration
   - Feature: Upload history
   - Feature: Convert tab settings
   - Feature: Google Drive for all tabs
3. **Commit after each working feature**
4. **Test thoroughly before moving to next feature**
