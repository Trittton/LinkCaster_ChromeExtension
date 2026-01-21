/**
 * Upload Image Tab Module
 * Handles image upload functionality
 * @module uploadImageTab
 */

import { logInfo, logErrorMessage, logWarning } from './errorLogger.js';
import { validateImageFile } from './validator.js';
import { showStatus, updateProgress, formatDate, createHistoryItemHtml, createFileItemHtml, StatusType } from './uiHelpers.js';
import { getStorage, setStorage, addToHistory, getHistory, clearHistory, getFolderHandle, saveFolderHandle } from './storage.js';
import { scanFolder, requestFolderPermission, checkFolderPermission } from './fileMonitoring.js';
import { uploadToCatbox, uploadToGoogleDrive } from './uploadServices.js';
import { getCurrentTab } from './tabs.js';

/**
 * Gets the status element for this tab
 * @returns {HTMLElement|null}
 */
function getStatusElement() {
  return document.getElementById('image-status');
}

/**
 * Folder handle for image monitoring
 * @type {FileSystemDirectoryHandle|null}
 */
let imageFolderHandle = null;

/**
 * Set of uploaded file names
 * @type {Set<string>}
 */
let uploadedFiles = new Set();

/**
 * Detected image files map
 * @type {Map<string, Object>}
 */
let detectedImageFiles = new Map();

/**
 * Initializes the Upload Image tab
 * @returns {Promise<void>}
 */
export async function initUploadImageTab() {
  const elements = getElements();
  await loadSettings(elements);
  await loadFolderHandle();
  await loadUploadedFiles();
  await renderImageHistory(elements);
  setupEventListeners(elements);

  // Restore folder path and show detected files section if folder was previously selected
  if (imageFolderHandle) {
    elements.folderPath.textContent = `Selected: ${imageFolderHandle.name}`;
    elements.folderPath.style.color = '#38ef7d';
    elements.detectedFiles.style.display = 'block';

    // Load previously detected files from storage
    const data = await getStorage(['detectedImageFiles']);
    if (data.detectedImageFiles && Array.isArray(data.detectedImageFiles) && data.detectedImageFiles.length > 0) {
      // Restore detected files map (without File objects, so they can't be uploaded until refresh)
      detectedImageFiles.clear();
      data.detectedImageFiles.forEach(fileInfo => {
        detectedImageFiles.set(fileInfo.name, fileInfo);
      });

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
        url: urlMap.get(f.name)
      }));
      const html = filesWithStatus.map(f => createFileItemHtml(f)).join('');
      elements.fileList.innerHTML = html;
    } else {
      // No saved files, show empty message
      elements.fileList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No files detected. Click "Refresh" to scan folder.</p>';
    }
  }

  await logInfo('Upload Image tab initialized');
}

/**
 * Loads saved settings
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function loadSettings(elements) {
  const data = await getStorage(['imageUploadService', 'uploadedImageFiles']);

  if (data.imageUploadService && elements.serviceSelect) {
    elements.serviceSelect.value = data.imageUploadService;
  }

  if (data.uploadedImageFiles) {
    uploadedFiles = new Set(data.uploadedImageFiles);
  }

  await updateImageGDriveUI(elements);
}

/**
 * Loads folder handle from IndexedDB
 * @returns {Promise<void>}
 */
async function loadFolderHandle() {
  imageFolderHandle = await getFolderHandle('imageFolderHandle');
}

/**
 * Loads uploaded files from storage
 * @returns {Promise<void>}
 */
async function loadUploadedFiles() {
  const data = await getStorage(['uploadedImageFiles']);
  if (data.uploadedImageFiles) {
    uploadedFiles = new Set(data.uploadedImageFiles);
  }
}

/**
 * Sets up event listeners
 * @param {Object} elements - DOM elements
 * @returns {void}
 */
