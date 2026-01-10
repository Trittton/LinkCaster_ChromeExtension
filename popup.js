// DOM Elements - Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// DOM Elements - Convert Tab
const inputText = document.getElementById('input-text');
const outputText = document.getElementById('output-text');
const replaceBtn = document.getElementById('replace-btn');
const clearBtn = document.getElementById('clear-btn');
const copyBtn = document.getElementById('copy-btn');
const hostSelect = document.getElementById('host-select');
const serviceInfo = document.getElementById('service-info');
const apiSettings = document.getElementById('api-settings');
const oauthContainer = document.getElementById('oauth-container');
const oauthConnect = document.getElementById('oauth-connect');
const oauthText = document.getElementById('oauth-text');
const oauthStatus = document.getElementById('oauth-status');
const apiKey = document.getElementById('api-key');
const apiLabel = document.getElementById('api-label');
const apiHelp = document.getElementById('api-help');
const apiLink = document.getElementById('api-link');
const saveApiKey = document.getElementById('save-api-key');
const settingsToggle = document.getElementById('settings-toggle');
const apiWarning = document.getElementById('api-warning');
const themeToggle = document.getElementById('theme-toggle');
const progressSection = document.getElementById('progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const outputSection = document.getElementById('output-section');
const statusDiv = document.getElementById('status');

// API Links and OAuth configuration
const API_LINKS = {
  vgy: 'https://vgy.me/account/details',
  flickr: 'https://www.flickr.com/services/apps/create/apply',
  gyazo: 'https://gyazo.com/oauth/applications'
};

// Flickr OAuth configuration (you'll need to create a Flickr app)
const FLICKR_CONFIG = {
  apiKey: 'YOUR_FLICKR_API_KEY', // Replace with actual API key
  apiSecret: 'YOUR_FLICKR_API_SECRET', // Replace with actual API secret
  callbackUrl: chrome.identity.getRedirectURL('flickr'),
  requestTokenUrl: 'https://www.flickr.com/services/oauth/request_token',
  authorizeUrl: 'https://www.flickr.com/services/oauth/authorize',
  accessTokenUrl: 'https://www.flickr.com/services/oauth/access_token',
  uploadUrl: 'https://up.flickr.com/services/upload/'
};

// Service information
const SERVICE_INFO = {
  vgy: 'Requires user key',
  flickr: 'Requires OAuth authentication',
  gyazo: 'Requires access token'
};

// State
let apiSettingsExpanded = false;
let lastApiError = null;
let currentTab = 'convert';

// Tab switching function
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content visibility
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  // Save current tab
  chrome.storage.local.set({ currentTab: tabName });
}

// Tab button event listeners
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

// Load saved state and settings
chrome.storage.local.get(['inputText', 'outputText', 'outputVisible', 'theme', 'currentTab'], (localData) => {
  // Restore last active tab
  if (localData.currentTab) {
    switchTab(localData.currentTab);
  }

  // Restore persisted text
  if (localData.inputText) inputText.value = localData.inputText;
  if (localData.outputText) outputText.value = localData.outputText;
  if (localData.outputVisible) {
    outputSection.style.display = 'block';
  }

  // Restore theme
  const theme = localData.theme || 'dark';
  document.body.setAttribute('data-theme', theme);
  updateThemeIcon(theme);

  // Load sync settings
  chrome.storage.sync.get(['selectedHost', 'vgyApiKey', 'flickrApiKey', 'flickrApiSecret'], (result) => {
    if (result.selectedHost) {
      hostSelect.value = result.selectedHost;
    } else {
      hostSelect.value = 'catbox';
    }
    updateApiUI();
    checkApiKeyStatus();
  });
});

// Auto-save input text
inputText.addEventListener('input', () => {
  chrome.storage.local.set({ inputText: inputText.value });
});

// Event listeners
hostSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ selectedHost: hostSelect.value });
  updateApiUI();
  checkApiKeyStatus();
});

settingsToggle.addEventListener('click', () => {
  apiSettingsExpanded = !apiSettingsExpanded;
  updateApiUI();
  // Don't hide warning when toggling - only hide it when API key is properly configured
});

saveApiKey.addEventListener('click', () => {
  const key = apiKey.value.trim();
  const host = hostSelect.value;

  if (key) {
    let storageKey;
    if (host === 'vgy') {
      storageKey = 'vgyApiKey';
    } else if (host === 'gyazo') {
      storageKey = 'gyazoAccessToken';
    } else if (host === 'flickr') {
      storageKey = 'flickrApiKey';
    }

    chrome.storage.sync.set({ [storageKey]: key }, () => {
      showStatus('Settings saved successfully!', 'success');
      lastApiError = null;
      checkApiKeyStatus();
      apiSettingsExpanded = false;
      apiSettings.style.display = 'none';
    });
  } else {
    showStatus('Please enter valid credentials', 'error');
  }
});

