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
 * @param {Object} elements - DOM elements for the tab
 * @returns {Promise<void>}
 */
export async function initUploadImageTab(elements) {
  await loadSettings(elements);
  await loadFolderHandle();
  await renderImageHistory(elements);
  setupEventListeners(elements);

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
      showStatus('History cleared', StatusType.SUCCESS);
    });
  }

  // Select folder
  if (elements.selectFolder) {
    elements.selectFolder.addEventListener('click', handleSelectFolder);
  }

  // Refresh files
  if (elements.refreshFiles) {
    elements.refreshFiles.addEventListener('click', async () => {
      if (imageFolderHandle) {
        const hasPermission = await checkFolderPermission(imageFolderHandle);
        if (!hasPermission) {
          try {
            await requestFolderPermission(imageFolderHandle);
          } catch (error) {
            showStatus('Permission denied. Please select folder again.', StatusType.ERROR);
            return;
          }
        }
      }

      await updateImageFiles(elements);
      showStatus('Files refreshed', StatusType.SUCCESS);
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
        showStatus('Copied to clipboard!', StatusType.SUCCESS);
      } catch (error) {
        showStatus('Failed to copy', StatusType.ERROR);
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
    await updateImageFiles(elements);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + error.message, StatusType.ERROR);
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

  if (files.length === 0) {
    elements.detectedFiles.style.display = 'none';
    return;
  }

  const html = files.map(f => createFileItemHtml(f)).join('');
  elements.fileList.innerHTML = html;
  elements.detectedFiles.style.display = 'block';
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
  checkboxes.forEach(checkbox => {
    const filename = checkbox.dataset.filename;
    const fileInfo = detectedImageFiles.get(filename);
    if (fileInfo && fileInfo.file) {
      filesToUpload.push(fileInfo.file);
    }
  });

  if (filesToUpload.length === 0) {
    showStatus('Please select at least one image', StatusType.ERROR);
    return;
  }

  const service = elements.serviceSelect ? elements.serviceSelect.value : 'catbox';

  // Validate service requirements
  if (service === 'imgur') {
    showStatus('Imgur upload requires API key configuration', StatusType.ERROR);
    return;
  }

  if (service === 'gdrive') {
    const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
    if (!data.googleDriveSessionId || !data.googleDriveConnected) {
      showStatus('Please connect to Google Drive first', StatusType.ERROR);
      return;
    }
  }

  // Start upload
  elements.uploadBtn.disabled = true;
  elements.progress.style.display = 'block';

  const urls = [];
  const uploadedFilenames = [];
  let completed = 0;

  try {
    for (const file of filesToUpload) {
      // Validate file
      const validation = validateImageFile(file);
      if (!validation.valid) {
        await logWarning('Image validation failed', { file: file.name, error: validation.error });
        urls.push(`Error: ${file.name} - ${validation.error}`);
        completed++;
        continue;
      }

      try {
        let url;
        if (service === 'gdrive') {
          const data = await getStorage(['googleDriveSessionId']);
          url = await uploadToGoogleDrive(file, data.googleDriveSessionId);
        } else {
          url = await uploadToCatbox(file);
        }

        urls.push(url);
        uploadedFilenames.push(file.name);

        // Add to history
        await addToHistory('imageUploadHistory', {
          fileName: file.name,
          url: url,
          timestamp: Date.now()
        });

        completed++;
        updateProgress(completed, filesToUpload.length, `Uploaded ${completed}/${filesToUpload.length}`, elements.progressFill, elements.progressText);
      } catch (error) {
        await logErrorMessage(`Failed to upload ${file.name}`, error);
        urls.push(`Error: ${file.name} - ${error.message}`);
        completed++;
      }
    }

    elements.outputText.value = urls.join('\n');
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
    showStatus(`Successfully uploaded ${successCount}/${filesToUpload.length} images!`, StatusType.SUCCESS);

    setTimeout(() => {
      elements.progress.style.display = 'none';
    }, 2000);

    await logInfo('Image upload completed', { total: filesToUpload.length, success: successCount });
  } catch (error) {
    showStatus('Upload failed: ' + error.message, StatusType.ERROR);
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
      showStatus('Link copied!', StatusType.SUCCESS);
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
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateImageGDriveStatus(elements) {
  const data = await getStorage(['googleDriveConnected', 'googleDriveConnectedAt']);

  if (data.googleDriveConnected) {
    elements.gdriveConnect.style.display = 'none';
    elements.gdriveUnlink.style.display = 'block';
    const date = new Date(data.googleDriveConnectedAt);
    elements.gdriveStatus.textContent = `Connected - ${formatDate(data.googleDriveConnectedAt)}`;
    elements.gdriveStatus.style.color = '#38ef7d';
  } else {
    elements.gdriveConnect.style.display = 'block';
    elements.gdriveUnlink.style.display = 'none';
    elements.gdriveStatus.textContent = 'Not connected';
    elements.gdriveStatus.style.color = 'var(--text-dimmed)';
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
      showStatus('Connected to Google Drive!', StatusType.SUCCESS);
      const elements = getElements();
      await updateImageGDriveStatus(elements);
      await logInfo('Connected to Google Drive from Upload Image tab');
    } else {
      showStatus('Failed to connect: ' + response.error, StatusType.ERROR);
      await logErrorMessage('Google Drive connection failed', new Error(response.error));
    }
  } catch (error) {
    showStatus('Connection failed: ' + error.message, StatusType.ERROR);
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

  showStatus('Disconnected from Google Drive', StatusType.SUCCESS);
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
