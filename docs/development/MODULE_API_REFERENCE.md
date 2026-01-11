# LinkCaster - Module API Reference

Quick reference for all module APIs with usage examples.

---

## errorLogger.js

### Functions

#### `logInfo(message, context?)`
Log informational message.
```javascript
import { logInfo } from './modules/errorLogger.js';
await logInfo('File uploaded successfully', { fileName: 'image.png', size: 1024 });
```

#### `logWarning(message, context?)`
Log warning message.
```javascript
await logWarning('API key not configured', { service: 'vgy.me' });
```

#### `logErrorMessage(message, errorOrContext?)`
Log error message.
```javascript
try {
  await uploadFile();
} catch (error) {
  await logErrorMessage('Upload failed', error);
}
```

#### `logCritical(message, errorOrContext?)`
Log critical error.
```javascript
await logCritical('Database connection lost', error);
```

#### `withErrorLogging(fn, context)`
Wrap function with automatic error logging.
```javascript
const safeUpload = withErrorLogging(uploadToService, 'uploadToService');
await safeUpload(file);
```

---

## validator.js

### File Validation

#### `validateImageFile(file)`
```javascript
import { validateImageFile } from './modules/validator.js';

const result = validateImageFile(file);
if (!result.valid) {
  showStatus(result.error, 'error');
  return;
}
```

#### `validateVideoFile(file)`
```javascript
const result = validateVideoFile(file);
if (!result.valid) {
  alert(result.error);
}
```

### URL Validation

#### `isValidUrl(url)`
```javascript
if (!isValidUrl(userInput)) {
  showStatus('Invalid URL', 'error');
}
```

#### `extractValidUrls(text)`
```javascript
const urls = extractValidUrls(textArea.value);
console.log(`Found ${urls.length} valid URLs`);
```

### Sanitization

#### `sanitizeHtml(html)`
```javascript
import { sanitizeHtml } from './modules/validator.js';

const safeHtml = sanitizeHtml(userInput);
element.innerHTML = safeHtml;
```

#### `sanitizeFilename(filename)`
```javascript
const safeName = sanitizeFilename(file.name);
// "../../../etc/passwd" → "etc_passwd"
```

---

## uiHelpers.js

### Status Messages

#### `showStatus(message, type)`
```javascript
import { showStatus, StatusType } from './modules/uiHelpers.js';

showStatus('Upload successful!', StatusType.SUCCESS);
showStatus('Connection failed', StatusType.ERROR);
showStatus('Processing...', StatusType.INFO);
```

### Progress

#### `updateProgress(current, total, message, progressFill, progressText)`
```javascript
import { updateProgress } from './modules/uiHelpers.js';

for (let i = 0; i < files.length; i++) {
  updateProgress(i, files.length, `Processing ${i}/${files.length}`, fillEl, textEl);
  await processFile(files[i]);
}
```

### Clipboard

#### `copyToClipboard(text)`
```javascript
import { copyToClipboard } from './modules/uiHelpers.js';

const success = await copyToClipboard(outputText.value);
if (success) {
  showStatus('Copied!', StatusType.SUCCESS);
}
```

### Formatting

#### `formatFileSize(bytes)`
```javascript
import { formatFileSize } from './modules/uiHelpers.js';

console.log(formatFileSize(1024));      // "1.0 KB"
console.log(formatFileSize(1048576));   // "1.0 MB"
```

#### `formatDate(timestamp)`
```javascript
import { formatDate } from './modules/uiHelpers.js';

const dateStr = formatDate(Date.now());
// "Jan 11, 02:30 PM"
```

### Utilities

#### `debounce(func, wait)`
```javascript
import { debounce } from './modules/uiHelpers.js';

const debouncedSave = debounce(() => {
  chrome.storage.local.set({ inputText: input.value });
}, 500);

input.addEventListener('input', debouncedSave);
```

---

## storage.js

### Chrome Storage

#### `getStorage(keys, area?)`
```javascript
import { getStorage } from './modules/storage.js';

// Get from local storage
const data = await getStorage(['inputText', 'theme']);
console.log(data.inputText);

// Get from sync storage
const syncData = await getStorage(['apiKey'], 'sync');
```

#### `setStorage(data, area?)`
```javascript
import { setStorage } from './modules/storage.js';

// Save to local storage
await setStorage({ inputText: 'hello', theme: 'dark' });

// Save to sync storage
await setStorage({ apiKey: 'key123' }, 'sync');
```

### IndexedDB