oauthConnect.addEventListener('click', async () => {
  const host = hostSelect.value;
  if (host === 'flickr') {
    await authenticateFlickr();
  }
});

themeToggle.addEventListener('click', () => {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  chrome.storage.local.set({ theme: newTheme });
  updateThemeIcon(newTheme);
});

replaceBtn.addEventListener('click', handleReplace);
clearBtn.addEventListener('click', handleClear);
copyBtn.addEventListener('click', handleCopy);

function updateThemeIcon(theme) {
  const icon = themeToggle.querySelector('.theme-icon');
  icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function updateApiUI() {
  const host = hostSelect.value;
  const needsSetup = host === 'vgy' || host === 'flickr' || host === 'gyazo';

  // Show/hide settings button (gear icon)
  settingsToggle.style.display = needsSetup ? 'inline-flex' : 'none';

  // Update service info text
  if (SERVICE_INFO[host]) {
    serviceInfo.textContent = SERVICE_INFO[host];
    serviceInfo.style.display = 'block';
  } else {
    serviceInfo.style.display = 'none';
  }

  // Hide both settings panels if not needed
  if (!needsSetup) {
    apiSettings.style.display = 'none';
    oauthContainer.style.display = 'none';
    apiSettingsExpanded = false;
    return;
  }

  // For Flickr, show OAuth container when settings are expanded
  if (host === 'flickr') {
    apiSettings.style.display = 'none';
    if (apiSettingsExpanded) {
      oauthContainer.style.display = 'block';
      updateOAuthStatus();
    } else {
      oauthContainer.style.display = 'none';
    }
  }
  // For vgy.me and Gyazo, show API settings when expanded
  else if (host === 'vgy' || host === 'gyazo') {
    oauthContainer.style.display = 'none';
    if (apiSettingsExpanded) {
      apiSettings.style.display = 'block';

      if (host === 'vgy') {
        apiLabel.textContent = 'vgy.me User Key';
        apiLink.href = API_LINKS.vgy;
        apiHelp.innerHTML = 'Get your user key from <a href="' + API_LINKS.vgy + '" target="_blank">User Keys tab</a> in account details';

        chrome.storage.sync.get(['vgyApiKey'], (result) => {
          apiKey.value = result.vgyApiKey || '';
        });
      } else if (host === 'gyazo') {
        apiLabel.textContent = 'Gyazo Access Token';
        apiLink.href = API_LINKS.gyazo;
        apiHelp.innerHTML = 'Get your access token from <a href="' + API_LINKS.gyazo + '" target="_blank">your applications</a> page';

        chrome.storage.sync.get(['gyazoAccessToken'], (result) => {
          apiKey.value = result.gyazoAccessToken || '';
        });
      }
    } else {
      apiSettings.style.display = 'none';
    }
  }
}

function checkApiKeyStatus() {
  const host = hostSelect.value;
  const needsApi = host === 'vgy' || host === 'flickr' || host === 'gyazo';

  if (!needsApi) {
    apiWarning.style.display = 'none';
    return;
  }

  if (host === 'flickr') {
    // For Flickr, check OAuth tokens
    chrome.storage.sync.get(['flickrOAuthToken', 'flickrOAuthTokenSecret'], (result) => {
      const hasOAuth = !!(result.flickrOAuthToken && result.flickrOAuthTokenSecret);
      apiWarning.style.display = (!hasOAuth || lastApiError) ? 'block' : 'none';
    });
  } else if (host === 'vgy') {
    // For vgy.me, check API key
    chrome.storage.sync.get(['vgyApiKey'], (result) => {
      const hasKey = !!result.vgyApiKey;
      apiWarning.style.display = (!hasKey || lastApiError) ? 'block' : 'none';
    });
  } else if (host === 'gyazo') {
    // For Gyazo, check OAuth tokens
    chrome.storage.sync.get(['gyazoAccessToken'], (result) => {
      const hasKey = !!result.gyazoAccessToken;
      apiWarning.style.display = (!hasKey || lastApiError) ? 'block' : 'none';
    });
  }
}

function updateOAuthStatus() {
  const host = hostSelect.value;

  if (host === 'flickr') {
    chrome.storage.sync.get(['flickrOAuthToken', 'flickrOAuthTokenSecret', 'flickrUsername'], (result) => {
      if (result.flickrOAuthToken && result.flickrOAuthTokenSecret) {
        oauthText.textContent = 'Connected to Flickr';
        oauthConnect.classList.remove('primary');
        oauthConnect.classList.add('secondary');
        if (result.flickrUsername) {
          oauthStatus.textContent = `Logged in as: ${result.flickrUsername}`;
        } else {
          oauthStatus.textContent = 'Authentication successful';
        }
        oauthStatus.style.color = 'var(--text-muted)';
      } else {
        oauthText.textContent = 'Connect to Flickr';
        oauthConnect.classList.remove('secondary');
        oauthConnect.classList.add('primary');
        oauthStatus.textContent = '';
      }
    });
  }
}

async function authenticateFlickr() {
  try {
    oauthText.textContent = 'Connecting...';
    oauthConnect.disabled = true;

    // Note: This requires a background script to handle OAuth
    // Send message to background script to initiate OAuth
    chrome.runtime.sendMessage({
      action: 'flickrOAuth',
      config: FLICKR_CONFIG
    }, (response) => {
      if (response && response.success) {
        // Save OAuth tokens
        chrome.storage.sync.set({
          flickrOAuthToken: response.token,
          flickrOAuthTokenSecret: response.tokenSecret,
          flickrUsername: response.username || ''
        }, () => {
          showStatus('Flickr authentication successful!', 'success');
          lastApiError = null;
          checkApiKeyStatus();
          updateOAuthStatus();
        });
      } else {
        showStatus('Flickr authentication failed: ' + (response?.error || 'Unknown error'), 'error');
        lastApiError = true;
        checkApiKeyStatus();
      }
      oauthConnect.disabled = false;
      updateOAuthStatus();
    });

  } catch (error) {
    console.error('Flickr OAuth error:', error);
    showStatus('Authentication error: ' + error.message, 'error');
    oauthConnect.disabled = false;
    updateOAuthStatus();
  }
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

function handleClear() {
  inputText.value = '';
  outputText.value = '';
  outputSection.style.display = 'none';
  statusDiv.style.display = 'none';
  progressSection.style.display = 'none';

  // Clear from storage
  chrome.storage.local.set({
    inputText: '',
    outputText: '',
    outputVisible: false
  });
}

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(outputText.value);
    showStatus('Copied to clipboard!', 'success');
  } catch (error) {
    showStatus('Failed to copy: ' + error.message, 'error');
  }
}

