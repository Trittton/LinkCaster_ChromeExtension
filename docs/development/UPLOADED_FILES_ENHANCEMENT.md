# Uploaded Files Enhancement

**Date**: January 12, 2026
**Status**: ✅ Complete

## Features Implemented

### 1. **Re-upload Capability for Uploaded Files**
Users can now select and re-upload files that have already been uploaded, allowing them to:
- Generate new URLs for the same file
- Re-upload files to different services
- Update outdated links

### 2. **Clickable "✓ Uploaded" Badge**
The "✓ Uploaded" badge is now interactive:
- **Clickable**: Click to open the uploaded file's URL in a new tab
- **Visual feedback**: Fades on hover to indicate it's clickable
- **Tooltip**: Shows "Click to open uploaded file" on hover
- **Conditional**: Only appears as a link if the URL exists in history

## Technical Implementation

### Changes to `uiHelpers.js`

#### Updated `createFileItemHtml()` Function

**New Parameters**:
- Added `fileInfo.url` (optional) - URL from upload history

**Key Changes**:

1. **Removed disabled attribute** from checkbox:
```javascript
// Before
${fileInfo.uploaded ? 'disabled' : ''}

// After
// No disabled attribute - checkboxes always enabled
```

2. **Made uploaded badge clickable** when URL is available:
```javascript
// Create uploaded badge - clickable if URL is available
let uploadedBadge = '';
if (fileInfo.uploaded) {
  if (fileInfo.url) {
    uploadedBadge = `<a href="${sanitizeHtml(fileInfo.url)}" target="_blank"
                        class="uploaded-badge-link"
                        style="color: #38ef7d; font-size: 10px; margin-left: 8px;
                               text-decoration: none; cursor: pointer; transition: opacity 0.2s;"
                        onmouseover="this.style.opacity='0.7'"
                        onmouseout="this.style.opacity='1'"
                        title="Click to open uploaded file">✓ Uploaded</a>`;
  } else {
    uploadedBadge = '<span style="color: #38ef7d; font-size: 10px; margin-left: 8px;">✓ Uploaded</span>';
  }
}
```

3. **Simplified checkbox logic**:
```javascript
// Before
const checkedAttr = wasChecked && !fileInfo.uploaded ? 'checked' : '';

// After
const checkedAttr = wasChecked ? 'checked' : '';
```

### Changes to `uploadImageTab.js`

#### Updated `initUploadImageTab()` Function

Added URL lookup from upload history:

```javascript
// Get upload history to find URLs for uploaded files
const history = await getHistory('imageUploadHistory');
const urlMap = new Map();
history.forEach(item => {
  urlMap.set(item.fileName, item.url);
});

// Render the files with upload status and URLs
const filesWithStatus = data.detectedImageFiles.map(f => ({
  ...f,
  uploaded: uploadedFiles.has(f.name),
  url: urlMap.get(f.name) // ← Added URL from history
}));
```

#### Updated `updateImageFiles()` Function

Same URL lookup logic added when refreshing file list:

```javascript
// Get upload history to find URLs for uploaded files
const history = await getHistory('imageUploadHistory');
const urlMap = new Map();
history.forEach(item => {
  urlMap.set(item.fileName, item.url);
});

// Mark files as uploaded with URLs
const filesWithUploadStatus = files.map(f => ({
  ...f,
  uploaded: uploadedFiles.has(f.name),
  url: urlMap.get(f.name)
}));
```

### Changes to `uploadVideoTab.js`

Same pattern applied:
- Updated `initUploadVideoTab()` to fetch and map URLs
- Updated `updateVideoFiles()` to include URLs

## User Experience

### Before Enhancement
1. File gets uploaded ✅
2. File marked as "✓ Uploaded" ✅
3. Checkbox becomes **disabled** ❌
4. Badge is **not clickable** ❌
5. User cannot re-upload the file ❌

### After Enhancement
1. File gets uploaded ✅
2. File marked as "✓ Uploaded" (clickable) ✅
3. Checkbox remains **enabled** ✅
4. Badge is **clickable link** to uploaded file ✅
5. User can **re-upload** the file ✅

## Visual Behavior

### Uploaded Badge States

**With URL** (clickable):
```
✓ Uploaded  ← Green text, clickable, fades on hover
```

**Without URL** (static):
```
✓ Uploaded  ← Green text, not clickable
```

### Interaction Flow

1. **Hover over badge**: Opacity changes to 0.7, tooltip appears
2. **Click badge**: Opens uploaded file URL in new tab
3. **Re-select file**: Checkbox can be checked again
4. **Re-upload**: File uploads with new URL

## Edge Cases Handled

### URL Not Found in History
- Badge displays as static text (not clickable)
- File can still be re-uploaded
- New upload will create clickable badge

### History Cleared but File Marked as Uploaded
- Badge displays without link
- File remains marked as uploaded
- Can be re-uploaded to create new history entry

### Multiple Uploads of Same File
- URL always shows the **most recent** upload
- Each upload updates the history
- Badge link updates to latest URL

## Benefits

1. **Better User Control**: Users can re-upload files without manual intervention
2. **Quick Access**: Direct access to uploaded files via clickable badge
3. **Flexibility**: Same file can be uploaded multiple times (e.g., different compression settings)
4. **No Data Loss**: History persists and links remain accessible

## Files Modified

1. **js/modules/uiHelpers.js** (lines 146-188)
   - Updated `createFileItemHtml()` function
   - Added clickable badge logic
   - Removed disabled attribute

2. **js/modules/uploadImageTab.js** (lines 68-82, 288-303)
   - Added URL lookup in `initUploadImageTab()`
   - Added URL lookup in `updateImageFiles()`

3. **js/modules/uploadVideoTab.js** (lines 68-82, 288-303)
   - Added URL lookup in `initUploadVideoTab()`
   - Added URL lookup in `updateVideoFiles()`

## Build Information

**Package**: `build/LinkCaster_Extension.zip`
**Size**: 160.59 KB
**Status**: ✅ Ready for testing

## Testing Checklist

- [ ] Upload a file and verify badge becomes clickable
- [ ] Click badge and verify it opens the correct URL
- [ ] Check checkbox on uploaded file and verify it can be selected
- [ ] Re-upload an uploaded file and verify it works
- [ ] Clear history and verify badge becomes non-clickable
- [ ] Upload same file twice and verify badge shows latest URL
- [ ] Test with both images (Upload Img tab) and videos (Upload Vid tab)

---

*Part of the LinkCaster enhancement project*