function setupEventListeners(elements) {
  // Service selection change
  if (elements.serviceSelect) {
    elements.serviceSelect.addEventListener('change', () => {
      setStorage({ imageUploadService: elements.serviceSelect.value });
      updateImageGDriveUI(elements);
    });
  }

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
        renderImageHistory(elements);
      }
    });
  }

  // Clear history
  if (elements.clearHistoryBtn) {
    elements.clearHistoryBtn.addEventListener('click', async () => {
      await clearHistory('imageUploadHistory');
      await renderImageHistory(elements);
      showStatus('History cleared', StatusType.SUCCESS, getStatusElement());
    });
  }

  // Select folder
  if (elements.selectFolder) {
    elements.selectFolder.addEventListener('click', handleSelectFolder);
  }

  // Refresh files
  if (elements.refreshFiles) {
    elements.refreshFiles.addEventListener('click', async () => {
      if (!imageFolderHandle) {
        showStatus('Please select a folder first', StatusType.ERROR, getStatusElement());
        return;
      }

      if (imageFolderHandle) {
        const hasPermission = await checkFolderPermission(imageFolderHandle);
        if (!hasPermission) {
          try {
            await requestFolderPermission(imageFolderHandle);
          } catch (error) {
            showStatus('Permission denied. Please select folder again.', StatusType.ERROR, getStatusElement());
            return;
          }
        }
      }

      await updateImageFiles(elements);
      showStatus('Files refreshed', StatusType.SUCCESS, getStatusElement());
    });
  }

  // Select All button
  if (elements.selectAllBtn) {
    elements.selectAllBtn.addEventListener('click', () => {
      const checkboxes = elements.fileList.querySelectorAll('.file-checkbox:not(:disabled)');
      checkboxes.forEach(cb => cb.checked = true);
      const count = checkboxes.length;
      if (count > 0) {
        showStatus(`Selected ${count} file(s)`, StatusType.SUCCESS, getStatusElement());
      } else {
        showStatus('No files available to select', StatusType.WARNING, getStatusElement());
      }
    });
  }

  // Upload button
  if (elements.uploadBtn) {
    elements.uploadBtn.addEventListener('click', () => handleUploadImages(elements));
  }

  // Copy button
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(elements.outputText.value);
        showStatus('Copied to clipboard!', StatusType.SUCCESS, getStatusElement());
      } catch (error) {
        showStatus('Failed to copy', StatusType.ERROR, getStatusElement());
        await logErrorMessage('Failed to copy image links', error);
      }
    });
  }

  // Google Drive connect
  if (elements.gdriveConnect) {
    elements.gdriveConnect.addEventListener('click', handleGDriveConnect);
  }

  // Google Drive unlink
  if (elements.gdriveUnlink) {
    elements.gdriveUnlink.addEventListener('click', handleGDriveUnlink);
  }
}

/**
 * Handles folder selection
 * @returns {Promise<void>}
 */
async function handleSelectFolder() {
  try {
    imageFolderHandle = await window.showDirectoryPicker();
    await saveFolderHandle('imageFolderHandle', imageFolderHandle);
    await logInfo('Image folder selected', { name: imageFolderHandle.name });

    const elements = getElements();
    elements.folderPath.textContent = `Selected: ${imageFolderHandle.name}`;
    elements.folderPath.style.color = '#38ef7d';
    elements.detectedFiles.style.display = 'block'; // Show section immediately
    await updateImageFiles(elements);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + error.message, StatusType.ERROR, getStatusElement());
      await logErrorMessage('Failed to select image folder', error);
    }
  }
}