async function handleReplace() {
  const input = inputText.value.trim();

  if (!input) {
    showStatus('Please paste some links first', 'error');
    return;
  }

  // Check if service requires API key or OAuth
  const host = hostSelect.value;
  if (host === 'flickr') {
    const result = await chrome.storage.sync.get(['flickrOAuthToken', 'flickrOAuthTokenSecret']);
    if (!result.flickrOAuthToken || !result.flickrOAuthTokenSecret) {
      showStatus('Please authenticate with Flickr first', 'error');
      lastApiError = true;
      checkApiKeyStatus();
      return;
    }
  } else if (host === 'vgy') {
    const result = await chrome.storage.sync.get(['vgyApiKey']);
    if (!result.vgyApiKey) {
      showStatus('Please configure vgy.me user key first', 'error');
      lastApiError = true;
      checkApiKeyStatus();
      return;
    }
  } else if (host === 'gyazo') {
    const result = await chrome.storage.sync.get(['gyazoAccessToken']);
    if (!result.gyazoAccessToken) {
      showStatus('Please authenticate with Gyazo first', 'error');
      lastApiError = true;
      checkApiKeyStatus();
      return;
    }
  }

  // Extract image URLs from input
  const urls = extractImageUrls(input);

  if (urls.length === 0) {
    showStatus('No valid image links found', 'error');
    return;
  }

  // Start processing
  replaceBtn.disabled = true;
  progressSection.style.display = 'block';
  outputSection.style.display = 'none';
  statusDiv.style.display = 'none';

  const results = await processUrls(urls);

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  // Check for API errors (including invalid API key)
  const apiErrors = results.filter(r => !r.success && (
    r.error?.includes('API') ||
    r.error?.includes('401') ||
    r.error?.includes('403') ||
    r.error?.includes('Invalid') ||
    r.error?.includes('user key')
  ));
  if (apiErrors.length > 0) {
    lastApiError = true;
    checkApiKeyStatus();
  } else {
    lastApiError = null;
  }

  progressSection.style.display = 'none';
  replaceBtn.disabled = false;

  // If all conversions failed, show error instead of output
  if (successCount === 0) {
    outputSection.style.display = 'none';

    // Determine error message
    let errorMessage = 'Something went wrong';
    if (apiErrors.length > 0) {
      // Show the first API error message
      errorMessage = apiErrors[0].error;
    } else if (results.length > 0 && results[0].error) {
      // Show the first error
      errorMessage = results[0].error;
    }

    showStatus(errorMessage, 'error');

    // Don't save failed output
    chrome.storage.local.set({
      outputVisible: false
    });
  } else {
    // Display results only if at least one succeeded
    const convertedText = replaceUrlsInText(input, results);
    outputText.value = convertedText;
    outputSection.style.display = 'block';

    // Save output state
    chrome.storage.local.set({
      outputText: convertedText,
      outputVisible: true
    });

    if (failCount === 0) {
      showStatus(`Successfully converted ${successCount} image(s)!`, 'success');
    } else {
      showStatus(`Converted ${successCount} image(s), ${failCount} failed`, 'info');
    }
  }
}

function extractImageUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];

  // Filter for image URLs and known services
  const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp)(\?.*)?$/i;
  const knownServices = /(prnt\.sc|prntscr\.com|lightshot\.com|i\.imgur\.com|imgur\.com)/i;

  return matches.filter(url => {
    return imageExtensions.test(url) || knownServices.test(url);
  });
}

async function processUrls(urls) {
  const results = [];
  const total = urls.length;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    updateProgress(i, total, `Processing ${i + 1}/${total}...`);

    try {
      const result = await processUrl(url);
      results.push(result);
    } catch (error) {
      results.push({
        original: url,
        new: url,
        success: false,
        error: error.message
      });
    }
  }

  updateProgress(total, total, 'Complete!');
  return results;
}

async function processUrl(url) {
  try {
    console.log('Processing URL:', url);

    // Step 1: Get the actual image URL (handle Lightshot pages)
    const imageUrl = await getDirectImageUrl(url);
    console.log('Direct image URL:', imageUrl);

    // Step 2: Download the image
    const imageBlob = await downloadImage(imageUrl);
    console.log('Downloaded blob:', imageBlob.type, imageBlob.size, 'bytes');

    // Step 3: Upload to selected host
    const host = hostSelect.value;
    let newUrl;

    console.log('Uploading to:', host);
    if (host === 'catbox') {
      newUrl = await uploadToCatbox(imageBlob);
    } else if (host === 'freeimage') {
      newUrl = await uploadToFreeImage(imageBlob);
    } else if (host === 'vgy') {
      const userKey = (await chrome.storage.sync.get(['vgyApiKey'])).vgyApiKey;
      newUrl = await uploadToVgy(imageBlob, userKey);
    } else if (host === 'flickr') {
      const tokens = await chrome.storage.sync.get(['flickrOAuthToken', 'flickrOAuthTokenSecret']);
      newUrl = await uploadToFlickr(imageBlob, tokens.flickrOAuthToken, tokens.flickrOAuthTokenSecret);
    } else if (host === 'gyazo') {
      const accessToken = (await chrome.storage.sync.get(['gyazoAccessToken'])).gyazoAccessToken;
      newUrl = await uploadToGyazo(imageBlob, accessToken);
    }

    console.log('Upload successful, new URL:', newUrl);
    return {
      original: url,
      new: newUrl,
      success: true
    };
  } catch (error) {
    console.error('Error processing URL:', url, error);
    return {
      original: url,
      new: url,
      success: false,
      error: error.message
    };
  }
}

