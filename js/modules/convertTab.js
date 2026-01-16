/**
 * Convert Tab Module
 * Handles image link conversion functionality
 * @module convertTab
 */

import { logErrorMessage, logInfo, withErrorLogging } from './errorLogger.js';
import { isValidImageUrl, extractValidUrls } from './validator.js';
import { showStatus, updateProgress, StatusType, formatDate } from './uiHelpers.js';
import { getStorage, setStorage, addToHistory, getHistory, clearHistory } from './storage.js';
import { uploadToCatbox, uploadToGoogleDrive, downloadImage, getDirectImageUrl } from './uploadServices.js';

/**
 * Configuration for API links and OAuth
 * @constant {Object}
 */
export const API_LINKS = {
  vgy: 'https://vgy.me/account/details',
  flickr: 'https://www.flickr.com/services/apps/create/apply',
  gyazo: 'https://gyazo.com/oauth/applications'
};

/**
 * Service information text
 * @constant {Object}
 */
export const SERVICE_INFO = {
  vgy: 'Requires user key',
  flickr: 'Requires OAuth authentication',
  gyazo: 'Requires access token'
};

/**
 * Initializes the Convert tab
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function initConvertTab(elements) {
  await loadSavedState(elements);
  setupEventListeners(elements);
}

/**
 * Loads saved state from storage
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function loadSavedState(elements) {
  try {
    const localData = await getStorage(['inputText', 'outputText', 'outputVisible']);
    const syncData = await getStorage(['selectedHost', 'vgyApiKey', 'flickrApiKey'], 'sync');

    if (localData.inputText) elements.inputText.value = localData.inputText;
    if (localData.outputText) elements.outputText.value = localData.outputText;
    if (localData.outputVisible) elements.outputSection.style.display = 'block';

    elements.hostSelect.value = syncData.selectedHost || 'catbox';

    // Update API UI to show service-specific settings
    await updateApiUI(elements);

    await logInfo('Convert tab state loaded');
  } catch (error) {
    await logErrorMessage('Failed to load convert tab state', error);
  }
}

/**
 * Sets up event listeners for Convert tab
 * @param {Object} elements - DOM elements
 * @returns {void}
 */
function setupEventListeners(elements) {
  // Convert tab settings button toggle
  if (elements.convertSettingsBtn) {
    elements.convertSettingsBtn.addEventListener('click', () => {
      const isVisible = elements.convertSettingsPanel.style.display === 'block';
      elements.convertSettingsPanel.style.display = isVisible ? 'none' : 'block';
      // Hide history panel when showing settings
      if (!isVisible && elements.convertHistoryPanel) {
        elements.convertHistoryPanel.style.display = 'none';
      }
    });
  }

  // Convert tab history button toggle
  if (elements.convertHistoryBtn) {
    elements.convertHistoryBtn.addEventListener('click', () => {
      const isVisible = elements.convertHistoryPanel.style.display === 'block';
      elements.convertHistoryPanel.style.display = isVisible ? 'none' : 'block';
      // Hide settings panel when showing history
      if (!isVisible && elements.convertSettingsPanel) {
        elements.convertSettingsPanel.style.display = 'none';
      }
      // Render history when opening panel
      if (!isVisible) {
        renderConvertHistory(elements);
      }
    });
  }

  // Clear history button
  if (elements.clearConvertHistory) {
    elements.clearConvertHistory.addEventListener('click', () => handleClearConvertHistory(elements));
  }

  elements.replaceBtn.addEventListener('click', () => handleReplace(elements));
  elements.clearBtn.addEventListener('click', () => handleClear(elements));
  elements.copyBtn.addEventListener('click', () => handleCopy(elements));
  elements.hostSelect.addEventListener('change', () => handleHostChange(elements));
  elements.saveApiKey.addEventListener('click', () => handleSaveApiKey(elements));

  // Google Drive event listeners
  if (elements.convertGdriveConnect) {
    elements.convertGdriveConnect.addEventListener('click', () => handleConvertGDriveConnect(elements));
  }
  if (elements.convertGdriveUnlink) {
    elements.convertGdriveUnlink.addEventListener('click', () => handleConvertGDriveUnlink(elements));
  }

  // Auto-save input text with debouncing
  let saveTimeout;
  elements.inputText.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      setStorage({ inputText: elements.inputText.value });
    }, 500);
  });
}