/**
 * Updates detected image files list
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function updateImageFiles(elements) {
  if (!imageFolderHandle) return;

  const timeFilter = parseInt(elements.timeFilter.value) || 20;
  const files = await scanFolder(imageFolderHandle, 'image', timeFilter, uploadedFiles);

  detectedImageFiles.clear();
  files.forEach(fileInfo => {
    detectedImageFiles.set(fileInfo.name, fileInfo);
  });

  // Save detected files to storage (without the File objects, just metadata)
  const filesToSave = files.map(f => ({
    name: f.name,
    size: f.size,
    lastModified: f.lastModified,
    type: f.type
  }));
  await setStorage({ detectedImageFiles: filesToSave });

  // Always show the detected files section
  elements.detectedFiles.style.display = 'block';

  if (files.length === 0) {
    elements.fileList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No files detected in selected folder</p>';
    return;
  }

  // Get upload history to find URLs for uploaded files
  const history = await getHistory('imageUploadHistory');
  const urlMap = new Map();
  history.forEach(item => {
    urlMap.set(item.fileName, item.url);
  });

  // Mark files as uploaded if they were previously uploaded
  const filesWithUploadStatus = files.map(f => ({
    ...f,
    uploaded: uploadedFiles.has(f.name),
    url: urlMap.get(f.name)
  }));

  const html = filesWithUploadStatus.map(f => createFileItemHtml(f)).join('');
  elements.fileList.innerHTML = html;
}

/**
 * Handles image upload
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleUploadImages(elements) {
  const filesToUpload = [];

  // Add files from file input
  if (elements.fileInput.files && elements.fileInput.files.length > 0) {
    filesToUpload.push(...Array.from(elements.fileInput.files));
  }

  // Add checked files from detected files
  const checkboxes = elements.fileList.querySelectorAll('.file-checkbox:checked:not(:disabled)');

  // If there are checked files, we need to ensure they have File objects
  if (checkboxes.length > 0 && imageFolderHandle) {
    // Re-scan folder to get File objects for selected files
    const checkedFilenames = Array.from(checkboxes).map(cb => cb.dataset.filename);

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

        // Scan folder to get File objects
        const timeFilter = parseInt(elements.timeFilter.value) || 1440; // Use large time filter
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
  }

  // Now add the checked files
  checkboxes.forEach(checkbox => {
    const filename = checkbox.dataset.filename;
    const fileInfo = detectedImageFiles.get(filename);
    if (fileInfo && fileInfo.file) {
      filesToUpload.push(fileInfo.file);
    }
  });

  if (filesToUpload.length === 0) {
    showStatus('Please select at least one image', StatusType.ERROR, getStatusElement());
    return;
  }

  const service = elements.serviceSelect ? elements.serviceSelect.value : 'catbox';

  // Validate service requirements
  if (service === 'imgur') {
    showStatus('Imgur upload requires API key configuration', StatusType.ERROR, getStatusElement());
    return;
  }

  if (service === 'gdrive') {
    const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
    if (!data.googleDriveSessionId || !data.googleDriveConnected) {
      showStatus('Please connect to Google Drive first', StatusType.ERROR, getStatusElement());
      return;
    }
  }

  // Start upload
  elements.uploadBtn.disabled = true;
  elements.progress.style.display = 'block';

  const urls = [];
  const uploadedFilenames = [];
  // Catbox is very sensitive to parallel requests - use sequential uploads
  const CONCURRENCY_LIMIT = service === 'catbox' ? 1 : 3;
  let completed = 0;

  try {
    // Process files in batches with concurrency limit
    for (let i = 0; i < filesToUpload.length; i += CONCURRENCY_LIMIT) {
      const batch = filesToUpload.slice(i, i + CONCURRENCY_LIMIT);

      const batchPromises = batch.map(async (file) => {
        // Validate file
        const validation = validateImageFile(file);
        if (!validation.valid) {
          await logWarning('Image validation failed', { file: file.name, error: validation.error });
          return {
            success: false,
            url: `Error: ${file.name} - ${validation.error}`,
            filename: file.name
          };
        }

        try {
          let url;
          if (service === 'gdrive') {
            const data = await getStorage(['googleDriveSessionId']);
            url = await uploadToGoogleDrive(file, data.googleDriveSessionId);
          } else {
            url = await uploadToCatbox(file);
          }

          // Add to history
          await addToHistory('imageUploadHistory', {
            fileName: file.name,
            url: url,
            timestamp: Date.now()
          });

          return {
            success: true,
            url: url,
            filename: file.name
          };
        } catch (error) {
          await logErrorMessage(`Failed to upload ${file.name}`, error);
          return {
            success: false,
            url: `Error: ${file.name} - ${error.message}`,
            filename: file.name
          };
        }
      });

      // Wait for all uploads in the batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      for (const settledResult of batchResults) {
        completed++;
        updateProgress(completed, filesToUpload.length, `Uploaded ${completed}/${filesToUpload.length}`, elements.progressFill, elements.progressText);

        if (settledResult.status === 'fulfilled') {
          const result = settledResult.value;
          urls.push(result.url);
          if (result.success) {
            uploadedFilenames.push(result.filename);
          }
        } else {
          // Handle rejected promise
          urls.push(`Error: Upload failed - ${settledResult.reason?.message || 'Unknown error'}`);
        }
      }
    }

    // Reverse so older uploads appear first, newer at the end
    elements.outputText.value = urls.reverse().join('\n');
    elements.outputSection.style.display = 'block';

    // Mark files as uploaded
    uploadedFilenames.forEach(filename => uploadedFiles.add(filename));
    await setStorage({ uploadedImageFiles: Array.from(uploadedFiles) });

    // Refresh list
    if (uploadedFilenames.length > 0 && imageFolderHandle) {
      await updateImageFiles(elements);
    }

    // Clear file input
    if (elements.fileInput) {
      elements.fileInput.value = '';
    }

    const successCount = urls.filter(u => !u.startsWith('Error')).length;
    showStatus(`Successfully uploaded ${successCount}/${filesToUpload.length} images!`, StatusType.SUCCESS, getStatusElement());

    setTimeout(() => {
      elements.progress.style.display = 'none';
    }, 2000);

    await logInfo('Image upload completed', { total: filesToUpload.length, success: successCount });
  } catch (error) {
    showStatus('Upload failed: ' + error.message, StatusType.ERROR, getStatusElement());
    await logErrorMessage('Image upload failed', error);
  } finally {
    elements.uploadBtn.disabled = false;
  }
}

/**
 * Renders upload history
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function renderImageHistory(elements) {
  const history = await getHistory('imageUploadHistory');

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
 * Updates Google Drive UI
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function updateImageGDriveUI(elements) {
  const service = elements.serviceSelect ? elements.serviceSelect.value : 'catbox';

  if (service === 'gdrive' && elements.gdriveConnection) {
    elements.gdriveConnection.style.display = 'block';
    await updateImageGDriveStatus(elements);
  } else if (elements.gdriveConnection) {
    elements.gdriveConnection.style.display = 'none';
  }
}

/**
 * Updates Google Drive connection status
 * @param {Object} [elements] - Optional DOM elements (will fetch if not provided)
 * @returns {Promise<void>}
 */