async function getDirectImageUrl(url) {
  // If it's already a direct image link, return it
  if (/\.(jpg|jpeg|png|gif|bmp|webp)(\?.*)?$/i.test(url)) {
    return url;
  }

  // Handle Lightshot/prnt.sc URLs - need to scrape the actual image URL from the page
  if (url.includes('prnt.sc') || url.includes('prntscr.com')) {
    try {
      console.log('Fetching Lightshot page:', url);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch Lightshot page: ${response.status}`);
      }

      const html = await response.text();

      // Look for the image URL in the HTML
      // Lightshot pages contain: <img class="no-click screenshot-image" src="//image.prntscr.com/image/...">
      const imageMatch = html.match(/src=["']([^"']*image\.prntscr\.com[^"']*)["']/i) ||
                        html.match(/src=["']\/\/(image\.prntscr\.com[^"']*)["']/i) ||
                        html.match(/"(https?:\/\/image\.prntscr\.com[^"]+)"/i);

      if (imageMatch) {
        let imageUrl = imageMatch[1];
        // Add https: if the URL starts with //
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (!imageUrl.startsWith('http')) {
          imageUrl = 'https://' + imageUrl;
        }
        console.log('Found image URL in page:', imageUrl);
        return imageUrl;
      }

      // If we can't find the image, the screenshot might be deleted
      throw new Error('Could not find image in Lightshot page (may be deleted)');

    } catch (error) {
      console.error('Error fetching Lightshot page:', error);
      throw new Error(`Failed to get Lightshot image: ${error.message}`);
    }
  }

  return url;
}

async function downloadImage(url) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();

    // Verify it's an image
    if (!blob.type.startsWith('image/')) {
      throw new Error('URL does not point to a valid image');
    }

    return blob;
  } catch (error) {
    console.error('Download error for URL:', url, error);
    throw new Error(`Failed to download: ${error.message}`);
  }
}

async function uploadToCatbox(imageBlob) {
  try {
    const formData = new FormData();
    formData.append('fileToUpload', imageBlob, 'image.png');
    formData.append('reqtype', 'fileupload');

    const response = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('catbox error response:', errorText);
      throw new Error(`catbox upload failed: ${response.status}`);
    }

    const url = await response.text();
    console.log('catbox response:', url);

    if (url && url.startsWith('http')) {
      return url.trim();
    }

    throw new Error('catbox returned invalid response: ' + url);
  } catch (error) {
    console.error('catbox upload error:', error);
    throw error;
  }
}

async function uploadToFreeImage(imageBlob) {
  try {
    const formData = new FormData();
    formData.append('source', imageBlob);
    formData.append('type', 'file');
    formData.append('action', 'upload');

    const response = await fetch('https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('freeimage error response:', errorText);
      throw new Error(`freeimage upload failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('freeimage response:', data);

    if (data.image && data.image.url) {
      return data.image.url;
    }

    throw new Error('freeimage returned invalid response: ' + JSON.stringify(data));
  } catch (error) {
    console.error('freeimage upload error:', error);
    throw error;
  }
}

async function uploadToVgy(imageBlob, userKey) {
  try {
    const formData = new FormData();
    formData.append('file', imageBlob, 'image.png');
    formData.append('userkey', userKey);

    const response = await fetch('https://vgy.me/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    console.log('vgy.me response:', data);

    // Check for error response (vgy.me returns error:true even with 200 status)
    if (data.error === true) {
      console.error('vgy.me error response:', data);

      // Check for authentication/API key errors
      if (data.messages && data.messages.Unauthorized) {
        throw new Error('Invalid vgy.me user key. Please check your API credentials.');
      }

      // Extract first error message from messages object
      if (data.messages) {
        const firstMessage = Object.values(data.messages)[0];
        throw new Error(`vgy.me: ${firstMessage}`);
      }

      throw new Error('vgy.me upload failed');
    }

    // vgy.me returns: { image: "https://vgy.me/xxxxx.png", ... }
    if (data.image) {
      return data.image;
    } else if (data.url) {
      return data.url;
    } else if (data.link) {
      return data.link;
    }

    throw new Error('vgy.me returned invalid response: ' + JSON.stringify(data));
  } catch (error) {
    console.error('vgy.me upload error:', error);
    throw error;
  }
}

async function uploadToFlickr(imageBlob, oauthToken, oauthTokenSecret) {
  try {
    // Convert blob to base64 for sending to background script
    const base64Data = await blobToBase64(imageBlob);

    // Send upload request to background script which will handle OAuth signing
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'flickrUpload',
        imageData: base64Data,
        oauthToken: oauthToken,
        oauthTokenSecret: oauthTokenSecret,
        config: FLICKR_CONFIG
      }, (response) => {
        if (response && response.success) {
          resolve(response.url);
        } else {
          reject(new Error(response?.error || 'Flickr upload failed'));
        }
      });
    });

  } catch (error) {
    console.error('Flickr upload error:', error);
    throw error;
  }
}