#### `saveFolderHandle(key, handle)`
```javascript
import { saveFolderHandle } from './modules/storage.js';

const handle = await window.showDirectoryPicker();
await saveFolderHandle('imageFolderHandle', handle);
```

#### `getFolderHandle(key)`
```javascript
const handle = await getFolderHandle('imageFolderHandle');
if (handle) {
  const files = await scanFolder(handle, 'image', 20, new Set());
}
```

### History

#### `addToHistory(historyKey, item, maxItems?)`
```javascript
import { addToHistory } from './modules/storage.js';

await addToHistory('videoUploadHistory', {
  fileName: 'video.mp4',
  url: 'https://drive.google.com/...',
  timestamp: Date.now()
});
```

#### `getHistory(historyKey)`
```javascript
const history = await getHistory('videoUploadHistory');
renderHistoryList(history);
```

---

## fileMonitoring.js

### Folder Scanning

#### `scanFolder(folderHandle, fileType, timeFilterMinutes, uploadedFiles)`
```javascript
import { scanFolder } from './modules/fileMonitoring.js';

const uploadedFiles = new Set(['image1.png', 'image2.jpg']);
const files = await scanFolder(folderHandle, 'image', 20, uploadedFiles);

files.forEach(fileInfo => {
  console.log(`${fileInfo.name} - ${fileInfo.size} bytes`);
  console.log(`Uploaded: ${fileInfo.uploaded}`);
});
```

### Permissions

#### `checkFolderPermission(folderHandle)`
```javascript
import { checkFolderPermission } from './modules/fileMonitoring.js';

const hasPermission = await checkFolderPermission(folderHandle);
if (!hasPermission) {
  showStatus('Permission expired. Please select folder again.', 'error');
}
```

#### `requestFolderPermission(folderHandle)`
```javascript
const granted = await requestFolderPermission(folderHandle);
if (granted) {
  await scanFolder(folderHandle, 'image', 20, new Set());
}
```

---

## uploadServices.js

### Image Processing

#### `downloadImage(url)`
```javascript
import { downloadImage } from './modules/uploadServices.js';

const blob = await downloadImage('https://example.com/image.jpg');
console.log(`Downloaded ${blob.size} bytes`);
```

#### `getDirectImageUrl(url)`
```javascript
// Handles Lightshot pages
const directUrl = await getDirectImageUrl('https://prnt.sc/abc123');
// Returns: https://image.prntscr.com/...
```

### Upload Functions

#### `uploadToCatbox(file)`
```javascript
import { uploadToCatbox } from './modules/uploadServices.js';

const url = await uploadToCatbox(imageBlob);
console.log(`Uploaded to: ${url}`);
```

#### `uploadToGoogleDrive(file, sessionId)`
```javascript
import { uploadToGoogleDrive } from './modules/uploadServices.js';
import { getStorage } from './modules/storage.js';

const { googleDriveSessionId } = await getStorage(['googleDriveSessionId']);
const url = await uploadToGoogleDrive(videoFile, googleDriveSessionId);
```

#### `uploadToVgy(file, userKey)`
```javascript
const { vgyApiKey } = await getStorage(['vgyApiKey'], 'sync');
const url = await uploadToVgy(imageBlob, vgyApiKey);
```

---

## convertTab.js

### Initialization

#### `initConvertTab(elements)`
```javascript
import { initConvertTab } from './modules/convertTab.js';

const elements = {
  inputText: document.getElementById('input-text'),
  outputText: document.getElementById('output-text'),
  replaceBtn: document.getElementById('replace-btn'),
  clearBtn: document.getElementById('clear-btn'),
  copyBtn: document.getElementById('copy-btn'),
  hostSelect: document.getElementById('host-select'),
  // ... etc
};

await initConvertTab(elements);
```

### UI Updates

#### `updateApiUI(elements)`
```javascript
import { updateApiUI } from './modules/convertTab.js';

// Call when host service changes
hostSelect.addEventListener('change', () => {
  updateApiUI(elements);
});
```

---

## Common Patterns

