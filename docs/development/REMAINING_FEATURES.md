# Remaining Features Implementation Plan

## Issue #3: OAuth Window Size
**Status:** Chrome API Limitation
**Notes:** `chrome.identity.launchWebAuthFlow()` doesn't support size parameters. Possible workaround would require using `chrome.windows.create()` and manually handling OAuth, which is significantly more complex.
**Recommendation:** Accept current window size (Chrome default)

## Issue #4: Hide Upload Services in Settings (Convert Tab)
**Current:** Upload service buttons (Catbox, Imgur, etc.) prominently displayed
**Needed:** Move to settings panel (gear button)

### Implementation:
1. Add `service-settings` section inside `folder-config-convert` (hidden by default)
2. Show current selected service in main UI
3. Click gear to change service

## Issue #5: Add Google Drive to Convert & Upload Img
**Current:** Only Upload Vid tab has Google Drive
**Needed:** All tabs should support Google Drive upload

### Implementation:
1. Add "Google Drive" as upload service option
2. Show Google Drive connect button only when Google Drive is selected
3. Use same auth session across all tabs (already stored globally)

## Issue #6: Share Google Drive Auth Across Tabs
**Current:** Auth is already global (chrome.storage.local)
**Needed:** UI to show connection status in all tabs

### Implementation:
1. Check Google Drive connection status in Convert and Upload Img tabs
2. Show connect prompt if Google Drive selected but not connected
3. Reuse existing `updateGDriveUI()` function

## Proposed UI Changes

### Convert Tab:
```
Header: [Convert] [⚙️ Settings] [📜 History] [☀️ Theme]

Settings Panel (hidden, shown on gear click):
  - Upload Service: [Dropdown: Catbox | Imgur | Flickr | Gyazo | Google Drive]
  - [If Google Drive selected]:
    - Google Drive: ✓ Connected | Not Connected
    - [Connect/Reconnect Button]

Main UI:
  - Current Service: Google Drive
  - [Convert Button]
  - [Only show if needed]
```

### Upload Img Tab:
```
Header: [Upload Images] [⚙️ Settings] [📜 History] [☀️ Theme]

Settings Panel:
  - Folder Configuration
  - Upload Service: [Dropdown: Catbox | Imgur | Google Drive]
  - [If Google Drive selected]:
    - Google Drive: ✓ Connected
    - [Reconnect Button]
```

## Implementation Steps

1. **Create Upload Service Selector Component**
   - Dropdown with all services
   - Store selected service in chrome.storage.local per tab
   - Keys: `convertUploadService`, `uploadImgService`, `uploadVidService`

2. **Add Google Drive to Service Lists**
   - Convert: Add "Google Drive" option
   - Upload Img: Add "Google Drive" option
   - Upload Vid: Already has it

3. **Conditional Google Drive UI**
   - Show connect button only if service === "Google Drive"
   - Check auth status when service selected
   - Show error badge if not connected

4. **Update Upload Logic**
   - Check selected service before upload
   - Route to appropriate upload function
   - For Google Drive: use existing `handleGoogleDriveUpload()`

5. **Move Service Selection to Settings**
   - Convert tab: Move upload buttons to settings
   - Show current service in main UI
   - Click gear to change

## Files to Modify

1. **popup.html**
   - Add service dropdown to all tabs' settings panels
   - Move Convert service buttons to settings
   - Add conditional Google Drive UI to Convert & Upload Img

2. **popup.js**
   - Add `getSelectedService(tab)` function
   - Add `setSelectedService(tab, service)` function
   - Update upload functions to check selected service
   - Add Google Drive UI logic to all tabs

3. **popup.css**
   - Style for service dropdown
   - Conditional display styles

## Estimated Complexity

- **High** - Requires significant refactoring
- **Testing needed** for each tab × each service combination
- **Backward compatibility** - Don't break existing functionality

## Recommendation

This is a large change set. Should we:
1. Implement in phases (one tab at a time)?
2. Create a separate feature branch?
3. Focus on most critical features first?

**User feedback requested:** Which is highest priority?
- Convert tab with Google Drive?
- Upload Img with Google Drive?
- Moving services to settings?
