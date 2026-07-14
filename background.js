// Background service worker for the extension
// Handles OAuth and API interactions for Google Drive

// Token refresh lock to prevent race conditions during parallel uploads
let tokenRefreshPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkCaster extension installed');

  // Set default settings
  chrome.storage.sync.get(['selectedHost'], (result) => {
    if (!result.selectedHost) {
      chrome.storage.sync.set({ selectedHost: 'catbox' });
    }
  });
});

// Backend URL for Google Drive OAuth
const BACKEND_URL = 'https://web-production-674b.up.railway.app';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        sendResponse({ success: true, blob: blob });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'googleDriveOAuth') {
    handleGoogleDriveOAuth()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'prepareDriveUpload') {
    prepareDriveUpload(request.mimeType)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'finalizeDriveUpload') {
    finalizeDriveUpload(request.fileId, request.mimeType)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'extractLightshotImage') {
    extractLightshotImage(request.url)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'extractICloudMedia') {
    extractICloudMedia(request.url)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'fetchMediaViaBackend') {
    fetchMediaViaBackend(request.url)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'offscreenWarmupIdle') {
    chrome.offscreen?.closeDocument().catch(() => {});
    return;
  }
});

// ===== Google Drive OAuth and Upload =====

async function handleGoogleDriveOAuth() {
  try {
    console.log('Starting Google Drive OAuth via backend...');

    const startResponse = await fetch(`${BACKEND_URL}/auth/google/start`);
    const { authUrl, sessionId } = await startResponse.json();

    try {
      await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
      console.log('OAuth flow completed with redirect');
    } catch (flowError) {
      console.log('OAuth window closed, checking if auth succeeded...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify session is actually authenticated
      const verifyResponse = await fetch(`${BACKEND_URL}/auth/verify/${sessionId}`);
      const verifyData = await verifyResponse.json();

      if (!verifyData.authenticated) {
        throw new Error('Authentication was not completed. Please try again and complete the authorization.');
      }
      console.log('Session verified successfully');
    }

    // Retrieve tokens from backend
    console.log('Retrieving OAuth tokens from backend...');
    const tokensResponse = await fetch(`${BACKEND_URL}/auth/tokens/${sessionId}`);
    const tokensData = await tokensResponse.json();

    if (!tokensData.success || !tokensData.tokens) {
      throw new Error('Failed to retrieve OAuth tokens from backend');
    }

    const tokens = tokensData.tokens;
    console.log('Tokens retrieved successfully');

    // Store tokens locally in extension storage (survives server restarts)
    await chrome.storage.local.set({
      googleDriveAccessToken: tokens.access_token,
      googleDriveRefreshToken: tokens.refresh_token,
      googleDriveTokenExpiry: Date.now() + (tokens.expires_in * 1000),
      googleDriveConnected: true,
      googleDriveConnectedAt: Date.now(),
      googleDriveSessionId: sessionId
    });

    console.log('Tokens stored locally in extension storage');

    return { success: true, sessionId: sessionId };
  } catch (error) {
    console.error('Google Drive OAuth error:', error);
    return { success: false, error: error.message };
  }
}

// Refresh Google Drive access token using refresh token
// Uses a lock to prevent race conditions when multiple uploads happen in parallel
async function refreshGoogleDriveToken() {
  if (tokenRefreshPromise) {
    console.log('Token refresh already in progress, waiting for it to complete...');
    return await tokenRefreshPromise;
  }

  tokenRefreshPromise = doTokenRefresh();

  try {
    const result = await tokenRefreshPromise;
    return result;
  } finally {
    tokenRefreshPromise = null;
  }
}

// Actual token refresh implementation
async function doTokenRefresh() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  const storage = await chrome.storage.local.get(['googleDriveRefreshToken']);

  if (!storage.googleDriveRefreshToken) {
    throw new Error('No refresh token available. Please reconnect to Google Drive.');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Refreshing Google Drive access token (attempt ${attempt}/${MAX_RETRIES})...`);

      const response = await fetch(`${BACKEND_URL}/api/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: storage.googleDriveRefreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token refresh attempt ${attempt} failed:`, response.status, errorText);
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();

      if (!tokenData.access_token) {
        throw new Error('No access token in refresh response');
      }

      await chrome.storage.local.set({
        googleDriveAccessToken: tokenData.access_token,
        googleDriveTokenExpiry: Date.now() + (tokenData.expires_in * 1000)
      });

      console.log('Access token refreshed successfully');
      return tokenData.access_token;
    } catch (error) {
      lastError = error;
      console.error(`Token refresh attempt ${attempt} error:`, error.message);

      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  console.error('All token refresh attempts failed');
  throw lastError || new Error('Token refresh failed after multiple attempts');
}

// Helper function to find or create a folder in Google Drive
async function findOrCreateFolder(accessToken, folderName, parentId = null) {
  try {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    } else {
      query += ` and 'root' in parents`;
    }

    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      console.error('Folder search failed:', await searchResponse.text());
      return null;
    }

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      console.log(`Found existing folder: ${folderName} (${searchData.files[0].id})`);
      return searchData.files[0].id;
    }

    console.log(`Creating folder: ${folderName}`);
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (parentId) {
      metadata.parents = [parentId];
    }

    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      }
    );

    if (!createResponse.ok) {
      console.error('Folder creation failed:', await createResponse.text());
      return null;
    }

    const createData = await createResponse.json();
    console.log(`Created folder: ${folderName} (${createData.id})`);
    return createData.id;
  } catch (error) {
    console.error('findOrCreateFolder error:', error);
    return null;
  }
}

// Get or create the LinkCaster folder structure
async function getUploadFolderId(accessToken, fileType) {
  try {
    const mainFolderId = await findOrCreateFolder(accessToken, 'LinkCaster_Content');
    if (!mainFolderId) {
      console.log('Could not create main folder, uploading to root');
      return null;
    }

    const subfolderName = fileType.startsWith('video/') ? 'Videos' : 'Images';
    const subfolderId = await findOrCreateFolder(accessToken, subfolderName, mainFolderId);
    if (!subfolderId) {
      console.log('Could not create subfolder, uploading to main folder');
      return mainFolderId;
    }

    return subfolderId;
  } catch (error) {
    console.error('getUploadFolderId error:', error);
    return null;
  }
}

// Returns a valid access token, refreshing when expired or expiring within
// 5 minutes. Throws when not connected or refresh fails.
async function getValidAccessToken() {
  const storage = await chrome.storage.local.get([
    'googleDriveAccessToken',
    'googleDriveTokenExpiry'
  ]);

  if (!storage.googleDriveAccessToken) {
    throw new Error('Not connected to Google Drive. Please reconnect in settings.');
  }

  const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
  if (Date.now() >= storage.googleDriveTokenExpiry || fiveMinutesFromNow >= storage.googleDriveTokenExpiry) {
    try {
      return await refreshGoogleDriveToken();
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError);
      throw new Error('Token expired and refresh failed. Please reconnect to Google Drive.');
    }
  }

  return storage.googleDriveAccessToken;
}

// FR-6: the popup uploads straight to Drive via the resumable protocol.
// This handler supplies it with a fresh access token and the target folder id.
async function prepareDriveUpload(mimeType) {
  const accessToken = await getValidAccessToken();
  const folderId = await getUploadFolderId(accessToken, mimeType || '');
  return { success: true, accessToken, folderId };
}

// FR-6: finalizes a popup-side upload — makes the file link-shareable and
// fires the preview warm-up for videos.
async function finalizeDriveUpload(fileId, mimeType) {
  const accessToken = await getValidAccessToken();

  const permResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  if (!permResponse.ok) {
    console.error('Failed to make file shareable:', permResponse.status);
  }

  // FR-4: nudge Google's preview-processing queue for videos (best effort).
  // Primary: an offscreen document loads the Drive embed player invisibly —
  // a real playback attempt that works even after the popup closes.
  // Secondary: delayed thumbnail pings via alarms.
  if (mimeType && mimeType.startsWith('video/')) {
    warmUpViaOffscreen(fileId).catch(error =>
      console.log('[Background] Offscreen warm-up failed:', error.message)
    );
    warmUpDrivePreview(fileId, accessToken).catch(() => {});
    scheduleWarmupRetries(fileId);
  }

  const url = `https://drive.google.com/file/d/${fileId}/view`;
  console.log('Upload finalized:', url);
  return { success: true, url, fileId };
}

// FR-4: creates (or reuses) the offscreen document and asks it to load the
// Drive embed player for the uploaded file. Chrome allows one offscreen
// document per extension; it reports back when idle so we can close it.
async function warmUpViaOffscreen(fileId) {
  if (!chrome.offscreen) return;

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['IFRAME_SCRIPTING'],
      justification: 'Loads the Google Drive embed player invisibly so uploaded videos start preview processing without user interaction'
    });
  } catch (error) {
    // "Only a single offscreen document may be created" — already open, reuse it.
    if (!String(error.message).toLowerCase().includes('single offscreen')) {
      throw error;
    }
  }

  await chrome.runtime.sendMessage({ action: 'offscreenDriveWarmup', fileId }).catch(() => {});
  console.log('[Background] Offscreen warm-up requested for', fileId);
}

