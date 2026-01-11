# LinkCaster - Refactoring Guide

## Overview

This document provides guidance for completing the modular refactoring of LinkCaster. The original 2,252-line `popup.js` has been split into focused modules with proper JSDoc documentation, input validation, and error logging.

## Completed Modules

### Core Infrastructure (✅ Complete)

1. **errorLogger.js** (155 lines)
   - Centralized error logging with severity levels
   - Persistent error storage in Chrome storage
   - Error wrapping utilities
   - Functions: `logError()`, `logInfo()`, `logWarning()`, `logErrorMessage()`, `logCritical()`, `getErrorLogs()`, `clearErrorLogs()`, `withErrorLogging()`

2. **validator.js** (230 lines)
   - Input validation and sanitization
   - File size and type validation
   - URL validation and extraction
   - XSS prevention utilities
   - Functions: `isValidUrl()`, `isValidImageUrl()`, `validateFile()`, `validateImageFile()`, `validateVideoFile()`, `sanitizeHtml()`, `sanitizeFilename()`, `isValidApiKey()`, `extractValidUrls()`

3. **uiHelpers.js** (220 lines)
   - UI update utilities
   - Status messages and progress bars
   - Theme management
   - Clipboard operations
   - Functions: `showStatus()`, `updateProgress()`, `updateThemeIcon()`, `copyToClipboard()`, `formatDate()`, `formatFileSize()`, `createHistoryItemHtml()`, `createFileItemHtml()`, `debounce()`

4. **storage.js** (160 lines)
   - Chrome storage abstractions
   - IndexedDB utilities for folder handles
   - History management
   - Functions: `getStorage()`, `setStorage()`, `removeStorage()`, `openDB()`, `saveFolderHandle()`, `getFolderHandle()`, `addToHistory()`, `getHistory()`, `clearHistory()`

5. **fileMonitoring.js** (95 lines)
   - Folder scanning and monitoring
   - Permission management
   - File filtering by type and time
   - Functions: `scanFolder()`, `requestFolderPermission()`, `checkFolderPermission()`

6. **uploadServices.js** (360 lines)
   - Upload implementations for all services
   - Image download and conversion
   - Service-specific error handling
   - Functions: `blobToBase64()`, `downloadImage()`, `getDirectImageUrl()`, `uploadToCatbox()`, `uploadToFreeImage()`, `uploadToVgy()`, `uploadToGyazo()`, `uploadToGoogleDrive()`, `uploadToFlickr()`

7. **convertTab.js** (380 lines - partial)
   - Convert tab initialization and logic
   - Service validation
   - URL processing pipeline
   - Functions: `initConvertTab()`, `updateApiUI()`, `handleReplace()`, `processUrls()`, `validateServiceRequirements()`

## Remaining Work

### High Priority

#### 1. Complete Convert Tab Module
**File**: `js/modules/convertTab.js`
**Tasks**:
- Connect `processUrl()` function to upload services
- Implement Google Drive status updates
- Add OAuth handling for Flickr/Gyazo
- Integrate with storage module for settings

**Code to add**:
```javascript
import {
  uploadToCatbox,
  uploadToFreeImage,
  uploadToVgy,
  uploadToGyazo,
  uploadToGoogleDrive,
  uploadToFlickr,
  downloadImage,
  getDirectImageUrl
} from './uploadServices.js';

async function processUrl(url, host) {
  const imageUrl = await getDirectImageUrl(url);
  const imageBlob = await downloadImage(imageUrl);

  let newUrl;
  switch (host) {
    case 'catbox':
      newUrl = await uploadToCatbox(imageBlob);
      break;
    case 'freeimage':
      newUrl = await uploadToFreeImage(imageBlob);
      break;
    case 'vgy':
      const vgyData = await getStorage(['vgyApiKey'], 'sync');
      newUrl = await uploadToVgy(imageBlob, vgyData.vgyApiKey);
      break;
    case 'gyazo':
      const gyazoData = await getStorage(['gyazoAccessToken'], 'sync');
      newUrl = await uploadToGyazo(imageBlob, gyazoData.gyazoAccessToken);
      break;
    case 'flickr':
      const flickrData = await getStorage(['flickrOAuthToken', 'flickrOAuthTokenSecret'], 'sync');
      newUrl = await uploadToFlickr(imageBlob, flickrData.flickrOAuthToken, flickrData.flickrOAuthTokenSecret);
      break;
    case 'gdrive':
      const gdriveData = await getStorage(['googleDriveSessionId']);
      newUrl = await uploadToGoogleDrive(imageBlob, gdriveData.googleDriveSessionId);
      break;
  }

  return {
    original: url,
    new: newUrl,
    success: true
  };
}
```

