/**
 * Upload Video Tab Module
 * Handles video upload functionality to Google Drive
 * @module uploadVideoTab
 */

import { logInfo, logErrorMessage, logWarning } from './errorLogger.js';
import { validateVideoFile } from './validator.js';
import { showStatus, updateProgress, formatDate, createHistoryItemHtml, createFileItemHtml, StatusType } from './uiHelpers.js';
import { getStorage, setStorage, addToHistory, getHistory, clearHistory, getFolderHandle, saveFolderHandle } from './storage.js';
import { scanFolder, requestFolderPermission, checkFolderPermission } from './fileMonitoring.js';
import { uploadToGoogleDrive } from './uploadServices.js';
import { createUploadResults } from './uploadResults.js';
import { createPendingFiles } from './pendingFiles.js';

/**
 * Per-file upload results controller ("bubbles", FR-3)
 * @type {ReturnType<typeof createUploadResults>|null}
 */
let videoResults = null;

/**
 * Accumulating attachment list for the file picker (FR-3)
 * @type {ReturnType<typeof createPendingFiles>|null}
 */
let videoPending = null;

/**
 * Gets the status element for this tab
 * @returns {HTMLElement|null}
 */
function getStatusElement() {
  return document.getElementById('video-status');
}

/**
 * Folder handle for video monitoring
 * @type {FileSystemDirectoryHandle|null}
 */
let videoFolderHandle = null;

/**
 * Set of uploaded file names
 * @type {Set<string>}
 */
let uploadedVideoFiles = new Set();

/**
 * Detected video files map
 * @type {Map<string, Object>}
 */
let detectedVideoFiles = new Map();

/**
 * Initializes the Upload Video tab
 * @returns {Promise<void>}
 */
export async function initUploadVideoTab() {
  const elements = getElements();
  if (elements.resultsList) {
    videoResults = createUploadResults(elements.resultsList);
  }
  if (elements.pendingList) {
    videoPending = createPendingFiles(elements.pendingList);
  }
  await loadSettings(elements);
  await loadFolderHandle();
  await loadUploadedFiles();
  await renderVideoHistory(elements);
  await updateGDriveUI(elements);
  setupEventListeners(elements);

  // Restore folder path if folder was previously selected
  if (videoFolderHandle) {
    elements.folderPath.textContent = `Selected: ${videoFolderHandle.name}`;
    elements.folderPath.style.color = '#38ef7d';

    // Load previously detected files from storage
    const data = await getStorage(['detectedVideoFiles']);
    if (data.detectedVideoFiles && Array.isArray(data.detectedVideoFiles) && data.detectedVideoFiles.length > 0) {
      // Restore detected files map (without File objects, so they can't be uploaded until refresh)
      detectedVideoFiles.clear();
      data.detectedVideoFiles.forEach(fileInfo => {
        detectedVideoFiles.set(fileInfo.name, fileInfo);
      });

      // Get upload history to find URLs for uploaded files
      const history = await getHistory('videoUploadHistory');
      const urlMap = new Map();
      history.forEach(item => {
        urlMap.set(item.fileName, item.url);
      });

      // Render the files with upload status and URLs
      const filesWithStatus = data.detectedVideoFiles.map(f => ({
        ...f,
        uploaded: uploadedVideoFiles.has(f.name),
        url: urlMap.get(f.name)
      }));
      const html = filesWithStatus.map(f => createFileItemHtml(f)).join('');
      elements.fileList.innerHTML = html;
    } else {
      // No saved files, show empty message
      elements.fileList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No files detected. Click "Refresh" to scan folder.</p>';
    }
  }

  await logInfo('Upload Video tab initialized');
}

/**
 * Loads saved settings
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function loadSettings(elements) {
  const data = await getStorage(['videoTimeFilter']);

  if (data.videoTimeFilter && elements.timeFilter) {
    elements.timeFilter.value = data.videoTimeFilter;
  }
}

/**
 * Loads folder handle from IndexedDB
 * @returns {Promise<void>}
 */
async function loadFolderHandle() {
  videoFolderHandle = await getFolderHandle('videoFolderHandle');
}

/**
 * Loads uploaded files from storage
 * @returns {Promise<void>}
 */