export async function updateImageGDriveStatus(elements) {
  if (!elements) {
    elements = getElements();
  }

  const data = await getStorage(['googleDriveConnected', 'googleDriveConnectedAt']);

  if (data.googleDriveConnected) {
    if (elements.gdriveConnect) elements.gdriveConnect.style.display = 'none';
    if (elements.gdriveUnlink) elements.gdriveUnlink.style.display = 'block';
    if (elements.gdriveStatus) {
      const date = new Date(data.googleDriveConnectedAt);
      elements.gdriveStatus.textContent = `Connected - ${formatDate(data.googleDriveConnectedAt)}`;
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
 * @returns {Promise<void>}
 */
async function handleGDriveConnect() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleDriveOAuth' });

    if (response.success) {
      showStatus('Connected to Google Drive!', StatusType.SUCCESS, getStatusElement());
      const elements = getElements();
      await updateImageGDriveStatus(elements);
      await logInfo('Connected to Google Drive from Upload Image tab');
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
 * @returns {Promise<void>}
 */
async function handleGDriveUnlink() {
  await setStorage({
    googleDriveSessionId: null,
    googleDriveConnected: false
  });

  showStatus('Disconnected from Google Drive', StatusType.SUCCESS, getStatusElement());
  const elements = getElements();
  await updateImageGDriveStatus(elements);
  await logInfo('Disconnected from Google Drive');
}

/**
 * Gets DOM elements (helper function)
 * @returns {Object} DOM elements
 */
function getElements() {
  return {
    serviceSelect: document.getElementById('image-service-select'),
    settingsBtn: document.getElementById('image-settings-btn'),
    settingsPanel: document.getElementById('image-settings-panel'),
    historyBtn: document.getElementById('image-history-btn'),
    historyPanel: document.getElementById('image-history-panel'),
    historyList: document.getElementById('image-history-list'),
    clearHistoryBtn: document.getElementById('clear-image-history'),
    selectFolder: document.getElementById('image-select-folder'),
    folderPath: document.getElementById('image-folder-path'),
    timeFilter: document.getElementById('image-time-filter'),
    detectedFiles: document.getElementById('image-detected-files'),
    fileList: document.getElementById('image-file-list'),
    refreshFiles: document.getElementById('image-refresh-files'),
    selectAllBtn: document.getElementById('image-select-all'),
    fileInput: document.getElementById('image-file-input'),
    uploadBtn: document.getElementById('upload-images-btn'),
    progress: document.getElementById('image-progress'),
    progressFill: document.getElementById('image-progress-fill'),
    progressText: document.getElementById('image-progress-text'),
    outputSection: document.getElementById('image-output-section'),
    outputText: document.getElementById('image-output-text'),
    copyBtn: document.getElementById('image-copy-btn'),
    gdriveConnection: document.getElementById('image-gdrive-connection'),
    gdriveConnect: document.getElementById('image-gdrive-connect'),
    gdriveUnlink: document.getElementById('image-gdrive-unlink'),
    gdriveStatus: document.getElementById('image-gdrive-status')
  };
}
