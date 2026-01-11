# LinkCaster - Module Architecture

## Module Dependency Graph

```
popup.js (main entry point)
    │
    ├─→ theme.js
    │       └─→ storage.js
    │
    ├─→ tabs.js
    │       └─→ storage.js
    │
    ├─→ convertTab.js
    │       ├─→ errorLogger.js
    │       ├─→ validator.js
    │       ├─→ uiHelpers.js
    │       ├─→ storage.js
    │       └─→ uploadServices.js
    │               ├─→ errorLogger.js
    │               ├─→ validator.js
    │               └─→ storage.js
    │
    ├─→ uploadImageTab.js
    │       ├─→ errorLogger.js
    │       ├─→ validator.js
    │       ├─→ uiHelpers.js
    │       ├─→ storage.js
    │       ├─→ fileMonitoring.js
    │       │       ├─→ errorLogger.js
    │       │       └─→ validator.js
    │       └─→ uploadServices.js
    │
    └─→ uploadVideoTab.js
            ├─→ errorLogger.js
            ├─→ validator.js
            ├─→ uiHelpers.js
            ├─→ storage.js
            ├─→ fileMonitoring.js
            └─→ uploadServices.js
```

## Module Layers

### Layer 1: Foundation (No Dependencies)
These modules have no internal dependencies and can be used anywhere:

```
┌─────────────────┐
│  errorLogger.js │  ← Core error handling
└─────────────────┘

┌─────────────────┐
│  validator.js   │  ← Input validation & sanitization
└─────────────────┘
```

### Layer 2: Infrastructure (Depends on Layer 1)
These modules depend only on foundation modules:

```
┌─────────────────┐
│  uiHelpers.js   │  ← UI utilities
│  └─→ validator  │
└─────────────────┘

┌─────────────────┐
│  storage.js     │  ← Storage abstractions
│  └─→ errorLog   │
└─────────────────┘
```

### Layer 3: Specialized (Depends on Layers 1-2)
These modules provide specific functionality:

```
┌──────────────────────┐
│  fileMonitoring.js   │  ← Folder monitoring
│  ├─→ errorLogger     │
│  └─→ validator       │
└──────────────────────┘

┌──────────────────────┐
│  uploadServices.js   │  ← Cloud uploads
│  ├─→ errorLogger     │
│  ├─→ validator       │
│  └─→ storage         │
└──────────────────────┘
```

### Layer 4: Features (Depends on Layers 1-3)
These modules implement specific UI tabs:

```
┌──────────────────────┐
│  convertTab.js       │  ← Convert tab logic
│  ├─→ errorLogger     │
│  ├─→ validator       │
│  ├─→ uiHelpers       │
│  ├─→ storage         │
│  └─→ uploadServices  │
└──────────────────────┘

┌──────────────────────┐
│  uploadImageTab.js   │  ← Upload image logic
│  ├─→ errorLogger     │
│  ├─→ validator       │
│  ├─→ uiHelpers       │
│  ├─→ storage         │
│  ├─→ fileMonitoring  │
│  └─→ uploadServices  │
└──────────────────────┘

┌──────────────────────┐
│  uploadVideoTab.js   │  ← Upload video logic
│  ├─→ errorLogger     │
│  ├─→ validator       │
│  ├─→ uiHelpers       │
│  ├─→ storage         │
│  ├─→ fileMonitoring  │
│  └─→ uploadServices  │
└──────────────────────┘
```

### Layer 5: Utilities (Depends on Layer 2)
Simple utility modules:

```
┌──────────────────────┐
│  theme.js            │  ← Theme management
│  └─→ storage         │
└──────────────────────┘

┌──────────────────────┐
│  tabs.js             │  ← Tab switching
│  └─→ storage         │
└──────────────────────┘
```

### Layer 6: Application (Entry Point)
The main application file that coordinates everything:

```
┌──────────────────────┐
│  popup.js            │  ← Main entry point
│  ├─→ theme           │
│  ├─→ tabs            │
│  ├─→ convertTab      │
│  ├─→ uploadImageTab  │
│  └─→ uploadVideoTab  │
└──────────────────────┘
```

