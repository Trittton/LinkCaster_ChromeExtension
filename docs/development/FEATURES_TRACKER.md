# Features Implementation Tracker

## ✅ Completed Features

### 1. Connection Persistence ✅
- Session stored in chrome.storage.local
- Persists across browser restarts
- Status: **DONE**

### 2. OAuth Cancellation Detection ✅
- Added session verification endpoint
- Proper error message when user cancels
- Status: **DONE**

### 3. Unlink Button ✅
- Added "Unlink" button next to Reconnect
- Shows only when connected
- Confirmation dialog before unlinking
- Status: **DONE**

---

## 📋 Pending Features

### Feature 1: Move Upload Services to Settings (Convert Tab)
**Priority:** HIGH
**Status:** ⏸️ Pending

**Current State:**
- Upload service buttons (Catbox, Imgur, Flickr, Gyazo) shown prominently in main UI
- Takes up visual space

**Target State:**
- All service buttons moved to settings panel (gear ⚙️)
- Main UI shows only current selected service
- User clicks gear to change service

**Implementation Steps:**
1. [ ] Add service selector dropdown to Convert settings panel
2. [ ] Store selected service in chrome.storage.local (`convertUploadService`)
3. [ ] Show current service in main UI
4. [ ] Hide service buttons, show only in settings
5. [ ] Update upload logic to use selected service
6. [ ] Test all service combinations

**Files to Modify:**
- popup.html (Convert tab structure)
- popup.js (Service selection logic)
- popup.css (Conditional display)

**Estimated Time:** 2-3 hours

---

### Feature 2: Add Google Drive to Convert Tab
**Priority:** HIGH
**Status:** ⏸️ Pending (Depends on Feature 1)

**Current State:**
- Convert tab only supports: Catbox, Imgur, Flickr, Gyazo
- No Google Drive option

**Target State:**
- Google Drive added as 5th upload service option
- Shows connection UI when selected
- Uses shared Google Drive auth from Upload Vid tab

**Implementation Steps:**
1. [ ] Add "Google Drive" to service selector dropdown
2. [ ] Add conditional Google Drive connection UI (only show if selected)
3. [ ] Implement Google Drive upload for Convert tab links
4. [ ] Handle auth errors specific to Convert tab
5. [ ] Test Convert → Google Drive flow

**Files to Modify:**
- popup.html (Add Google Drive UI to Convert)
- popup.js (Add Google Drive upload handler for Convert)
- background.js (Reuse existing Google Drive upload function)

**Estimated Time:** 2-3 hours

---

### Feature 3: Add Google Drive to Upload Img Tab
**Priority:** MEDIUM
**Status:** ⏸️ Pending

**Current State:**
- Upload Img only supports: Catbox, Imgur
- No Google Drive option

**Target State:**
- Google Drive added as 3rd upload service option
- Shows connection UI when selected
- Uses shared Google Drive auth

**Implementation Steps:**
1. [ ] Add service selector to Upload Img settings
2. [ ] Add "Google Drive" option
3. [ ] Add conditional Google Drive connection UI
4. [ ] Implement Google Drive upload for images
5. [ ] Test Upload Img → Google Drive flow

**Files to Modify:**
- popup.html (Add service selector to Upload Img)
- popup.js (Add service selection logic)
- background.js (Reuse Google Drive upload, handle images)

**Estimated Time:** 2 hours

---

### Feature 4: Share Google Drive Auth Across All Tabs
**Priority:** MEDIUM
**Status:** ⏸️ Pending (Partially done - auth already shared)

**Current State:**
- Google Drive auth stored globally in chrome.storage.local ✅
- UI only shows connection status in Upload Vid tab
- Other tabs don't show auth status

**Target State:**
- All tabs show Google Drive connection status when Google Drive selected
- Consistent UI across all tabs
- One auth session for entire extension

**Implementation Steps:**
1. [ ] Add connection status display to Convert tab (when Google Drive selected)
2. [ ] Add connection status display to Upload Img tab (when Google Drive selected)
3. [ ] Reuse `updateGDriveUI()` function across tabs
4. [ ] Test auth flow from each tab
5. [ ] Verify disconnection affects all tabs

**Files to Modify:**
- popup.js (Call updateGDriveUI from all tabs)
- popup.html (Conditional Google Drive UI in all tabs)

**Estimated Time:** 1-2 hours

---

## Implementation Order

**Recommended sequence:**
1. **Feature 1** (Move services to settings) - Foundation for others
2. **Feature 2** (Google Drive to Convert) - High priority, depends on #1
3. **Feature 3** (Google Drive to Upload Img) - Similar to #2
4. **Feature 4** (Share auth UI) - Polish, ties everything together

**Total Estimated Time:** 7-10 hours

---

## Testing Checklist

After each feature:
- [ ] Reload extension and verify no console errors
- [ ] Test happy path (feature works as expected)
- [ ] Test error paths (disconnection, auth failure)
- [ ] Test persistence (close/reopen extension)
- [ ] Test cross-tab behavior
- [ ] Verify backward compatibility (existing features still work)

---

## Current Status: Ready to Start Feature 1

**Next Action:** Implement Feature 1 (Move upload services to settings in Convert tab)

**User Approval Required:** Should we proceed with Feature 1?
