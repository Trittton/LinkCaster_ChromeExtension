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

  // Copy button
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(elements.outputText.value);
        showStatus('Copied to clipboard!', StatusType.SUCCESS, getStatusElement());
      } catch (error) {
        showStatus('Failed to copy', StatusType.ERROR, getStatusElement());
        await logErrorMessage('Failed to copy video link', error);
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
  const filesToUpload = [];

  // Add file from file input
  if (elements.fileInput.files && elements.fileInput.files.length > 0) {
    filesToUpload.push(elements.fileInput.files[0]);
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
        filesToUpload.push(fileInfo.file);
      }
    }
  }

  if (filesToUpload.length === 0) {
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
  for (const file of filesToUpload) {
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

  const uploadedUrls = [];
  const CONCURRENCY_LIMIT = 2; // Upload 2 videos at a time (videos are larger)
  let successCount = 0;
  let failedCount = 0;
  let completed = 0;
  let sessionExpired = false;

  try {
    // Process files in batches with concurrency limit
    for (let i = 0; i < filesToUpload.length; i += CONCURRENCY_LIMIT) {
      if (sessionExpired) break;

      const batch = filesToUpload.slice(i, i + CONCURRENCY_LIMIT);
      const currentBatchStart = i;

      const batchPromises = batch.map(async (file, batchIndex) => {
        const fileIndex = currentBatchStart + batchIndex;
        const currentIndex = fileIndex + 1;
        const total = filesToUpload.length;

        try {
          const url = await uploadToGoogleDrive(file, data.googleDriveSessionId);

          // Add to history
          await addToHistory('videoUploadHistory', {
            fileName: file.name,
            url: url,
            timestamp: Date.now()
          });

          await logInfo('Video upload completed', { file: file.name });

          return {
            success: true,
            url: url,
            filename: file.name
          };
        } catch (error) {
          await logErrorMessage(`Video upload failed for ${file.name}`, error);

          // Check for session expiry
          if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
            throw error; // Re-throw to handle at batch level
          }

          return {
            success: false,
            error: error.message,
            filename: file.name
          };
        }
      });

      // Wait for all uploads in the batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      for (let batchIndex = 0; batchIndex < batchResults.length; batchIndex++) {
        const settledResult = batchResults[batchIndex];
        const file = batch[batchIndex];
        completed++;

        updateProgress(completed - 1, filesToUpload.length, `Uploading ${completed}/${filesToUpload.length}: ${file.name}...`, elements.progressFill, elements.progressText);

        if (settledResult.status === 'fulfilled') {
          const result = settledResult.value;
          if (result.success) {
            uploadedUrls.push(result.url);
            uploadedVideoFiles.add(result.filename);
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          // Handle session expiry
          if (settledResult.reason?.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
            sessionExpired = true;
            await setStorage({ googleDriveConnected: false });
            await updateGDriveUI(elements);
            showStatus('⚠️ Google Drive session expired. Please reconnect.', StatusType.ERROR, getStatusElement());
            alert('⚠️ Google Drive session expired!\n\nPlease reconnect to Google Drive in Settings (⚙️) to continue uploading.');
            break;
          }
          failedCount++;
        }
      }

      if (sessionExpired) break;
    }

    // Save uploaded files list
    await setStorage({ uploadedVideoFiles: Array.from(uploadedVideoFiles) });

    // Show results
    if (uploadedUrls.length > 0) {
      elements.outputText.value = uploadedUrls.join('\n');
      elements.outputSection.style.display = 'block';
    }

    // Refresh list
    if (videoFolderHandle) {
      await updateVideoFiles(elements);
    }

    // Clear file input
    if (elements.fileInput) {
      elements.fileInput.value = '';
    }

    // Show summary
    updateProgress(filesToUpload.length, filesToUpload.length, 'Upload complete!', elements.progressFill, elements.progressText);

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
    fileInput: document.getElementById('video-file-input'),
    uploadBtn: document.getElementById('upload-video-btn'),
    progress: document.getElementById('video-progress'),
    progressFill: document.getElementById('video-progress-fill'),
    progressText: document.getElementById('video-progress-text'),
    outputSection: document.getElementById('video-output-section'),
    outputText: document.getElementById('video-output-text'),
    copyBtn: document.getElementById('video-copy-btn'),
    uploadSection: document.getElementById('gdrive-upload-section')
  };
}