async function uploadToGyazo(imageBlob, accessToken) {
  try {
    const formData = new FormData();
    formData.append('imagedata', imageBlob);

    const response = await fetch('https://upload.gyazo.com/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    const data = await response.json();
    console.log('Gyazo response:', data);

    // Check for error response
    if (!response.ok || data.error) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Gyazo access token. Please check your API credentials.');
      }

      const errorMsg = data.message || data.error || response.statusText;
      throw new Error(`Gyazo: ${errorMsg}`);
    }

    // Gyazo returns: { image_id: "...", permalink_url: "https://gyazo.com/...", url: "https://i.gyazo.com/..." }
    if (data.url) {
      return data.url;
    } else if (data.permalink_url) {
      return data.permalink_url;
    }

    throw new Error('Gyazo returned invalid response: ' + JSON.stringify(data));
  } catch (error) {
    console.error('Gyazo upload error:', error);
    throw error;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function replaceUrlsInText(originalText, results) {
  let newText = originalText;

  // Replace each URL with its new counterpart
  results.forEach(result => {
    if (result.success) {
      newText = newText.replace(result.original, result.new);
    }
  });

  return newText;
}

function updateProgress(current, total, message) {
  const percentage = (current / total) * 100;
  progressFill.style.width = percentage + '%';
  progressText.textContent = message;
}

// ===== Google Drive OAuth and Upload =====

// DOM Elements for Google Drive
const gdriveSettingsBtn = document.getElementById('gdrive-settings-btn');
const gdriveSettings = document.getElementById('gdrive-settings');
const gdriveConnect = document.getElementById('gdrive-connect');
const gdriveUnlink = document.getElementById('gdrive-unlink');
const gdriveStatus = document.getElementById('gdrive-status');
const gdriveConnectFirst = document.getElementById('gdrive-connect-first');
const gdriveFirstTime = document.getElementById('gdrive-first-time');
const gdriveErrorBadge = document.getElementById('gdrive-error-badge');
const gdriveUploadSection = document.getElementById('gdrive-upload-section');
const videoFileInput = document.getElementById('video-file-input');
const uploadVideoBtn = document.getElementById('upload-video-btn');
const videoProgress = document.getElementById('video-progress');
const videoProgressFill = document.getElementById('video-progress-fill');
const videoProgressText = document.getElementById('video-progress-text');
const videoOutputSection = document.getElementById('video-output-section');
const videoOutputText = document.getElementById('video-output-text');
const videoCopyBtn = document.getElementById('video-copy-btn');

// DOM Elements for History
const videoHistoryBtn = document.getElementById('video-history-btn');
const videoHistoryPanel = document.getElementById('video-history-panel');
const videoHistoryList = document.getElementById('video-history-list');
const clearVideoHistory = document.getElementById('clear-video-history');

// Google Drive UI Update
async function updateGDriveUI() {
  const data = await chrome.storage.local.get(['googleDriveSessionId', 'googleDriveConnected', 'googleDriveConnectedAt']);
  const isConnected = data.googleDriveSessionId && data.googleDriveConnected;

  if (isConnected) {
    // Hide first-time prompt
    if (gdriveFirstTime) gdriveFirstTime.style.display = 'none';
    if (gdriveErrorBadge) gdriveErrorBadge.style.display = 'none';
    if (gdriveUploadSection) gdriveUploadSection.style.display = 'block';
  } else {
    // Show first-time prompt if never connected
    const neverConnected = !data.googleDriveConnectedAt;
    if (gdriveFirstTime && neverConnected) {
      gdriveFirstTime.style.display = 'block';
    }
    // Show error badge if was connected before
    if (gdriveErrorBadge && !neverConnected) {
      gdriveErrorBadge.style.display = 'block';
    }
    if (gdriveUploadSection) gdriveUploadSection.style.display = 'none';
  }

  await updateGDriveStatus();
}

async function updateGDriveStatus() {
  if (!gdriveStatus) return;

  const data = await chrome.storage.local.get(['googleDriveSessionId', 'googleDriveConnected']);
  const isConnected = data.googleDriveSessionId && data.googleDriveConnected;

  if (isConnected) {
    gdriveStatus.textContent = '✓ Connected';
    gdriveStatus.style.color = '#38ef7d';
    if (gdriveConnect) {
      gdriveConnect.textContent = 'Reconnect';
      gdriveConnect.classList.remove('primary');
      gdriveConnect.classList.add('secondary');
    }
    if (gdriveUnlink) {
      gdriveUnlink.style.display = 'inline-block';
    }
  } else {
    gdriveStatus.textContent = 'Not connected';
    gdriveStatus.style.color = 'var(--text-dimmed)';
    if (gdriveConnect) {
      gdriveConnect.textContent = 'Connect to Google Drive';
      gdriveConnect.classList.remove('secondary');
      gdriveConnect.classList.add('primary');
    }
    if (gdriveUnlink) {
      gdriveUnlink.style.display = 'none';
    }
  }
}

// Settings button toggle
if (gdriveSettingsBtn) {
  gdriveSettingsBtn.addEventListener('click', () => {
    const isVisible = gdriveSettings.style.display !== 'none';
    gdriveSettings.style.display = isVisible ? 'none' : 'block';
  });
}

// Connect button handler
async function handleGDriveConnect() {
  if (!gdriveConnect) return;

  gdriveConnect.disabled = true;
  const originalText = gdriveConnect.textContent;
  gdriveConnect.textContent = 'Connecting...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleDriveOAuth' });

    if (response.success) {
      showStatus('Connected to Google Drive!', 'success');
      await updateGDriveUI();
    } else {
      showStatus('Failed to connect: ' + response.error, 'error');
    }
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
  } finally {
    gdriveConnect.disabled = false;
    gdriveConnect.textContent = originalText;
  }
}

if (gdriveConnect) {
  gdriveConnect.addEventListener('click', handleGDriveConnect);
}

if (gdriveConnectFirst) {
  gdriveConnectFirst.addEventListener('click', handleGDriveConnect);
}

// Unlink button handler
if (gdriveUnlink) {
  gdriveUnlink.addEventListener('click', async () => {
    const confirmed = confirm('Unlink Google Drive account? You will need to reconnect to upload videos.');

    if (!confirmed) return;

    gdriveUnlink.disabled = true;

    await chrome.storage.local.set({
      googleDriveSessionId: null,
      googleDriveConnected: false
    });

    showStatus('Google Drive unlinked', 'success');
    await updateGDriveUI();

    gdriveUnlink.disabled = false;
  });
}