#### 2. Create Upload Image Tab Module
**File**: `js/modules/uploadImageTab.js` (target: ~450 lines)
**Responsibilities**:
- Image upload UI management
- Service selection (Catbox, Imgur, Google Drive)
- File input and detected files handling
- Upload history rendering
- Settings panel management

**Key functions needed**:
```javascript
export async function initUploadImageTab(elements)
export async function handleUploadImages(elements)
export async function updateImageGDriveStatus(elements)
export async function renderImageHistory()
async function handleServiceChange(elements)
async function handleSettingsToggle(elements)
```

#### 3. Create Upload Video Tab Module
**File**: `js/modules/uploadVideoTab.js` (target: ~400 lines)
**Responsibilities**:
- Video upload to Google Drive
- Connection status management
- Video file handling
- Upload history rendering
- First-time connection prompt

**Key functions needed**:
```javascript
export async function initUploadVideoTab(elements)
export async function handleVideoUpload(elements)
export async function updateGDriveUI(elements)
export async function handleGDriveConnect()
export async function renderVideoHistory()
```

#### 4. Create Theme Module
**File**: `js/modules/theme.js` (target: ~80 lines)
**Responsibilities**:
- Theme switching (dark/light)
- Theme persistence
- Theme initialization

**Key functions needed**:
```javascript
export async function initTheme()
export async function toggleTheme()
export function applyTheme(theme)
```

#### 5. Create Tabs Module
**File**: `js/modules/tabs.js` (target: ~100 lines)
**Responsibilities**:
- Tab switching logic
- Tab state persistence
- Tab content visibility management

**Key functions needed**:
```javascript
export function initTabs(tabButtons, tabContents)
export function switchTab(tabName)
export async function loadLastActiveTab()
```

#### 6. Create Main Entry Point
**File**: `js/popup.js` (target: ~200 lines)
**Responsibilities**:
- Initialize all modules
- Wire up DOM elements
- Handle global events
- Coordinate between modules

**Structure**:
```javascript
import { initTheme, toggleTheme } from './modules/theme.js';
import { initTabs } from './modules/tabs.js';
import { initConvertTab } from './modules/convertTab.js';
import { initUploadImageTab } from './modules/uploadImageTab.js';
import { initUploadVideoTab } from './modules/uploadVideoTab.js';
import { logInfo } from './modules/errorLogger.js';

/**
 * Initialize all DOM element references
 */
function getDOMElements() {
  return {
    // Theme
    themeToggle: document.getElementById('theme-toggle'),

    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Convert Tab
    convertTab: {
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-btn'),
      // ... all other convert tab elements
    },

    // Upload Image Tab
    uploadImageTab: {
      serviceSelect: document.getElementById('image-service-select'),
      fileInput: document.getElementById('image-file-input'),
      // ... all other upload image elements
    },

    // Upload Video Tab
    uploadVideoTab: {
      fileInput: document.getElementById('video-file-input'),
      gdriveConnect: document.getElementById('gdrive-connect'),
      // ... all other upload video elements
    }
  };
}

/**
 * Main initialization function
 */
async function init() {
  await logInfo('LinkCaster popup initializing');

  const elements = getDOMElements();

  // Initialize modules
  await initTheme();
  await initTabs(elements.tabButtons, elements.tabContents);
  await initConvertTab(elements.convertTab);
  await initUploadImageTab(elements.uploadImageTab);
  await initUploadVideoTab(elements.uploadVideoTab);

  // Setup global event listeners
  elements.themeToggle.addEventListener('click', toggleTheme);

  // Listen for storage changes from other tabs/windows
  chrome.storage.onChanged.addListener(handleStorageChange);

  await logInfo('LinkCaster popup initialized successfully');
}

/**
 * Handle storage changes from other instances
 */
function handleStorageChange(changes, areaName) {
  if (areaName === 'local' && (changes.googleDriveConnected || changes.googleDriveSessionId)) {
    // Update all Google Drive status displays
    // Delegate to respective modules
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

### Medium Priority

#### 7. Update HTML for Module Scripts
**File**: `popup.html`
**Changes**:
```html
<!-- Change from regular script to module -->
<script src="js/popup.js" type="module"></script>
```

#### 8. Update Manifest for ES6 Modules
**File**: `manifest.json`
**Note**: Chrome extensions support ES6 modules natively in popup scripts. No changes needed to manifest.json.

#### 9. Create Constants Module
**File**: `js/modules/constants.js` (target: ~50 lines)
**Purpose**: Centralize all constants

```javascript
/**
 * Constants Module
 * Centralized constants for the extension
 * @module constants
 */

export const API_ENDPOINTS = {
  CATBOX: 'https://catbox.moe/user/api.php',
  FREEIMAGE: 'https://freeimage.host/api/1/upload',
  VGY: 'https://vgy.me/upload',
  GYAZO: 'https://upload.gyazo.com/api/upload',
  BACKEND: 'https://web-production-674b.up.railway.app'
};