/**
 * Handles host selection change
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleHostChange(elements) {
  await setStorage({ selectedHost: elements.hostSelect.value }, 'sync');
  await updateApiUI(elements);
}

/**
 * Updates API UI based on selected host
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateApiUI(elements) {
  const host = elements.hostSelect.value;

  // Hide all settings panels first
  elements.apiSettings.style.display = 'none';
  if (elements.convertGdriveConnection) {
    elements.convertGdriveConnection.style.display = 'none';
  }

  // Show appropriate panel based on selected service
  if (host === 'vgy') {
    elements.apiSettings.style.display = 'block';
  } else if (host === 'gdrive' && elements.convertGdriveConnection) {
    elements.convertGdriveConnection.style.display = 'block';
    // Update Google Drive status from shared storage
    await updateConvertGDriveStatus(elements);
  }
}

/**
 * Checks API key status and shows warning if needed
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function checkApiKeyStatus(elements) {
  const host = elements.hostSelect.value;
  const needsApi = ['vgy', 'flickr', 'gyazo'].includes(host);

  if (!needsApi) {
    elements.apiWarning.style.display = 'none';
    return;
  }

  try {
    const data = await getStorage([
      'flickrOAuthToken',
      'flickrOAuthTokenSecret',
      'vgyApiKey',
      'gyazoAccessToken'
    ], 'sync');

    let hasKey = false;
    if (host === 'flickr') {
      hasKey = !!(data.flickrOAuthToken && data.flickrOAuthTokenSecret);
    } else if (host === 'vgy') {
      hasKey = !!data.vgyApiKey;
    } else if (host === 'gyazo') {
      hasKey = !!data.gyazoAccessToken;
    }

    elements.apiWarning.style.display = hasKey ? 'none' : 'block';
  } catch (error) {
    await logErrorMessage('Failed to check API key status', error);
  }
}

/**
 * Handles settings toggle click
 * @param {Object} elements - DOM elements
 * @returns {void}
 */
function handleSettingsToggle(elements) {
  const isExpanded = elements.apiSettings.style.display === 'block';
  elements.apiSettings.style.display = isExpanded ? 'none' : 'block';
}