// FR-4: service workers are killed after ~30s idle, so delayed retries use
// chrome.alarms instead of setTimeout.
function scheduleWarmupRetries(fileId) {
  if (!chrome.alarms) return;
  chrome.alarms.create(`drive-warmup:${fileId}:1`, { delayInMinutes: 1 });
  chrome.alarms.create(`drive-warmup:${fileId}:2`, { delayInMinutes: 4 });
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith('drive-warmup:')) return;
  const fileId = alarm.name.split(':')[1];

  getValidAccessToken()
    .then(accessToken => warmUpDrivePreview(fileId, accessToken))
    .catch(error => console.log('[Background] Warm-up retry skipped:', error.message));
});

// FR-4: Google transcodes videos asynchronously after upload and exposes no
// API to expedite it. Requesting the thumbnail mimics the "user clicked the
// preview" signal that appears to re-trigger processing. Best effort only.
async function warmUpDrivePreview(fileId, accessToken) {
  try {
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!metaResponse.ok) return;

    const meta = await metaResponse.json();
    if (meta.thumbnailLink) {
      await fetch(meta.thumbnailLink, { credentials: 'omit' });
      console.log('[Background] Drive preview warm-up ping sent for', fileId);
    }
  } catch (error) {
    console.log('[Background] Preview warm-up failed (non-fatal):', error.message);
  }
}