async function loadUploadedFiles() {
  const data = await getStorage(['uploadedVideoFiles']);
  if (data.uploadedVideoFiles) {
    uploadedVideoFiles = new Set(data.uploadedVideoFiles);
  }
}

/**
 * Sets up event listeners
 * @param {Object} elements - DOM elements
 * @returns {void}
 */
function setupEventListeners(elements) {
  // Settings toggle
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', () => {
      const isVisible = elements.settingsPanel.style.display === 'block';
      elements.settingsPanel.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        elements.historyPanel.style.display = 'none';
      }
    });
  }

  // History toggle
  if (elements.historyBtn) {
    elements.historyBtn.addEventListener('click', () => {
      const isVisible = elements.historyPanel.style.display === 'block';
      elements.historyPanel.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        elements.settingsPanel.style.display = 'none';
        renderVideoHistory(elements);
      }
    });
  }

  // Clear history
  if (elements.clearHistoryBtn) {
    elements.clearHistoryBtn.addEventListener('click', async () => {
      await clearHistory('videoUploadHistory');
      await renderVideoHistory(elements);
      showStatus('History cleared', StatusType.SUCCESS, getStatusElement());
    });
  }

  // Google Drive connect
  if (elements.gdriveConnect) {
    elements.gdriveConnect.addEventListener('click', () => handleGDriveConnect(elements));
  }

  // Google Drive unlink
  if (elements.gdriveUnlink) {
    elements.gdriveUnlink.addEventListener('click', () => handleGDriveUnlink(elements));
  }

  // Select folder
  if (elements.selectFolder) {
    elements.selectFolder.addEventListener('click', handleSelectFolder);
  }

  // Refresh files
  if (elements.refreshFiles) {
    elements.refreshFiles.addEventListener('click', async () => {
      if (!videoFolderHandle) {
        showStatus('Please select a folder first', StatusType.ERROR, getStatusElement());
        return;
      }

      if (videoFolderHandle) {
        const hasPermission = await checkFolderPermission(videoFolderHandle);
        if (!hasPermission) {
          try {
            await requestFolderPermission(videoFolderHandle);
          } catch (error) {
            showStatus('Permission denied. Please select folder again.', StatusType.ERROR, getStatusElement());
            return;
          }
        }
      }

      await updateVideoFiles(elements);
      showStatus('Files refreshed', StatusType.SUCCESS, getStatusElement());
    });
  }

  // Select All button - three-state behavior:
  // 1. First click: Select only unuploaded files
  // 2. Second click: Select ALL files (if there are uploaded ones)
  // 3. If all selected: Deselect all
  if (elements.selectAllBtn) {
    elements.selectAllBtn.addEventListener('click', () => {
      const allCheckboxes = elements.fileList.querySelectorAll('.file-checkbox:not(:disabled)');
      const uploadedCheckboxes = elements.fileList.querySelectorAll('.file-checkbox.uploaded:not(:disabled)');
      const unuploadedCheckboxes = elements.fileList.querySelectorAll('.file-checkbox:not(.uploaded):not(:disabled)');

      if (allCheckboxes.length === 0) {
        showStatus('No files available to select', StatusType.WARNING, getStatusElement());
        return;
      }

      const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
      const allUnuploadedChecked = unuploadedCheckboxes.length > 0 &&
        Array.from(unuploadedCheckboxes).every(cb => cb.checked);
      const someUploadedUnchecked = uploadedCheckboxes.length > 0 &&
        Array.from(uploadedCheckboxes).some(cb => !cb.checked);

      if (allChecked) {
        // All selected -> Deselect all
        allCheckboxes.forEach(cb => cb.checked = false);
        showStatus('Deselected all files', StatusType.SUCCESS, getStatusElement());
      } else if (allUnuploadedChecked && someUploadedUnchecked) {
        // All unuploaded selected but some uploaded not selected -> Select ALL
        allCheckboxes.forEach(cb => cb.checked = true);
        showStatus(`Selected all ${allCheckboxes.length} file(s)`, StatusType.SUCCESS, getStatusElement());
      } else {
        // Default: Select only unuploaded files first
        if (unuploadedCheckboxes.length > 0) {
          allCheckboxes.forEach(cb => cb.checked = false);
          unuploadedCheckboxes.forEach(cb => cb.checked = true);
          showStatus(`Selected ${unuploadedCheckboxes.length} unuploaded file(s)`, StatusType.SUCCESS, getStatusElement());
        } else {
          // No unuploaded files, select all
          allCheckboxes.forEach(cb => cb.checked = true);
          showStatus(`Selected all ${allCheckboxes.length} file(s)`, StatusType.SUCCESS, getStatusElement());
        }
      }
    });
  }

  // File picker accumulates into the pending list instead of replacing the
  // previous selection (native inputs reset their FileList on every pick)
  if (elements.fileInput) {
    elements.fileInput.addEventListener('change', () => {
      if (videoPending && elements.fileInput.files && elements.fileInput.files.length > 0) {
        videoPending.add(elements.fileInput.files);
        elements.fileInput.value = '';
      }
    });
  }

  // Time filter change
  if (elements.timeFilter) {
    elements.timeFilter.addEventListener('change', async () => {
      await setStorage({ videoTimeFilter: elements.timeFilter.value });
      await updateVideoFiles(elements);
    });
  }

  // Upload button
  if (elements.uploadBtn) {
    elements.uploadBtn.addEventListener('click', () => handleUploadVideo(elements));
  }

  // Copy button (copies all uploaded URLs from the result bubbles)
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', async () => {
      try {
        const urls = videoResults ? videoResults.urls() : [];
        await navigator.clipboard.writeText(urls.join('\n'));
        showStatus(`Copied ${urls.length} link(s)!`, StatusType.SUCCESS, getStatusElement());
      } catch (error) {
        showStatus('Failed to copy', StatusType.ERROR, getStatusElement());
        await logErrorMessage('Failed to copy video links', error);
      }
    });
  }

}