/**
 * Handles save API key button click
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleSaveApiKey(elements) {
  const key = elements.apiKey.value.trim();
  const host = elements.hostSelect.value;

  if (!key) {
    showStatus('Please enter valid credentials', StatusType.ERROR);
    return;
  }

  const storageKey = host === 'vgy' ? 'vgyApiKey' :
    host === 'gyazo' ? 'gyazoAccessToken' :
      host === 'flickr' ? 'flickrApiKey' : null;

  if (storageKey) {
    await setStorage({ [storageKey]: key }, 'sync');
    showStatus('Settings saved successfully!', StatusType.SUCCESS);
    await checkApiKeyStatus(elements);
    elements.apiSettings.style.display = 'none';
    await logInfo('API key saved', { host });
  }
}

/**
 * Handles clear button click
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleClear(elements) {
  elements.inputText.value = '';
  elements.outputText.value = '';
  elements.outputSection.style.display = 'none';
  elements.statusDiv.style.display = 'none';
  elements.progressSection.style.display = 'none';

  await setStorage({
    inputText: '',
    outputText: '',
    outputVisible: false
  });

  await logInfo('Convert tab cleared');
}

/**
 * Handles copy button click
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleCopy(elements) {
  try {
    await navigator.clipboard.writeText(elements.outputText.value);
    showStatus('Copied to clipboard!', StatusType.SUCCESS);
    await logInfo('Output copied to clipboard');
  } catch (error) {
    showStatus('Failed to copy: ' + error.message, StatusType.ERROR);
    await logErrorMessage('Failed to copy to clipboard', error);
  }
}

/**
 * Handles replace/convert button click
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleReplace(elements) {
  const input = elements.inputText.value.trim();

  if (!input) {
    showStatus('Please paste some links first', StatusType.ERROR);
    return;
  }

  const host = elements.hostSelect.value;

  // Validate service requirements
  const validationResult = await validateServiceRequirements(host);
  if (!validationResult.valid) {
    showStatus(validationResult.error, StatusType.ERROR);
    return;
  }

  // Extract and validate URLs
  const urls = extractValidUrls(input).filter(url => isValidImageUrl(url));

  if (urls.length === 0) {
    showStatus('No valid image links found', StatusType.ERROR);
    return;
  }

  await logInfo('Starting link conversion', { count: urls.length, host });

  // Start processing
  elements.replaceBtn.disabled = true;
  elements.progressSection.style.display = 'block';
  elements.outputSection.style.display = 'none';
  elements.statusDiv.style.display = 'none';

  const results = await processUrls(urls, host, elements);

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  elements.progressSection.style.display = 'none';
  elements.replaceBtn.disabled = false;

  if (successCount === 0) {
    elements.outputSection.style.display = 'none';
    const errorMessage = results[0]?.error || 'Something went wrong';
    showStatus(errorMessage, StatusType.ERROR);
    await setStorage({ outputVisible: false });
    await logErrorMessage('All conversions failed', { results });
  } else {
    const convertedText = replaceUrlsInText(input, results);
    elements.outputText.value = convertedText;
    elements.outputSection.style.display = 'block';

    await setStorage({
      outputText: convertedText,
      outputVisible: true
    });

    if (failCount === 0) {
      showStatus(`Successfully converted ${successCount} image(s)!`, StatusType.SUCCESS);
    } else {
      showStatus(`Converted ${successCount} image(s), ${failCount} failed`, StatusType.INFO);
    }

    await logInfo('Conversion completed', { successCount, failCount });
  }
}

/**
 * Validates service requirements (API keys, OAuth, etc.)
 * @param {string} host - Selected host service
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
async function validateServiceRequirements(host) {
  if (host === 'gdrive') {
    const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
    if (!data.googleDriveSessionId || !data.googleDriveConnected) {
      return { valid: false, error: 'Please connect to Google Drive first' };
    }
  } else if (host === 'flickr') {
    const data = await getStorage(['flickrOAuthToken', 'flickrOAuthTokenSecret'], 'sync');
    if (!data.flickrOAuthToken || !data.flickrOAuthTokenSecret) {
      return { valid: false, error: 'Please authenticate with Flickr first' };
    }
  } else if (host === 'vgy') {
    const data = await getStorage(['vgyApiKey'], 'sync');
    if (!data.vgyApiKey) {
      return { valid: false, error: 'Please configure vgy.me user key first' };
    }
  } else if (host === 'gyazo') {
    const data = await getStorage(['gyazoAccessToken'], 'sync');
    if (!data.gyazoAccessToken) {
      return { valid: false, error: 'Please authenticate with Gyazo first' };
    }
  }

  return { valid: true };
}

/**
 * Processes multiple URLs for conversion with parallel processing
 * @param {string[]} urls - URLs to process
 * @param {string} host - Target host
 * @param {Object} elements - DOM elements
 * @returns {Promise<Array>} Processing results
 */
async function processUrls(urls, host, elements) {
  const results = [];
  const total = urls.length;
  // Catbox is very sensitive to parallel requests - use sequential uploads
  const CONCURRENCY_LIMIT = host === 'catbox' ? 1 : 3;
  let completed = 0;
  let sessionExpired = false;

  // Process URLs in batches with concurrency limit
  for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
    if (sessionExpired) break;

    const batch = urls.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batch.map(async (url) => {
      try {
        const result = await processUrl(url, host);

        // Save successful conversions to history
        if (result.success && result.new !== result.original) {
          await addToHistory('convertHistory', {
            originalUrl: result.original,
            convertedUrl: result.new,
            service: host,
            timestamp: Date.now()
          });
        }

        return result;
      } catch (error) {
        if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
          sessionExpired = true;
          throw error;
        }

        return {
          original: url,
          new: url,
          success: false,
          error: error.message
        };
      }
    });

    // Wait for all promises in the batch to settle
    const batchResults = await Promise.allSettled(batchPromises);

    for (const settledResult of batchResults) {
      completed++;
      updateProgress(completed, total, `Processing ${completed}/${total}...`, elements.progressFill, elements.progressText);

      if (settledResult.status === 'fulfilled') {
        results.push(settledResult.value);
      } else {
        // Handle session expiry
        if (settledResult.reason?.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
          await setStorage({ googleDriveConnected: false });
          elements.progressSection.style.display = 'none';
          elements.replaceBtn.disabled = false;
          elements.convertSettingsPanel.style.display = 'block';
          await updateApiUI(elements);
          showStatus('⚠️ Google Drive session expired. Please reconnect in Settings.', StatusType.ERROR, elements.statusDiv);
          alert('⚠️ Google Drive session expired!\n\nPlease reconnect to Google Drive in Settings (⚙️) to continue converting images.');
          return results;
        }

        // Handle other errors
        results.push({
          original: batch[batchResults.indexOf(settledResult)],
          new: batch[batchResults.indexOf(settledResult)],
          success: false,
          error: settledResult.reason?.message || 'Unknown error'
        });
      }
    }
  }

  updateProgress(total, total, 'Complete!', elements.progressFill, elements.progressText);
  return results;
}