// Upload video button handler
if (uploadVideoBtn) {
  uploadVideoBtn.addEventListener('click', async () => {
    const file = videoFileInput.files[0];
    if (!file) {
      showStatus('Please select a video file', 'error');
      return;
    }

    uploadVideoBtn.disabled = true;
    videoProgress.style.display = 'block';
    videoProgressText.textContent = 'Reading file...';
    videoProgressFill.style.width = '30%';

    try {
      // Get session ID
      const data = await chrome.storage.local.get(['googleDriveSessionId']);
      if (!data.googleDriveSessionId) {
        throw new Error('Not connected to Google Drive');
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          videoProgressText.textContent = 'Uploading to Google Drive...';
          videoProgressFill.style.width = '60%';

          const fileData = e.target.result; // Keep full data URL format

          const response = await chrome.runtime.sendMessage({
            action: 'googleDriveUpload',
            fileData: fileData,
            fileName: file.name,
            sessionId: data.googleDriveSessionId
          });

          if (response.success) {
            videoProgressFill.style.width = '100%';
            videoProgressText.textContent = 'Upload complete!';

            videoOutputText.value = response.url;
            videoOutputSection.style.display = 'block';

            // Add to history
            await addToHistory(file.name, response.url, response.fileId);

            showStatus('Video uploaded successfully!', 'success');

            setTimeout(() => {
              videoProgress.style.display = 'none';
            }, 2000);
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          showStatus('Upload failed: ' + error.message, 'error');
          videoProgress.style.display = 'none';
        } finally {
          uploadVideoBtn.disabled = false;
        }
      };

      reader.onerror = () => {
        showStatus('Failed to read file', 'error');
        videoProgress.style.display = 'none';
        uploadVideoBtn.disabled = false;
      };

      reader.readAsDataURL(file);
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
      videoProgress.style.display = 'none';
      uploadVideoBtn.disabled = false;
    }
  });
}

// Copy video link button
if (videoCopyBtn) {
  videoCopyBtn.addEventListener('click', () => {
    videoOutputText.select();
    document.execCommand('copy');
    showStatus('Link copied to clipboard!', 'success');
  });
}

// Update Google Drive UI when switching to Upload Vid tab
const originalSwitchTab = switchTab;
switchTab = function(tabName) {
  originalSwitchTab(tabName);

  if (tabName === 'upload-vid') {
    updateGDriveUI();
  }
};

// ===== Upload History System =====

// Add upload to history
async function addToHistory(fileName, url, fileId) {
  const data = await chrome.storage.local.get(['videoUploadHistory']);
  const history = data.videoUploadHistory || [];

  history.unshift({
    fileName: fileName,
    url: url,
    fileId: fileId,
    timestamp: Date.now()
  });

  // Keep only last 50 uploads
  if (history.length > 50) {
    history.length = 50;
  }

  await chrome.storage.local.set({ videoUploadHistory: history });
  await renderHistory();
}

// Render history list
async function renderHistory() {
  if (!videoHistoryList) return;

  const data = await chrome.storage.local.get(['videoUploadHistory']);
  const history = data.videoUploadHistory || [];

  if (history.length === 0) {
    videoHistoryList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No uploads yet</p>';
    return;
  }

  videoHistoryList.innerHTML = history.map(item => {
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="history-item" data-url="${escapeHtml(item.url)}">
        <div class="history-item-header">
          <div class="history-item-name">${escapeHtml(item.fileName)}</div>
          <div class="history-item-date">${dateStr}</div>
        </div>
        <div class="history-item-url">${escapeHtml(item.url)}</div>
        <div class="history-item-actions">
          <button class="primary copy-history-btn">Copy Link</button>
          <button class="secondary open-history-btn">Open</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners to history buttons
  document.querySelectorAll('.copy-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        showStatus('Link copied to clipboard!', 'success');
      });
    });
  });

  document.querySelectorAll('.open-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      chrome.tabs.create({ url: url });
    });
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// History button toggle
if (videoHistoryBtn) {
  videoHistoryBtn.addEventListener('click', () => {
    const isVisible = videoHistoryPanel.style.display !== 'none';
    videoHistoryPanel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      // Close settings panel if open
      if (gdriveSettings) gdriveSettings.style.display = 'none';
      renderHistory();
    }
  });
}

// Clear history button
if (clearVideoHistory) {
  clearVideoHistory.addEventListener('click', async () => {
    const confirmed = confirm('Clear all upload history?');
    if (!confirmed) return;

    await chrome.storage.local.set({ videoUploadHistory: [] });
    await renderHistory();
    showStatus('History cleared', 'success');
  });
}

// ===== Upload Img Tab =====

// DOM Elements for Upload Img
const imageSettingsBtn = document.getElementById('image-settings-btn');
const imageSettingsPanel = document.getElementById('image-settings-panel');
const imageServiceSelect = document.getElementById('image-service-select');
const imageHistoryBtn = document.getElementById('image-history-btn');
const imageHistoryPanel = document.getElementById('image-history-panel');
const imageHistoryList = document.getElementById('image-history-list');
const clearImageHistory = document.getElementById('clear-image-history');
const imageFileInput = document.getElementById('image-file-input');
const uploadImagesBtn = document.getElementById('upload-images-btn');
const imageProgress = document.getElementById('image-progress');
const imageProgressFill = document.getElementById('image-progress-fill');
const imageProgressText = document.getElementById('image-progress-text');
const imageOutputSection = document.getElementById('image-output-section');
const imageOutputText = document.getElementById('image-output-text');
const imageCopyBtn = document.getElementById('image-copy-btn');