/**
 * Handles folder selection
 * @returns {Promise<void>}
 */
async function handleSelectFolder() {
  try {
    videoFolderHandle = await window.showDirectoryPicker();
    await saveFolderHandle('videoFolderHandle', videoFolderHandle);
    await setStorage({ videoFolderName: videoFolderHandle.name });
    await logInfo('Video folder selected', { name: videoFolderHandle.name });

    const elements = getElements();
    elements.folderPath.textContent = `Selected: ${videoFolderHandle.name}`;
    elements.folderPath.style.color = '#38ef7d';
    await updateVideoFiles(elements);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + error.message, StatusType.ERROR, getStatusElement());
      await logErrorMessage('Failed to select video folder', error);
    }
  }
}

/**
 * Updates detected video files list
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function updateVideoFiles(elements) {
  if (!videoFolderHandle) return;

  const timeFilter = parseInt(elements.timeFilter.value) || 20;
  const files = await scanFolder(videoFolderHandle, 'video', timeFilter, uploadedVideoFiles);

  detectedVideoFiles.clear();
  files.forEach(fileInfo => {
    detectedVideoFiles.set(fileInfo.name, fileInfo);
  });

  // Save detected files to storage (without the File objects, just metadata)
  const filesToSave = files.map(f => ({
    name: f.name,
    size: f.size,
    lastModified: f.lastModified,
    type: f.type
  }));
  await setStorage({ detectedVideoFiles: filesToSave });

  if (files.length === 0) {
    elements.fileList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No files detected in selected folder</p>';
    return;
  }

  // Get upload history to find URLs for uploaded files
  const history = await getHistory('videoUploadHistory');
  const urlMap = new Map();
  history.forEach(item => {
    urlMap.set(item.fileName, item.url);
  });

  // Mark files as uploaded if they were previously uploaded
  const filesWithUploadStatus = files.map(f => ({
    ...f,
    uploaded: uploadedVideoFiles.has(f.name),
    url: urlMap.get(f.name)
  }));

  const html = filesWithUploadStatus.map(f => createFileItemHtml(f)).join('');
  elements.fileList.innerHTML = html;
}

/**
 * Handles video upload
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleUploadVideo(elements) {
  /** @type {Array<{file: File, id: string, pendingId: string|null}>} */
  const uploadEntries = [];

  // Files attached via the picker, accumulated in the pending list (FR-3)
  if (videoPending) {
    for (const { id, file } of videoPending.entries()) {
      uploadEntries.push({ file, id: `pend-${id}`, pendingId: id });
    }
  }

  // Add ALL checked files from detected files
  const checkboxes = elements.fileList.querySelectorAll('.file-checkbox:checked:not(:disabled)');

  // If there are checked files, ensure they have File objects
  if (checkboxes.length > 0 && videoFolderHandle) {
    const checkedFilenames = Array.from(checkboxes).map(cb => cb.dataset.filename);

    // Check if we need to fetch File objects
    const needsFetch = checkedFilenames.some(filename => {
      const fileInfo = detectedVideoFiles.get(filename);
      return fileInfo && !fileInfo.file;
    });

    if (needsFetch) {
      try {
        // Request permission if needed
        const hasPermission = await checkFolderPermission(videoFolderHandle);
        if (!hasPermission) {
          await requestFolderPermission(videoFolderHandle);
        }

        // Scan folder to get File objects with large time filter
        const timeFilter = parseInt(elements.timeFilter.value) || 1440;
        const files = await scanFolder(videoFolderHandle, 'video', timeFilter, new Set());

        // Update detected files with File objects
        files.forEach(scannedFileInfo => {
          if (detectedVideoFiles.has(scannedFileInfo.name)) {
            detectedVideoFiles.set(scannedFileInfo.name, scannedFileInfo);
          }
        });
      } catch (error) {
        showStatus('Failed to access folder. Please refresh the file list.', StatusType.ERROR, getStatusElement());
        await logErrorMessage('Failed to fetch File objects for upload', error);
        return;
      }
    }

    // Add all checked files to upload list
    for (const filename of checkedFilenames) {
      const fileInfo = detectedVideoFiles.get(filename);
      if (fileInfo && fileInfo.file) {
        uploadEntries.push({ file: fileInfo.file, id: `det-${filename}`, pendingId: null });
      }
    }
  }

  if (uploadEntries.length === 0) {
    showStatus('Please select at least one video file', StatusType.ERROR, getStatusElement());
    return;
  }

  // Check Google Drive connection
  const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
  if (!data.googleDriveSessionId || !data.googleDriveConnected) {
    showStatus('Please connect to Google Drive first', StatusType.ERROR, getStatusElement());
    return;
  }

  // Validate all files first
  for (const { file } of uploadEntries) {
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      showStatus(`${file.name}: ${validation.error}`, StatusType.ERROR, getStatusElement());
      await logWarning('Video validation failed', { file: file.name, error: validation.error });
      return;
    }
  }

  // Start upload
  elements.uploadBtn.disabled = true;
  elements.progress.style.display = 'block';

  // FR-6: non-blocking large-file warning; uploads run in the popup, so it
  // must stay open until they finish.
  const oversize = uploadEntries.filter(e => e.file.size > 100 * 1024 * 1024);
  if (oversize.length > 0) {
    showStatus(`⚠️ ${oversize.length} file(s) over 100 MB — upload may take several minutes. Keep this popup open.`, StatusType.WARNING, getStatusElement());
  }

  const CONCURRENCY_LIMIT = 2; // Upload 2 videos at a time

  let successCount = 0;
  let failedCount = 0;
  let sessionExpired = false;

  // Render one bubble per file (FR-3)
  videoResults.reset();
  uploadEntries.forEach(({ id, file }) => videoResults.add(id, file.name, file.size));
  elements.outputSection.style.display = 'block';

  // Aggregate top progress bar: each file contributes 1/N. With 2 videos,
  // one finished = 50%; first at 50% and second untouched = 25%.
  const progressByFile = new Map(uploadEntries.map(({ id }) => [id, 0]));
  function updateOverallProgress(label = null) {
    let sum = 0;
    for (const fraction of progressByFile.values()) sum += fraction;
    const pct = Math.round((sum / uploadEntries.length) * 100);
    updateProgress(pct, 100, label || `Uploading… ${pct}%`, elements.progressFill, elements.progressText);
  }
  updateOverallProgress('Starting upload…'); // reset bar from any previous run

  // Uploads one file and updates its bubble; used for both the initial pass
  // and per-file Retry. Successful pending-list files leave the list.
  async function uploadSingle(entry) {
    const { file, id, pendingId } = entry;
    videoResults.setUploading(id);
    try {
      const url = await uploadToGoogleDrive(file, data.googleDriveSessionId, (done, total) => {
        videoResults.setUploading(id, Math.round((done / total) * 100));
        progressByFile.set(id, done / total);
        updateOverallProgress();
      });

      await addToHistory('videoUploadHistory', {
        fileName: file.name,
        url: url,
        timestamp: Date.now()
      });

      videoResults.setDone(id, url);
      progressByFile.set(id, 1);
      updateOverallProgress();
      if (pendingId && videoPending) {
        videoPending.remove(pendingId);
      }
      await logInfo('Video upload completed', { file: file.name });
      return { success: true, url, filename: file.name };
    } catch (error) {
      await logErrorMessage(`Video upload failed for ${file.name}`, error);
      progressByFile.set(id, 1); // counted as processed for the bar
      updateOverallProgress();

      if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
        videoResults.setFailed(id, 'Google Drive session expired');
        throw error; // Handled at batch level
      }

      videoResults.setFailed(id, error.message, async () => {
        const retry = await uploadSingle(entry);
        if (retry.success) {
          uploadedVideoFiles.add(retry.filename);
          await setStorage({ uploadedVideoFiles: Array.from(uploadedVideoFiles) });
        }
      });
      return { success: false, error: error.message, filename: file.name };
    }
  }

  try {
    // Process files in batches with concurrency limit
    for (let i = 0; i < uploadEntries.length; i += CONCURRENCY_LIMIT) {
      if (sessionExpired) break;

      const batch = uploadEntries.slice(i, i + CONCURRENCY_LIMIT);

      const batchResults = await Promise.allSettled(
        batch.map(entry => uploadSingle(entry))
      );

      for (const settledResult of batchResults) {
        if (settledResult.status === 'fulfilled') {
          const result = settledResult.value;
          if (result.success) {
            uploadedVideoFiles.add(result.filename);
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          if (settledResult.reason?.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
            sessionExpired = true;
            await setStorage({ googleDriveConnected: false });
            await updateGDriveUI(elements);
            showStatus('⚠️ Google Drive session expired. Please reconnect in Settings (⚙️).', StatusType.ERROR, getStatusElement());
            break;
          }
          failedCount++;
        }
      }

      if (sessionExpired) break;
    }

    // Save uploaded files list
    await setStorage({ uploadedVideoFiles: Array.from(uploadedVideoFiles) });

    // Refresh list
    if (videoFolderHandle) {
      await updateVideoFiles(elements);
    }

    // Show summary
    updateOverallProgress('Upload complete!');

    if (failedCount === 0) {
      showStatus(`All ${successCount} video(s) uploaded successfully!`, StatusType.SUCCESS, getStatusElement());
    } else if (successCount === 0) {
      showStatus(`All ${failedCount} upload(s) failed`, StatusType.ERROR, getStatusElement());
    } else {
      showStatus(`${successCount} uploaded, ${failedCount} failed`, StatusType.WARNING, getStatusElement());
    }

    setTimeout(() => {
      elements.progress.style.display = 'none';
    }, 3000);

  } catch (error) {
    showStatus('Upload failed: ' + error.message, StatusType.ERROR, getStatusElement());
    await logErrorMessage('Video upload error', error);
    elements.progress.style.display = 'none';
  } finally {
    elements.uploadBtn.disabled = false;
  }
}