/**
 * Processes a single URL
 * @param {string} url - URL to process
 * @param {string} host - Target host
 * @returns {Promise<{original: string, new: string, success: boolean, error?: string}>} Result
 */
async function processUrl(url, host) {
  const wrappedFn = withErrorLogging(async () => {
    try {
      // Get direct image URL (handles page URLs like prnt.sc)
      const directUrl = await getDirectImageUrl(url);

      // Download image from direct URL
      const imageBlob = await downloadImage(directUrl);

      // Upload to selected host
      let newUrl;
      if (host === 'catbox') {
        newUrl = await uploadToCatbox(imageBlob);
      } else if (host === 'gdrive') {
        // Get Google Drive session ID
        const data = await getStorage(['googleDriveSessionId', 'googleDriveConnected']);
        if (!data.googleDriveSessionId || !data.googleDriveConnected) {
          throw new Error('Google Drive not connected. Please connect in settings.');
        }
        newUrl = await uploadToGoogleDrive(imageBlob, data.googleDriveSessionId);
      } else if (host === 'vgy') {
        // Get vgy API key
        const data = await getStorage(['vgyApiKey'], 'sync');
        if (!data.vgyApiKey) {
          throw new Error('vgy.me API key not configured. Please add your key in settings.');
        }

        // Create form data for vgy.me upload
        const formData = new FormData();
        formData.append('userkey', data.vgyApiKey);
        formData.append('file', imageBlob, 'image.jpg');

        const response = await fetch('https://vgy.me/upload', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'vgy.me upload failed');
        }

        newUrl = result.image;
      } else {
        throw new Error(`Unsupported host: ${host}`);
      }

      return {
        original: url,
        new: newUrl,
        success: true
      };
    } catch (error) {
      // Check for Google Drive session expiry
      if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
        throw error; // Re-throw to be handled by processUrls
      }

      return {
        original: url,
        new: '',
        success: false,
        error: error.message
      };
    }
  }, 'processUrl');

  return wrappedFn();
}

/**
 * Replaces URLs in text with converted URLs
 * @param {string} originalText - Original text with URLs
 * @param {Array} results - Conversion results
 * @returns {string} Text with replaced URLs
 */
function replaceUrlsInText(originalText, results) {
  let newText = originalText;

  results.forEach(result => {
    if (result.success) {
      newText = newText.replace(result.original, result.new);
    }
  });

  return newText;
}

