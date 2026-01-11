/**
 * Convert Tab Module
 * Handles image link conversion functionality
 * @module convertTab
 */

import { logErrorMessage, logInfo, withErrorLogging } from './errorLogger.js';
import { isValidImageUrl, extractValidUrls } from './validator.js';
import { showStatus, updateProgress, StatusType } from './uiHelpers.js';
import { getStorage, setStorage } from './storage.js';

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
  elements.replaceBtn.addEventListener('click', () => handleReplace(elements));
  elements.clearBtn.addEventListener('click', () => handleClear(elements));
  elements.copyBtn.addEventListener('click', () => handleCopy(elements));
  elements.hostSelect.addEventListener('change', () => handleHostChange(elements));
  elements.settingsToggle.addEventListener('click', () => handleSettingsToggle(elements));
  elements.saveApiKey.addEventListener('click', () => handleSaveApiKey(elements));

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
  await checkApiKeyStatus(elements);
}

/**
 * Updates API UI based on selected host
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
export async function updateApiUI(elements) {
  const host = elements.hostSelect.value;
  const needsSetup = ['vgy', 'flickr', 'gyazo', 'gdrive'].includes(host);

  elements.settingsToggle.style.display = needsSetup ? 'inline-flex' : 'none';

  if (SERVICE_INFO[host]) {
    elements.serviceInfo.textContent = SERVICE_INFO[host];
    elements.serviceInfo.style.display = 'block';
  } else {
    elements.serviceInfo.style.display = 'none';
  }

  // Hide all settings panels
  elements.apiSettings.style.display = 'none';
  elements.oauthContainer.style.display = 'none';
  if (elements.convertGdriveConnection) {
    elements.convertGdriveConnection.style.display = 'none';
  }

  // Show appropriate panel for selected service
  if (host === 'gdrive' && elements.convertGdriveConnection) {
    elements.convertGdriveConnection.style.display = 'block';
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
 * Processes multiple URLs for conversion
 * @param {string[]} urls - URLs to process
 * @param {string} host - Target host
 * @param {Object} elements - DOM elements
 * @returns {Promise<Array>} Processing results
 */
async function processUrls(urls, host, elements) {
  const results = [];
  const total = urls.length;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    updateProgress(i, total, `Processing ${i + 1}/${total}...`, elements.progressFill, elements.progressText);

    try {
      const result = await processUrl(url, host);
      results.push(result);
    } catch (error) {
      if (error.message === 'GOOGLE_DRIVE_SESSION_EXPIRED') {
        elements.progressSection.style.display = 'none';
        elements.replaceBtn.disabled = false;
        alert('⚠️ Google Drive session expired!\n\nPlease reconnect to Google Drive to continue converting images.');
        return results;
      }

      results.push({
        original: url,
        new: url,
        success: false,
        error: error.message
      });
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
    // Implementation delegated to upload functions (to be imported)
    // This is a placeholder - actual implementation will use upload modules
    throw new Error('Not implemented - will be connected to upload modules');
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
