/**
 * LinkCaster - Main Entry Point
 * Coordinates all modules and initializes the extension
 * @module popup
 */

import { initTheme } from './modules/theme.js';
import { initTabs, getCurrentTab } from './modules/tabs.js';
import { initConvertTab, updateApiUI, updateConvertGDriveStatus } from './modules/convertTab.js';
import { initUploadImageTab, updateImageGDriveStatus } from './modules/uploadImageTab.js';
import { initUploadVideoTab, updateGDriveUI, updateGDriveStatus } from './modules/uploadVideoTab.js';
import { logInfo, logErrorMessage } from './modules/errorLogger.js';

/**
 * Gets all DOM element references for Convert tab
 * @returns {Object} Convert tab DOM elements
 */
function getConvertTabElements() {
  return {
    convertSettingsBtn: document.getElementById('convert-settings-btn'),
    convertSettingsPanel: document.getElementById('convert-settings-panel'),
    inputText: document.getElementById('input-text'),
    outputText: document.getElementById('output-text'),
    replaceBtn: document.getElementById('replace-btn'),
    clearBtn: document.getElementById('clear-btn'),
    copyBtn: document.getElementById('copy-btn'),
    hostSelect: document.getElementById('host-select'),
    serviceInfo: document.getElementById('service-info'),
    apiSettings: document.getElementById('api-settings'),
    oauthContainer: document.getElementById('oauth-container'),
    oauthConnect: document.getElementById('oauth-connect'),
    oauthText: document.getElementById('oauth-text'),
    oauthStatus: document.getElementById('oauth-status'),
    apiKey: document.getElementById('api-key'),
    apiLabel: document.getElementById('api-label'),
    apiHelp: document.getElementById('api-help'),
    apiLink: document.getElementById('api-link'),
    saveApiKey: document.getElementById('save-api-key'),
    settingsToggle: document.getElementById('settings-toggle'),
    apiWarning: document.getElementById('api-warning'),
    progressSection: document.getElementById('progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    outputSection: document.getElementById('output-section'),
    statusDiv: document.getElementById('status'),
    convertGdriveConnection: document.getElementById('convert-gdrive-connection'),
    convertGdriveConnect: document.getElementById('convert-gdrive-connect'),
    convertGdriveUnlink: document.getElementById('convert-gdrive-unlink'),
    convertGdriveStatus: document.getElementById('convert-gdrive-status'),
    convertHistoryBtn: document.getElementById('convert-history-btn'),
    convertHistoryPanel: document.getElementById('convert-history-panel'),
    convertHistoryList: document.getElementById('convert-history-list'),
    clearConvertHistory: document.getElementById('clear-convert-history')
  };
}

/**
 * Handles storage changes from other tabs/windows
 * @param {Object} changes - Changes object
 * @param {string} areaName - Storage area name
 * @returns {Promise<void>}
 */
async function handleStorageChange(changes, areaName) {
  if (areaName === 'local') {
    // Google Drive connection changes - update all status displays
    if (changes.googleDriveConnected || changes.googleDriveSessionId) {
      try {
        // Update Convert tab GDrive status
        const convertElements = getConvertTabElements();
        if (convertElements.convertGdriveStatus) {
          await updateConvertGDriveStatus(convertElements);
        }

        // Update Upload Image tab GDrive status
        const imageElements = {
          gdriveConnection: document.getElementById('image-gdrive-connection'),
          gdriveConnect: document.getElementById('image-gdrive-connect'),
          gdriveUnlink: document.getElementById('image-gdrive-unlink'),
          gdriveStatus: document.getElementById('image-gdrive-status')
        };
        if (imageElements.gdriveStatus) {
          await updateImageGDriveStatus(imageElements);
        }

        // Update Upload Video tab GDrive status
        const videoElements = {
          uploadSection: document.getElementById('gdrive-upload-section'),
          gdriveConnect: document.getElementById('video-gdrive-connect'),
          gdriveUnlink: document.getElementById('video-gdrive-unlink'),
          gdriveStatus: document.getElementById('video-gdrive-status')
        };
        if (videoElements.gdriveStatus) {
          await updateGDriveStatus(videoElements);
        }

        await logInfo('Google Drive connection status updated across tabs');
      } catch (error) {
        await logErrorMessage('Failed to update Google Drive status', error);
      }
    }
  }
}

/**
 * Main initialization function
 * @returns {Promise<void>}
 */
async function init() {
  try {
    await logInfo('LinkCaster popup initializing');

    // Get DOM elements
    const themeToggle = document.getElementById('theme-toggle');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const convertTabElements = getConvertTabElements();

    // Initialize modules
    await initTheme(themeToggle);
    await initTabs(tabButtons, tabContents);
    await initConvertTab(convertTabElements);
    await initUploadImageTab(); // Uses internal getElements()
    await initUploadVideoTab(); // Uses internal getElements()

    // Setup storage change listener
    chrome.storage.onChanged.addListener(handleStorageChange);

    await logInfo('LinkCaster popup initialized successfully');
  } catch (error) {
    await logErrorMessage('Failed to initialize LinkCaster', error);
    console.error('Initialization error:', error);

    // Show error to user
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.textContent = 'Failed to initialize extension. Please refresh the page.';
      statusDiv.className = 'status error';
      statusDiv.style.display = 'block';
    }
  }
}

/**
 * Start initialization when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Export for debugging
 */
if (typeof window !== 'undefined') {
  window.LinkCaster = {
    getCurrentTab,
    logInfo,
    logErrorMessage
  };
}