/**
 * Renders upload history
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function renderVideoHistory(elements) {
  const history = await getHistory('videoUploadHistory');

  if (history.length === 0) {
    elements.historyList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No uploads yet</p>';
    return;
  }

  const html = history.map(item => createHistoryItemHtml(item, 'history-copy-btn', 'history-open-btn')).join('');
  elements.historyList.innerHTML = html;

  // Add event listeners
  elements.historyList.querySelectorAll('.history-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      await navigator.clipboard.writeText(url);
      showStatus('Link copied!', StatusType.SUCCESS, getStatusElement());
    });
  });

  elements.historyList.querySelectorAll('.history-open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      window.open(url, '_blank');
    });
  });
}

/**
 * Updates Google Drive UI visibility
 * @param {Object} [elements] - Optional DOM elements (will fetch if not provided)
 * @returns {Promise<void>}
 */
export async function updateGDriveUI(elements) {
  if (!elements) {
    elements = getElements();
  }

  // Always show upload section (Google Drive connection managed in settings)
  if (elements.uploadSection) {
    elements.uploadSection.style.display = 'block';
  }

  // Update Google Drive status in settings
  await updateGDriveStatus(elements);
}

/**
 * Updates Google Drive connection status
 * @param {Object} [elements] - Optional DOM elements (will fetch if not provided)
 * @returns {Promise<void>}
 */