// FR-2: relay image bytes through the backend for networks that block the
// Lightshot CDN. Returns a data URL (blobs cannot cross the message channel).
async function fetchMediaViaBackend(url) {
  const response = await fetch(`${BACKEND_URL}/api/fetch-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    let message = `Backend media fetch failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  // Keep relayed files well under the ~32MB extension message limit.
  if (blob.size > 20 * 1024 * 1024) {
    throw new Error('Relayed file too large');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return { success: true, dataUrl };
}

// ===== Lightshot Image Extraction =====

async function extractLightshotImage(url) {
  try {
    console.log('[Background] Extracting image from Lightshot URL:', url);

    // Tier 1: direct fetch from the user's browser (free, fast for users
    // whose network doesn't block Lightshot).
    try {
      const directResult = await extractLightshotDirect(url);
      if (directResult) {
        return { success: true, imageUrl: directResult };
      }
    } catch (directError) {
      console.log('[Background] Direct extraction failed:', directError.message);
    }

    // Tier 2: backend extraction — the server retries direct and then falls
    // back to its proxy for networks where Lightshot is blocked (FR-2).
    console.log('[Background] Trying backend API extraction...');
    const apiResponse = await fetch(`${BACKEND_URL}/api/extract-lightshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: url }),
      signal: AbortSignal.timeout(30000)
    });

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      if (data.success && data.imageUrl) {
        console.log('[Background] Backend API extracted image URL:', data.imageUrl);
        return { success: true, imageUrl: data.imageUrl };
      }
    }

    return { success: false, error: 'Could not extract image — the screenshot may be deleted' };
  } catch (error) {
    console.error('[Background] Lightshot extraction error:', error);
    return { success: false, error: error.message };
  }
}

// Direct (browser-side) Lightshot page fetch + og:image extraction.
// Returns the image URL or null when the page yields no match.
async function extractLightshotDirect(url) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://prnt.sc/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'max-age=0'
      },
      cache: 'no-cache',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Lightshot page: ${response.status}`);
    }

    const html = await response.text();
    console.log('[Background] Received HTML, length:', html.length);

    // Try multiple extraction patterns
    const patterns = [
      /property=["']og:image["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']\s+property=["']og:image["']/i,
      /name=["']twitter:image:src["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']\s+name=["']twitter:image["']/i,
      /src=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /src=["']\/\/((?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /"(https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"]+)"/i,
      /["']\/\/((?:image\.prntscr\.com|img\.lightshot\.app)\/[^"']+)["']/i,
      /https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)\/([a-zA-Z0-9_\-\.\/]+)/i
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = html.match(pattern);
      if (match) {
        let imageUrl = match[1];

        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (!imageUrl.startsWith('http')) {
          if (imageUrl.includes('image.prntscr.com') || imageUrl.includes('img.lightshot.app')) {
            imageUrl = 'https://' + imageUrl;
          } else {
            imageUrl = 'https://img.lightshot.app/' + imageUrl;
          }
        }

        console.log(`[Background] Found image URL with pattern ${i}:`, imageUrl);
        return imageUrl;
      }
    }

    console.log('[Background] No image URL found in HTML');
    return null;
}

// ===== iCloud Media Extraction =====

async function extractICloudMedia(url) {
  try {
    console.log('[Background] Extracting media from iCloud URL:', url);

    let token = null;
    let resolvedUrl = url;

    // Follow redirect for share.icloud.com URLs
    if (url.includes('share.icloud.com')) {
      try {
        console.log('[Background] Following share.icloud.com redirect...');
        const redirectResponse = await fetch(url, {
          method: 'HEAD',
          redirect: 'manual'
        });

        const location = redirectResponse.headers.get('Location');
        if (location) {
          resolvedUrl = location;
          console.log('[Background] Redirected to:', resolvedUrl);
        } else {
          const getResponse = await fetch(url, { redirect: 'follow' });
          resolvedUrl = getResponse.url;
          console.log('[Background] Followed redirect to:', resolvedUrl);
        }
      } catch (redirectError) {
        console.log('[Background] Redirect follow failed, trying token extraction from original URL');
      }
    }

    // Extract token from various URL patterns
    const tokenPatterns = [
      /share\.icloud\.com\/photos\/([A-Za-z0-9_-]+)/,
      /icloud\.com\/photos\/#([A-Za-z0-9_-]+)/,
      /icloudlinks\/([A-Za-z0-9_-]+)/,
      /sharedalbum\/#([A-Za-z0-9]+)/,
      /#([A-Za-z0-9_-]+)/,
      /\/photos\/([A-Za-z0-9_-]+)/
    ];

    for (const pattern of tokenPatterns) {
      const match = resolvedUrl.match(pattern) || url.match(pattern);
      if (match) {
        token = match[1];
        console.log('[Background] Extracted token:', token);
        break;
      }
    }

    if (!token) {
      throw new Error('Could not extract token from iCloud URL');
    }

    // Try backend API first
    try {
      console.log('[Background] Trying backend API for iCloud extraction...');
      const apiResponse = await fetch(`${BACKEND_URL}/api/extract-icloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url, token: token }),
        signal: AbortSignal.timeout(30000)
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        if (data.success && data.imageUrl) {
          console.log('[Background] Backend extracted iCloud image URL:', data.imageUrl);
          return { success: true, mediaUrl: data.imageUrl };
        }
      }
      console.log('[Background] Backend iCloud extraction not available or failed');
    } catch (backendError) {
      console.log('[Background] Backend API for iCloud not available:', backendError.message);
    }

    // Try to fetch page and extract og:image
    try {
      console.log('[Background] Trying to fetch iCloud page for meta tags...');

      const pageUrl = url.includes('share.icloud.com') ? url : `https://share.icloud.com/photos/${token}`;
      const pageResponse = await fetch(pageUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        redirect: 'follow'
      });

      if (pageResponse.ok) {
        const html = await pageResponse.text();

        const ogImagePatterns = [
          /property="og:image"\s+content="([^"]+)"/i,
          /content="([^"]+)"\s+property="og:image"/i,
          /name="twitter:image"\s+content="([^"]+)"/i
        ];

        for (const pattern of ogImagePatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            let imageUrl = match[1].replace(/&amp;/g, '&');
            console.log('[Background] Found og:image URL:', imageUrl);
            return { success: true, mediaUrl: imageUrl };
          }
        }
      }
    } catch (pageError) {
      console.log('[Background] Page fetch failed:', pageError.message);
    }

    throw new Error('Could not extract media from iCloud link. Please download the image first.');

  } catch (error) {
    console.error('[Background] iCloud extraction error:', error);
    return { success: false, error: error.message };
  }
}