### Complete Upload Flow
```javascript
import { validateImageFile } from './modules/validator.js';
import { uploadToCatbox } from './modules/uploadServices.js';
import { addToHistory } from './modules/storage.js';
import { showStatus, StatusType } from './modules/uiHelpers.js';
import { logInfo, logErrorMessage } from './modules/errorLogger.js';

async function handleUpload(file) {
  // 1. Validate
  const validation = validateImageFile(file);
  if (!validation.valid) {
    showStatus(validation.error, StatusType.ERROR);
    return;
  }

  // 2. Upload
  try {
    const url = await uploadToCatbox(file);

    // 3. Add to history
    await addToHistory('imageUploadHistory', {
      fileName: file.name,
      url: url,
      timestamp: Date.now()
    });

    // 4. Show success
    showStatus('Upload successful!', StatusType.SUCCESS);
    await logInfo('Image uploaded', { fileName: file.name, url });

    return url;
  } catch (error) {
    await logErrorMessage('Upload failed', error);
    showStatus(`Upload failed: ${error.message}`, StatusType.ERROR);
  }
}
```

### Complete Folder Monitoring Flow
```javascript
import { getFolderHandle, saveFolderHandle } from './modules/storage.js';
import { scanFolder, checkFolderPermission } from './modules/fileMonitoring.js';
import { createFileItemHtml } from './modules/uiHelpers.js';

async function setupFolderMonitoring() {
  // 1. Get saved folder handle
  let folderHandle = await getFolderHandle('imageFolderHandle');

  // 2. Check permission
  if (folderHandle) {
    const hasPermission = await checkFolderPermission(folderHandle);
    if (!hasPermission) {
      // Need to re-select folder
      folderHandle = await window.showDirectoryPicker();
      await saveFolderHandle('imageFolderHandle', folderHandle);
    }
  } else {
    // First time - select folder
    folderHandle = await window.showDirectoryPicker();
    await saveFolderHandle('imageFolderHandle', folderHandle);
  }

  // 3. Scan for files
  const uploadedFiles = new Set(); // Track uploaded files
  const files = await scanFolder(folderHandle, 'image', 20, uploadedFiles);

  // 4. Render files
  const html = files.map(f => createFileItemHtml(f)).join('');
  document.getElementById('file-list').innerHTML = html;
}
```

---

## Error Handling Pattern

All modules use consistent error handling:

```javascript
import { logErrorMessage, withErrorLogging } from './modules/errorLogger.js';

// Pattern 1: Try-catch with logging
async function myFunction() {
  try {
    // ... code
  } catch (error) {
    await logErrorMessage('Operation failed', error);
    throw error; // Re-throw if caller needs to handle
  }
}

// Pattern 2: Wrapped function
const safeFunction = withErrorLogging(async () => {
  // ... code
}, 'functionName');

await safeFunction();
```

---

## Import Patterns

### Single Import
```javascript
import { logInfo } from './modules/errorLogger.js';
```

### Multiple Imports
```javascript
import {
  showStatus,
  updateProgress,
  copyToClipboard,
  StatusType
} from './modules/uiHelpers.js';
```

### Import Everything
```javascript
import * as storage from './modules/storage.js';

await storage.setStorage({ key: 'value' });
const data = await storage.getStorage(['key']);
```

---

## TypeScript Type Hints (JSDoc)

All functions have JSDoc with type information for IDE autocomplete:

```javascript
/**
 * Uploads file to service
 * @param {File} file - File to upload
 * @param {string} sessionId - Session ID
 * @returns {Promise<string>} Uploaded URL
 * @throws {Error} When upload fails
 */
async function uploadFile(file, sessionId) {
  // Implementation
}
```

This enables:
- ✅ Autocomplete in VS Code
- ✅ Type checking
- ✅ Inline documentation
- ✅ Parameter hints

---

## Quick Start Template

For creating new modules:

```javascript
/**
 * My Module
 * Description of what this module does
 * @module myModule
 */

import { logInfo, logErrorMessage } from './errorLogger.js';
import { showStatus, StatusType } from './uiHelpers.js';

/**
 * Initializes the module
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function initMyModule(elements) {
  await logInfo('My module initializing');

  try {
    // Setup code here
    setupEventListeners(elements);

    await logInfo('My module initialized successfully');
  } catch (error) {
    await logErrorMessage('Failed to initialize module', error);
    showStatus('Initialization failed', StatusType.ERROR);
  }
}

/**
 * Sets up event listeners
 * @param {Object} elements - DOM elements
 * @returns {void}
 */
function setupEventListeners(elements) {
  // Event listener setup
}

/**
 * Handles some action
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleSomeAction(elements) {
  try {
    // Action logic

    showStatus('Action completed', StatusType.SUCCESS);
    await logInfo('Action completed successfully');
  } catch (error) {
    await logErrorMessage('Action failed', error);
    showStatus('Action failed', StatusType.ERROR);
  }
}
```

This template provides consistent structure across all modules.