export const FILE_LIMITS = {
  MAX_IMAGE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_VIDEO_SIZE: 500 * 1024 * 1024, // 500MB
  MAX_HISTORY_ITEMS: 50
};

export const STORAGE_KEYS = {
  INPUT_TEXT: 'inputText',
  OUTPUT_TEXT: 'outputText',
  CURRENT_TAB: 'currentTab',
  THEME: 'theme',
  SELECTED_HOST: 'selectedHost',
  IMAGE_UPLOAD_SERVICE: 'imageUploadService',
  VIDEO_UPLOAD_HISTORY: 'videoUploadHistory',
  IMAGE_UPLOAD_HISTORY: 'imageUploadHistory',
  GDRIVE_SESSION_ID: 'googleDriveSessionId',
  GDRIVE_CONNECTED: 'googleDriveConnected'
};
```

## Testing Checklist

After completing the refactoring, test all functionality:

### Convert Tab
- [ ] Paste links and convert to Catbox
- [ ] Paste links and convert to FreeImage
- [ ] Paste links and convert to vgy.me (with API key)
- [ ] Paste links and convert to Google Drive (with OAuth)
- [ ] Paste links and convert to Flickr (with OAuth)
- [ ] Paste links and convert to Gyazo (with token)
- [ ] Handle Lightshot links correctly
- [ ] Show proper error messages for invalid links
- [ ] Progress bar updates correctly
- [ ] Copy to clipboard works
- [ ] Clear button works
- [ ] Settings persistence works

### Upload Image Tab
- [ ] Upload images to Catbox
- [ ] Upload images to Google Drive
- [ ] Select folder and detect new images
- [ ] Time filter works correctly
- [ ] Checkbox selection works
- [ ] Upload history displays correctly
- [ ] Copy links from history
- [ ] Clear history works
- [ ] Settings panel toggle works

### Upload Video Tab
- [ ] Connect to Google Drive
- [ ] Upload video files
- [ ] Select folder and detect new videos
- [ ] Time filter works correctly
- [ ] Upload history displays correctly
- [ ] Disconnect from Google Drive
- [ ] First-time prompt shows/hides correctly

### General
- [ ] Theme switching works
- [ ] Tab switching works
- [ ] State persists across popup closes
- [ ] Error logging captures errors
- [ ] No console errors
- [ ] All file size validations work
- [ ] All input sanitization works

## File Size Summary

| Module | Lines | Status |
|--------|-------|--------|
| errorLogger.js | 155 | ✅ Complete |
| validator.js | 230 | ✅ Complete |
| uiHelpers.js | 220 | ✅ Complete |
| storage.js | 160 | ✅ Complete |
| fileMonitoring.js | 95 | ✅ Complete |
| uploadServices.js | 360 | ✅ Complete |
| convertTab.js | 380 | 🟡 Partial |
| uploadImageTab.js | ~450 | ⚪ Not started |
| uploadVideoTab.js | ~400 | ⚪ Not started |
| theme.js | ~80 | ⚪ Not started |
| tabs.js | ~100 | ⚪ Not started |
| constants.js | ~50 | ⚪ Not started |
| popup.js (main) | ~200 | ⚪ Not started |
| **Total** | **~2,880** | **~45% Complete** |

Original popup.js was 2,252 lines. The modular version is slightly larger due to:
- Comprehensive JSDoc comments (~15% overhead)
- Error logging integration (~10% overhead)
- Input validation (~10% overhead)
- Better code organization and readability

## Benefits of Modular Structure

1. **Maintainability**: Each module has a single, clear responsibility
2. **Testability**: Modules can be tested in isolation
3. **Reusability**: Functions can be imported where needed
4. **Debugging**: Error logging pinpoints exact module/function
5. **Documentation**: JSDoc provides inline API documentation
6. **Security**: Centralized input validation and sanitization
7. **Collaboration**: Multiple developers can work on different modules

## Next Steps

1. ✅ Complete convertTab.js implementation
2. Create uploadImageTab.js module
3. Create uploadVideoTab.js module
4. Create theme.js module
5. Create tabs.js module
6. Create constants.js module
7. Create main popup.js entry point
8. Update popup.html to use module script
9. Test all functionality
10. Backup original popup.js
11. Replace with modular version
12. Final testing

## Rollback Plan

If issues arise:
1. Original popup.js is preserved
2. Revert popup.html to use original script
3. Remove js/modules directory
4. Test with original code
5. Debug modular issues separately

## Migration Strategy

**Recommended Approach**: Incremental migration
1. Keep original popup.js functional
2. Build modular version alongside
3. Test modular version thoroughly
4. Switch when confident
5. Monitor for issues
6. Keep original as backup for 1-2 releases
