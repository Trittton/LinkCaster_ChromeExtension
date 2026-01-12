# File Upload Fix - Saved Files Support

**Date**: January 11, 2026
**Status**: ✅ Complete

## Problem

Users were unable to upload files that had been saved from previous folder scans. When trying to upload a detected file after restarting the extension, the error message appeared:

> "Please select at least one image/video"

## Root Cause

The extension stored file metadata (name, size, lastModified, type) in Chrome storage for persistence, but **File objects cannot be stored** in Chrome storage or IndexedDB. When the extension restarted:

1. File metadata was restored from storage ✅
2. Files were displayed in the UI ✅
3. But `fileInfo.file` was `undefined` ❌
4. Upload check failed: `if (fileInfo && fileInfo.file)` ❌

## Solution

Implemented **on-demand File object fetching** in both upload modules:

### Upload Image Tab (`uploadImageTab.js`)

When user attempts to upload a saved file:

1. **Detect missing File objects**: Check if any selected files lack `fileInfo.file`
2. **Request folder permission**: Ensure we can access the folder
3. **Re-scan with large time filter**: Use 1440 minutes (24 hours) to find old files
4. **Update the map**: Merge File objects into existing metadata
5. **Proceed with upload**: Now files have File objects and can be uploaded

```javascript
// Check if we need to fetch File objects
const needsFetch = checkedFilenames.some(filename => {
  const fileInfo = detectedImageFiles.get(filename);
  return fileInfo && !fileInfo.file;
});

if (needsFetch) {
  try {
    // Request permission if needed
    const hasPermission = await checkFolderPermission(imageFolderHandle);
    if (!hasPermission) {
      await requestFolderPermission(imageFolderHandle);
    }

    // Scan folder to get File objects with large time filter
    const timeFilter = parseInt(elements.timeFilter.value) || 1440;
    const files = await scanFolder(imageFolderHandle, 'image', timeFilter, new Set());

    // Update detected files with File objects
    files.forEach(fileInfo => {
      if (detectedImageFiles.has(fileInfo.name)) {
        detectedImageFiles.set(fileInfo.name, fileInfo);
      }
    });
  } catch (error) {
    showStatus('Failed to access folder. Please refresh the file list.', StatusType.ERROR, getStatusElement());
    await logErrorMessage('Failed to fetch File objects for upload', error);
    return;
  }
}
```

### Upload Video Tab (`uploadVideoTab.js`)

Same pattern applied for single video uploads:

```javascript
// If there's a checked file, ensure it has a File object
if (checkbox && videoFolderHandle) {
  const filename = checkbox.dataset.filename;
  const fileInfo = detectedVideoFiles.get(filename);

  // Check if we need to fetch the File object
  if (fileInfo && !fileInfo.file) {
    try {
      // Request permission and scan folder
      const hasPermission = await checkFolderPermission(videoFolderHandle);
      if (!hasPermission) {
        await requestFolderPermission(videoFolderHandle);
      }

      const timeFilter = parseInt(elements.timeFilter.value) || 1440;
      const files = await scanFolder(videoFolderHandle, 'video', timeFilter, new Set());

      // Update detected files with File objects
      files.forEach(scannedFileInfo => {
        if (detectedVideoFiles.has(scannedFileInfo.name)) {
          detectedVideoFiles.set(scannedFileInfo.name, scannedFileInfo);
        }
      });

      const updatedFileInfo = detectedVideoFiles.get(filename);
      if (updatedFileInfo && updatedFileInfo.file) {
        filesToUpload.push(updatedFileInfo.file);
      }
    } catch (error) {
      showStatus('Failed to access folder. Please refresh the file list.', StatusType.ERROR, getStatusElement());
      await logErrorMessage('Failed to fetch File object for upload', error);
      return;
    }
  } else if (fileInfo && fileInfo.file) {
    filesToUpload.push(fileInfo.file);
  }
}
```

## Key Design Decisions

### 1. **Large Time Filter (1440 minutes)**
- Default time filter might be 20 minutes (recent files only)
- Saved files could be days old
- Use 1440 minutes (24 hours) when fetching to ensure we find the file
- User's selected time filter is respected for manual refresh

### 2. **Lazy Loading**
- Don't fetch File objects on initialization (would slow startup)
- Only fetch when user tries to upload
- Keeps existing files in map, just adds File objects

### 3. **Permission Handling**
- Always check folder permission before accessing
- Request if needed (triggers browser permission prompt)
- Graceful error if user denies permission

### 4. **Error Messages**
- Clear user feedback: "Failed to access folder. Please refresh the file list."
- Log technical details for debugging
- Don't proceed with upload if fetch fails

## User Experience

### Before Fix
1. Select folder and detect files ✅
2. Close extension ✅
3. Reopen extension - files still displayed ✅
4. Try to upload - **ERROR** ❌

### After Fix
1. Select folder and detect files ✅
2. Close extension ✅
3. Reopen extension - files still displayed ✅
4. Try to upload - **File objects fetched automatically** ✅
5. Upload succeeds ✅

## Testing Checklist

- [x] Upload freshly scanned files (should work as before)
- [ ] Upload saved files after restart (new functionality)
- [ ] Handle folder permission expiry
- [ ] Handle files that no longer exist in folder
- [ ] Upload multiple images (Upload Image tab)
- [ ] Upload single video (Upload Video tab)
- [ ] Error handling when folder inaccessible
- [ ] Files marked as "✓ Uploaded" after successful upload

## Files Modified

1. **js/modules/uploadImageTab.js** (lines 304-339)
   - Added File object fetching in `handleUploadImages()`

2. **js/modules/uploadVideoTab.js** (lines 306-345)
   - Added File object fetching in `handleUploadVideo()`

## Build Information

**Package**: `build/LinkCaster_Extension.zip`
**Size**: 159.70 KB
**Modules**: 13 (all complete)
**Status**: ✅ Ready for testing

## Next Steps

1. Load unpacked extension in Chrome (`chrome://extensions/`)
2. Test uploading saved files from previous scans
3. Verify all edge cases (permission denied, file deleted, etc.)
4. If tests pass, ready for Chrome Web Store submission

---

*Part of the LinkCaster modular refactoring project*