/**
 * Updates Convert tab Google Drive connection status
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateConvertGDriveStatus(elements) {
  const data = await getStorage(['googleDriveConnected', 'googleDriveConnectedAt']);

  if (data.googleDriveConnected) {
    if (elements.convertGdriveConnect) elements.convertGdriveConnect.style.display = 'none';
    if (elements.convertGdriveUnlink) elements.convertGdriveUnlink.style.display = 'block';
    if (elements.convertGdriveStatus) {
      const date = data.googleDriveConnectedAt ? new Date(data.googleDriveConnectedAt).toLocaleDateString() : 'Unknown';
      elements.convertGdriveStatus.textContent = `Connected - ${date}`;
      elements.convertGdriveStatus.style.color = '#38ef7d';
    }
  } else {
    if (elements.convertGdriveConnect) elements.convertGdriveConnect.style.display = 'block';
    if (elements.convertGdriveUnlink) elements.convertGdriveUnlink.style.display = 'none';
    if (elements.convertGdriveStatus) {
      elements.convertGdriveStatus.textContent = 'Not connected';
      elements.convertGdriveStatus.style.color = 'var(--text-dimmed)';
    }
  }
}

/**
 * Handles Convert tab Google Drive connect
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleConvertGDriveConnect(elements) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleDriveOAuth' });

    if (response.success) {
      showStatus('Connected to Google Drive!', StatusType.SUCCESS, elements.statusDiv);
      await updateConvertGDriveStatus(elements);
      await logInfo('Connected to Google Drive from Convert tab');
    } else {
      showStatus('Failed to connect: ' + response.error, StatusType.ERROR, elements.statusDiv);
      await logErrorMessage('Google Drive connection failed', new Error(response.error));
    }
  } catch (error) {
    showStatus('Connection failed: ' + error.message, StatusType.ERROR, elements.statusDiv);
    await logErrorMessage('Google Drive connection error', error);
  }
}

/**
 * Handles Convert tab Google Drive unlink
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleConvertGDriveUnlink(elements) {
  await setStorage({
    googleDriveSessionId: null,
    googleDriveConnected: false
  });

  showStatus('Disconnected from Google Drive', StatusType.SUCCESS, elements.statusDiv);
  await updateConvertGDriveStatus(elements);
  await logInfo('Disconnected from Google Drive from Convert tab');
}

/**
 * Renders conversion history
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function renderConvertHistory(elements) {
  const history = await getHistory('convertHistory');

  if (!history || history.length === 0) {
    elements.convertHistoryList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No uploads yet</p>';
    return;
  }

  const html = history.map(item => {
    const date = formatDate(item.timestamp);
    const serviceName = item.service === 'catbox' ? 'Catbox.moe' :
      item.service === 'gdrive' ? 'Google Drive' :
        item.service === 'vgy' ? 'vgy.me' : item.service;

    return `
      <div class="history-item" style="padding: 12px; margin-bottom: 8px; background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 11px; color: var(--text-dimmed); margin-bottom: 4px;">${date}</div>
            <div style="font-size: 10px; color: var(--text-muted);">
              <span style="color: #667eea; font-weight: 600;">${serviceName}</span>
            </div>
          </div>
        </div>
        <div style="margin-bottom: 6px;">
          <div style="font-size: 10px; color: var(--text-dimmed); margin-bottom: 2px;">Original:</div>
          <a href="${item.originalUrl}" target="_blank" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; text-decoration: none; display: block; padding: 4px 6px; background: var(--bg-tertiary); border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.color='#667eea'" onmouseout="this.style.color='var(--text-secondary)'">${item.originalUrl}</a>
        </div>
        <div>
          <div style="font-size: 10px; color: var(--text-dimmed); margin-bottom: 2px;">Converted:</div>
          <a href="${item.convertedUrl}" target="_blank" style="font-size: 11px; color: #38ef7d; word-break: break-all; text-decoration: none; display: block; padding: 4px 6px; background: var(--bg-tertiary); border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${item.convertedUrl}</a>
        </div>
        <div class="history-item-actions" style="display: flex; gap: 6px; margin-top: 8px;">
          <button class="copy-original-btn secondary" data-url="${item.originalUrl}" style="font-size: 10px; padding: 4px 10px;">Copy Original</button>
          <button class="copy-converted-btn secondary" data-url="${item.convertedUrl}" style="font-size: 10px; padding: 4px 10px;">Copy Converted</button>
        </div>
      </div>
    `;
  }).join('');

  elements.convertHistoryList.innerHTML = html;

  // Add copy button event listeners
  elements.convertHistoryList.querySelectorAll('.copy-original-btn, .copy-converted-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const url = e.target.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        e.target.textContent = '✓ Copied';
        setTimeout(() => {
          e.target.textContent = e.target.classList.contains('copy-original-btn') ? 'Copy Original' : 'Copy Converted';
        }, 1500);
      } catch (error) {
        await logErrorMessage('Failed to copy URL from history', error);
      }
    });
  });
}

/**
 * Handles clearing conversion history
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function handleClearConvertHistory(elements) {
  if (!confirm('Are you sure you want to clear all conversion history?')) {
    return;
  }

  await clearHistory('convertHistory');
  await renderConvertHistory(elements);
  showStatus('History cleared', StatusType.SUCCESS, elements.statusDiv);
  await logInfo('Conversion history cleared');
}