## Data Flow

### Upload Flow
```
User Action
    │
    ▼
uploadImageTab.js
    │
    ├─→ validateImageFile() ────→ validator.js
    │
    ├─→ uploadToCatbox() ───────→ uploadServices.js
    │       │
    │       ├─→ logInfo() ──────→ errorLogger.js
    │       └─→ sanitize() ─────→ validator.js
    │
    ├─→ addToHistory() ─────────→ storage.js
    │
    └─→ showStatus() ───────────→ uiHelpers.js
```

### Convert Flow
```
User Action
    │
    ▼
convertTab.js
    │
    ├─→ extractValidUrls() ─────→ validator.js
    │
    ├─→ downloadImage() ────────→ uploadServices.js
    │       │
    │       └─→ logInfo() ──────→ errorLogger.js
    │
    ├─→ uploadToService() ──────→ uploadServices.js
    │
    ├─→ updateProgress() ───────→ uiHelpers.js
    │
    └─→ setStorage() ───────────→ storage.js
```

### File Monitoring Flow
```
User Selects Folder
    │
    ▼
uploadImageTab.js
    │
    ├─→ saveFolderHandle() ─────→ storage.js (IndexedDB)
    │
    ├─→ scanFolder() ───────────→ fileMonitoring.js
    │       │
    │       ├─→ checkPermission()
    │       └─→ logWarning() ───→ errorLogger.js
    │
    └─→ renderFileList() ───────→ uiHelpers.js
            │
            └─→ sanitizeHtml() ─→ validator.js
```

## Module Responsibilities

### errorLogger.js
**Purpose**: Centralized error handling and logging
**Responsibilities**:
- Log errors with severity levels
- Store error history
- Provide error wrapping utilities
- Console integration
**Used By**: All modules

### validator.js
**Purpose**: Input validation and security
**Responsibilities**:
- Validate file sizes and types
- Validate URLs
- Sanitize HTML and filenames
- Extract and validate URLs from text
**Used By**: All feature modules

### uiHelpers.js
**Purpose**: UI utilities and presentation
**Responsibilities**:
- Status messages
- Progress bars
- Format dates and sizes
- Generate HTML safely
- Clipboard operations
**Used By**: All feature modules

### storage.js
**Purpose**: Data persistence abstraction
**Responsibilities**:
- Chrome storage wrapper
- IndexedDB for folder handles
- History management
- Error handling
**Used By**: All feature modules, theme, tabs

### fileMonitoring.js
**Purpose**: Folder monitoring and file detection
**Responsibilities**:
- Scan folders for files
- Check/request permissions
- Filter files by type and time
- Track upload status
**Used By**: uploadImageTab, uploadVideoTab

### uploadServices.js
**Purpose**: Cloud upload implementations
**Responsibilities**:
- Upload to 7 different services
- Download images
- Convert blob/base64
- Handle Lightshot pages
- Service-specific error handling
**Used By**: convertTab, uploadImageTab, uploadVideoTab

### convertTab.js
**Purpose**: Link conversion feature
**Responsibilities**:
- Service selection and configuration
- URL extraction and processing
- Progress tracking
- Result display
**Used By**: popup.js

### uploadImageTab.js (To be created)
**Purpose**: Image upload feature
**Responsibilities**:
- File selection (manual + monitored)
- Service selection (Catbox, Imgur, Google Drive)
- Batch upload
- History management
**Used By**: popup.js

### uploadVideoTab.js (To be created)
**Purpose**: Video upload feature
**Responsibilities**:
- Google Drive OAuth
- File selection (manual + monitored)
- Upload with progress
- History management
**Used By**: popup.js

### theme.js (To be created)
**Purpose**: Theme management
**Responsibilities**:
- Toggle dark/light theme
- Persist theme preference
- Apply theme CSS
**Used By**: popup.js

### tabs.js (To be created)
**Purpose**: Tab navigation
**Responsibilities**:
- Tab switching
- Persist active tab
- Show/hide content
**Used By**: popup.js