export async function updateGDriveStatus(elements) {
  if (!elements) {
    elements = getElements();
  }

  const data = await getStorage(['googleDriveConnected', 'googleDriveConnectedAt']);

  if (data.googleDriveConnected) {
    if (elements.gdriveConnect) elements.gdriveConnect.style.display = 'none';
    if (elements.gdriveUnlink) elements.gdriveUnlink.style.display = 'block';
    if (elements.gdriveStatus) {
      const date = data.googleDriveConnectedAt ? new Date(data.googleDriveConnectedAt).toLocaleDateString() : 'Unknown';
      elements.gdriveStatus.textContent = `Connected - ${date}`;
      elements.gdriveStatus.style.color = '#38ef7d';
    }
  } else {
    if (elements.gdriveConnect) elements.gdriveConnect.style.display = 'block';
    if (elements.gdriveUnlink) elements.gdriveUnlink.style.display = 'none';
    if (elements.gdriveStatus) {
      elements.gdriveStatus.textContent = 'Not connected';
      elements.gdriveStatus.style.color = 'var(--text-dimmed)';
    }
  }
}

/**
 * Handles Google Drive connect
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleGDriveConnect(elements) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleDriveOAuth' });

    if (response.success) {
      showStatus('Connected to Google Drive!', StatusType.SUCCESS, getStatusElement());
      await updateGDriveStatus(elements);
      await logInfo('Connected to Google Drive from Upload Video tab');
    } else {
      showStatus('Failed to connect: ' + response.error, StatusType.ERROR, getStatusElement());
      await logErrorMessage('Google Drive connection failed', new Error(response.error));
    }
  } catch (error) {
    showStatus('Connection failed: ' + error.message, StatusType.ERROR, getStatusElement());
    await logErrorMessage('Google Drive connection error', error);
  }
}

/**
 * Handles Google Drive unlink
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleGDriveUnlink(elements) {
  await setStorage({
    googleDriveSessionId: null,
    googleDriveConnected: false
  });

  showStatus('Disconnected from Google Drive', StatusType.SUCCESS, getStatusElement());
  await updateGDriveStatus(elements);
  await logInfo('Disconnected from Google Drive from Upload Video tab');
}

/**
 * Gets DOM elements (helper function)
 * @returns {Object} DOM elements
 */
