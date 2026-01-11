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
 * @param {Object} elements - DOM elements for the tab
 * @returns {Promise<void>}
 */
export async function initUploadVideoTab(elements) {
  await loadSettings(elements);
  await loadFolderHandle();
  await loadUploadedFiles();
  await renderVideoHistory(elements);
  await updateGDriveUI(elements);
  setupEventListeners(elements);

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
      if (videoFolderHandle) {
        const hasPermission = await checkFolderPermission(videoFolderHandle);
        if (!hasPermission) {
          try {
            await requestFolderPermission(videoFolderHandle);
          } catch (error) {
            showStatus('Permission denied. Please select folder again.', StatusType.ERROR);
            return;
          }
        }
      }

      await updateVideoFiles(elements);
      showStatus('Files refreshed', StatusType.SUCCESS);
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
        showStatus('Copied to clipboard!', StatusType.SUCCESS);
      } catch (error) {
        showStatus('Failed to copy', StatusType.ERROR);
        await logErrorMessage('Failed to copy video link', error);
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

  // First-time connect button
  if (elements.gdriveConnectFirst) {
    elements.gdriveConnectFirst.addEventListener('click', handleGDriveConnect);
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
      showStatus('Failed to select folder: ' + error.message, StatusType.ERROR);
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

  if (files.length === 0) {
    elements.detectedFiles.style.display = 'none';
    return;
  }

  const html = files.map(f => createFileItemHtml(f)).join('');
  elements.fileList.innerHTML = html;
  elements.detectedFiles.style.display = 'block';
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
    filesToUpload.push(elements.fileInput.files[0]); // Only one video at a time
  }

  // Add checked file from detected files (only one)
  const checkbox = elements.fileList.querySelector('.file-checkbox:checked:not(:disabled)');
  if (checkbox) {
    const filename = checkbox.dataset.filename;
    const fileInfo = detectedVideoFiles.get(filename);
    if (fileInfo && fileInfo.file) {
      filesToUpload.push(fileInfo.file);
    }
  }

  if (filesToUpload.length === 0) {
    showStatus('Please select a video file', StatusType.ERROR);
    return;
  }

  // Check Google Drive connection
  const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
  if (!data.googleDriveSessionId || !data.googleDriveConnected) {
    showStatus('Please connect to Google Drive first', StatusType.ERROR);
    return;
  }

  const file = filesToUpload[0];

  // Validate file
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    showStatus(validation.error, StatusType.ERROR);
    await logWarning('Video validation failed', { file: file.name, error: validation.error });
    return;
  }

  // Start upload
  elements.uploadBtn.disabled = true;
  elements.progress.style.display = 'block';
  updateProgress(0, 1, 'Uploading video...', elements.progressFill, elements.progressText);

  try {
    const url = await uploadToGoogleDrive(file, data.googleDriveSessionId);

    elements.outputText.value = url;
    elements.outputSection.style.display = 'block';

    // Mark file as uploaded
    uploadedVideoFiles.add(file.name);
    await setStorage({ uploadedVideoFiles: Array.from(uploadedVideoFiles) });

    // Add to history
    await addToHistory('videoUploadHistory', {
      fileName: file.name,
      url: url,
      timestamp: Date.now()
    });

    // Refresh list
    if (videoFolderHandle) {
      await updateVideoFiles(elements);
    }

    // Clear file input
    if (elements.fileInput) {
      elements.fileInput.value = '';
    }

    updateProgress(1, 1, 'Upload complete!', elements.progressFill, elements.progressText);
    showStatus('Video uploaded successfully!', StatusType.SUCCESS);

    setTimeout(() => {
      elements.progress.style.display = 'none';
    }, 2000);

    await logInfo('Video upload completed', { file: file.name });
  } catch (error) {
    // Check for session expiry
    if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
      await setStorage({ googleDriveConnected: false });
      await updateGDriveUI(elements);
      showStatus('⚠️ Google Drive session expired. Please reconnect.', StatusType.ERROR);
      alert('⚠️ Google Drive session expired!\n\nPlease reconnect to Google Drive in Settings (⚙️) to continue uploading.');
    } else {
      showStatus('Upload failed: ' + error.message, StatusType.ERROR);
    }

    await logErrorMessage('Video upload failed', error);
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
 * Updates Google Drive UI visibility
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateGDriveUI(elements) {
  const data = await getStorage(['googleDriveConnected']);

  if (data.googleDriveConnected) {
    // Show upload section, hide first-time prompt
    if (elements.firstTimePrompt) elements.firstTimePrompt.style.display = 'none';
    if (elements.uploadSection) elements.uploadSection.style.display = 'block';
    await updateGDriveStatus(elements);
  } else {
    // Show first-time prompt, hide upload section
    if (elements.firstTimePrompt) elements.firstTimePrompt.style.display = 'block';
    if (elements.uploadSection) elements.uploadSection.style.display = 'none';
  }
}

/**
 * Updates Google Drive connection status
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateGDriveStatus(elements) {
  const data = await getStorage(['googleDriveConnected', 'googleDriveConnectedAt']);

  if (data.googleDriveConnected) {
    elements.gdriveConnect.style.display = 'none';
    elements.gdriveUnlink.style.display = 'block';
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
      await updateGDriveUI(elements);
      await logInfo('Connected to Google Drive from Upload Video tab');
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
  await updateGDriveUI(elements);
  await logInfo('Disconnected from Google Drive');
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
    firstTimePrompt: document.getElementById('gdrive-first-time'),
    uploadSection: document.getElementById('gdrive-upload-section'),
    gdriveConnect: document.getElementById('gdrive-connect'),
    gdriveUnlink: document.getElementById('gdrive-unlink'),
    gdriveStatus: document.getElementById('gdrive-status'),
    gdriveConnectFirst: document.getElementById('gdrive-connect-first')
  };
}