// Load saved service selection
chrome.storage.local.get(['imageUploadService'], (result) => {
  if (result.imageUploadService && imageServiceSelect) {
    imageServiceSelect.value = result.imageUploadService;
  }
});

// Save service selection
if (imageServiceSelect) {
  imageServiceSelect.addEventListener('change', () => {
    chrome.storage.local.set({ imageUploadService: imageServiceSelect.value });
  });
}

// Settings button toggle
if (imageSettingsBtn) {
  imageSettingsBtn.addEventListener('click', () => {
    const isVisible = imageSettingsPanel.style.display !== 'none';
    imageSettingsPanel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible && imageHistoryPanel) {
      imageHistoryPanel.style.display = 'none';
    }
  });
}

// History button toggle
if (imageHistoryBtn) {
  imageHistoryBtn.addEventListener('click', () => {
    const isVisible = imageHistoryPanel.style.display !== 'none';
    imageHistoryPanel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      if (imageSettingsPanel) imageSettingsPanel.style.display = 'none';
      renderImageHistory();
    }
  });
}

// Upload images to Catbox
async function uploadToCatbox(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  return await response.text();
}

// Upload images button handler
if (uploadImagesBtn) {
  uploadImagesBtn.addEventListener('click', async () => {
    const files = imageFileInput.files;
    if (!files || files.length === 0) {
      showStatus('Please select at least one image', 'error');
      return;
    }

    const service = imageServiceSelect ? imageServiceSelect.value : 'catbox';

    if (service === 'imgur') {
      showStatus('Imgur upload requires API key configuration', 'error');
      return;
    }

    uploadImagesBtn.disabled = true;
    imageProgress.style.display = 'block';
    imageProgressText.textContent = `Uploading 0/${files.length} images...`;
    imageProgressFill.style.width = '0%';

    const urls = [];
    let completed = 0;

    try {
      for (const file of files) {
        try {
          const url = await uploadToCatbox(file);
          urls.push(url);

          // Add to history
          await addToImageHistory(file.name, url);

          completed++;
          const percentage = (completed / files.length) * 100;
          imageProgressFill.style.width = percentage + '%';
          imageProgressText.textContent = `Uploaded ${completed}/${files.length} images`;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          urls.push(`Error: ${file.name} upload failed`);
          completed++;
        }
      }

      imageOutputText.value = urls.join('\n');
      imageOutputSection.style.display = 'block';

      showStatus(`Successfully uploaded ${urls.filter(u => !u.startsWith('Error')).length}/${files.length} images!`, 'success');

      setTimeout(() => {
        imageProgress.style.display = 'none';
      }, 2000);
    } catch (error) {
      showStatus('Upload failed: ' + error.message, 'error');
      imageProgress.style.display = 'none';
    } finally {
      uploadImagesBtn.disabled = false;
    }
  });
}

// Copy images button
if (imageCopyBtn) {
  imageCopyBtn.addEventListener('click', () => {
    imageOutputText.select();
    document.execCommand('copy');
    showStatus('Links copied to clipboard!', 'success');
  });
}

// Image History Functions
async function addToImageHistory(fileName, url) {
  const data = await chrome.storage.local.get(['imageUploadHistory']);
  const history = data.imageUploadHistory || [];

  history.unshift({
    fileName: fileName,
    url: url,
    timestamp: Date.now()
  });

  if (history.length > 50) {
    history.length = 50;
  }

  await chrome.storage.local.set({ imageUploadHistory: history });
}

async function renderImageHistory() {
  if (!imageHistoryList) return;

  const data = await chrome.storage.local.get(['imageUploadHistory']);
  const history = data.imageUploadHistory || [];

  if (history.length === 0) {
    imageHistoryList.innerHTML = '<p style="text-align: center; color: var(--text-dimmed); font-size: 12px; padding: 20px;">No uploads yet</p>';
    return;
  }

  imageHistoryList.innerHTML = history.map(item => {
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="history-item" data-url="${escapeHtml(item.url)}">
        <div class="history-item-header">
          <div class="history-item-name">${escapeHtml(item.fileName)}</div>
          <div class="history-item-date">${dateStr}</div>
        </div>
        <div class="history-item-url">${escapeHtml(item.url)}</div>
        <div class="history-item-actions">
          <button class="primary copy-image-history-btn">Copy Link</button>
          <button class="secondary open-image-history-btn">Open</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  document.querySelectorAll('.copy-image-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        showStatus('Link copied to clipboard!', 'success');
      });
    });
  });

  document.querySelectorAll('.open-image-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.closest('.history-item').dataset.url;
      chrome.tabs.create({ url: url });
    });
  });
}

// Clear image history button
if (clearImageHistory) {
  clearImageHistory.addEventListener('click', async () => {
    const confirmed = confirm('Clear all image upload history?');
    if (!confirmed) return;

    await chrome.storage.local.set({ imageUploadHistory: [] });
    await renderImageHistory();
    showStatus('History cleared', 'success');
  });
}