function getElements() {
  return {
    settingsBtn: document.getElementById('gdrive-settings-btn'),
    settingsPanel: document.getElementById('gdrive-settings'),
    historyBtn: document.getElementById('video-history-btn'),
    historyPanel: document.getElementById('video-history-panel'),
    historyList: document.getElementById('video-history-list'),
    clearHistoryBtn: document.getElementById('clear-video-history'),
    gdriveConnect: document.getElementById('video-gdrive-connect'),
    gdriveUnlink: document.getElementById('video-gdrive-unlink'),
    gdriveStatus: document.getElementById('video-gdrive-status'),
    selectFolder: document.getElementById('video-select-folder'),
    folderPath: document.getElementById('video-folder-path'),
    timeFilter: document.getElementById('video-time-filter'),
    detectedFiles: document.getElementById('video-detected-files'),
    fileList: document.getElementById('video-file-list'),
    refreshFiles: document.getElementById('video-refresh-files'),
    selectAllBtn: document.getElementById('video-select-all'),
    fileInput: document.getElementById('video-file-input'),
    uploadBtn: document.getElementById('upload-video-btn'),
    progress: document.getElementById('video-progress'),
    progressFill: document.getElementById('video-progress-fill'),
    progressText: document.getElementById('video-progress-text'),
    outputSection: document.getElementById('video-output-section'),
    resultsList: document.getElementById('video-results'),
    pendingList: document.getElementById('video-pending-files'),
    copyBtn: document.getElementById('video-copy-btn'),
    uploadSection: document.getElementById('gdrive-upload-section')
  };
}