### popup.js (To be created)
**Purpose**: Application entry point
**Responsibilities**:
- Initialize all modules
- Wire up DOM elements
- Handle global events
- Coordinate modules
**Used By**: popup.html

## Communication Patterns

### Module → Module (Direct Import)
```javascript
// uploadImageTab.js imports uploadServices
import { uploadToCatbox } from './uploadServices.js';
const url = await uploadToCatbox(file);
```

### Module → Chrome API
```javascript
// storage.js wraps Chrome API
export async function getStorage(keys, area = 'local') {
  const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
  return await storage.get(keys);
}
```

### Module → Background Script (Message Passing)
```javascript
// uploadServices.js → background.js
const response = await chrome.runtime.sendMessage({
  action: 'googleDriveUpload',
  fileData: base64Data,
  fileName: filename,
  sessionId: sessionId
});
```

### Module → DOM (Via Parameters)
```javascript
// uiHelpers.js updates DOM elements passed as parameters
export function updateProgress(current, total, message, progressFill, progressText) {
  progressFill.style.width = `${(current/total) * 100}%`;
  progressText.textContent = message;
}
```

## Error Propagation

```
User Action
    │
    ▼
Feature Module (e.g., uploadImageTab)
    │
    ├─→ try-catch block
    │   │
    │   ▼
    │   Service Module (e.g., uploadServices)
    │       │
    │       ├─→ withErrorLogging wrapper
    │       │   │
    │       │   ▼
    │       │   errorLogger.js
    │       │   ├─→ Log to console
    │       │   └─→ Store in Chrome storage
    │       │
    │       └─→ Throw error
    │
    ├─→ Catch error
    ├─→ Log with logErrorMessage()
    └─→ Show user-friendly message via showStatus()
```

## Testing Strategy

### Unit Testing (Per Module)
```
errorLogger.js    → Test logging functions
validator.js      → Test validation rules
uiHelpers.js      → Test formatting functions
storage.js        → Mock Chrome API, test wrappers
fileMonitoring.js → Mock FileSystem API
uploadServices.js → Mock fetch, test each service
```

### Integration Testing (Module Combinations)
```
convertTab + uploadServices + validator
uploadImageTab + fileMonitoring + storage
uploadVideoTab + uploadServices + errorLogger
```

### End-to-End Testing (Full Flow)
```
User uploads image → File validation → Upload → History → Status message
User converts link → URL extraction → Download → Upload → Progress → Result
```

## Performance Considerations

### Lazy Loading
```javascript
// Only import what's needed for current tab
if (currentTab === 'convert') {
  const { initConvertTab } = await import('./modules/convertTab.js');
  await initConvertTab(elements);
}
```

### Debouncing
```javascript
// Auto-save with debounce to reduce storage writes
const debouncedSave = debounce(() => {
  setStorage({ inputText: input.value });
}, 500);
```

### Caching
```javascript
// Cache folder handles in memory
let cachedFolderHandle = null;
async function getFolderHandleWithCache(key) {
  if (!cachedFolderHandle) {
    cachedFolderHandle = await getFolderHandle(key);
  }
  return cachedFolderHandle;
}
```

## Security Boundaries

```
User Input
    │
    ▼
┌────────────────────┐
│   validator.js     │ ← First line of defense
│   - Size limits    │
│   - Type whitelist │
│   - URL validation │
│   - HTML sanitize  │
└────────────────────┘
    │
    ▼
Feature Modules
    │
    ▼
Upload Services → External APIs
```

## Future Extensibility

### Adding New Upload Service
1. Add function to `uploadServices.js`
2. Add option to service dropdowns
3. Update `convertTab.js` switch statement
4. Add validation in `validateServiceRequirements()`

### Adding New Tab
1. Create new module (e.g., `settingsTab.js`)
2. Import in `popup.js`
3. Add tab button in HTML
4. Call `initSettingsTab()` in main init function

### Adding New Validation Rule
1. Add function to `validator.js`
2. Use in relevant feature modules
3. Update tests

This modular architecture makes all these extensions straightforward!
