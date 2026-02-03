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
let currentSession = null;

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

  if (request.action === 'googleDriveUpload') {
    handleGoogleDriveUpload(request.fileData, request.fileName, request.sessionId)
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
});

// ===== Google Drive OAuth and Upload =====

async function handleGoogleDriveOAuth() {
  try {
    console.log('Starting Google Drive OAuth via backend...');

    const startResponse = await fetch(`${BACKEND_URL}/auth/google/start`);
    const { authUrl, sessionId } = await startResponse.json();

    currentSession = sessionId;

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

async function verifyGoogleDriveSession(sessionId) {
  try {
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/verify/${sessionId}`);
    const verifyData = await verifyResponse.json();
    return verifyData.authenticated === true;
  } catch (error) {
    console.error('Session verification error:', error);
    return false;
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

async function handleGoogleDriveUpload(fileData, fileName, sessionId) {
  try {
    console.log(`Uploading ${fileName} to Google Drive...`);
    console.log('File data length:', fileData?.length);

    let storage = await chrome.storage.local.get([
      'googleDriveAccessToken',
      'googleDriveRefreshToken',
      'googleDriveTokenExpiry'
    ]);

    if (!storage.googleDriveAccessToken) {
      console.log('No local tokens found, using server-side session...');
      return await uploadViaServerSession(fileData, fileName, sessionId);
    }

    // Refresh token if expired or expiring soon (within 5 minutes)
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    if (Date.now() >= storage.googleDriveTokenExpiry || fiveMinutesFromNow >= storage.googleDriveTokenExpiry) {
      try {
        storage.googleDriveAccessToken = await refreshGoogleDriveToken();
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw new Error('Token expired and refresh failed. Please reconnect to Google Drive.');
      }
    }

    console.log('Uploading directly to Google Drive API...');

    const base64Match = fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 data format');
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    const folderId = await getUploadFolderId(storage.googleDriveAccessToken, mimeType);

    const metadata = {
      name: fileName,
      mimeType: mimeType
    };

    if (folderId) {
      metadata.parents = [folderId];
      console.log(`Uploading to folder: ${folderId}`);
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartBody = new Blob([
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${mimeType}\r\n\r\n`,
      blob,
      close_delim
    ]);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${storage.googleDriveAccessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartBody
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.id;

    console.log(`File uploaded successfully, ID: ${fileId}`);

    // Make file publicly accessible
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${storage.googleDriveAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    console.log('File made public');

    const directUrl = `https://drive.google.com/file/d/${fileId}/view`;

    console.log('Upload successful:', directUrl);
    return { success: true, url: directUrl, fileId: fileId };
  } catch (error) {
    console.error('Google Drive upload error:', error);
    return { success: false, error: error.message };
  }
}

// Fallback function for old server-side session method
async function uploadViaServerSession(fileData, fileName, sessionId) {
  try {
    console.log('Using server-side session for upload...');

    const isSessionValid = await verifyGoogleDriveSession(sessionId);
    if (!isSessionValid) {
      throw new Error('Unauthorized: Invalid session ID. Please reconnect to Google Drive.');
    }

    const uploadResponse = await fetch(`${BACKEND_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        fileData: fileData,
        filename: fileName
      })
    });

    const result = await uploadResponse.json();

    if (!uploadResponse.ok) {
      if (uploadResponse.status === 401) {
        throw new Error('Unauthorized: Invalid session ID. Please reconnect to Google Drive.');
      }
      throw new Error(result.error || 'Upload failed');
    }

    return { success: true, url: result.url, fileId: result.fileId };
  } catch (error) {
    console.error('Server-side upload error:', error);
    throw error;
  }
}

// ===== Lightshot Image Extraction =====

async function extractLightshotImage(url) {
  try {
    console.log('[Background] Extracting image from Lightshot URL:', url);

    // Try backend API extraction first
    try {
      console.log('[Background] Attempting backend API extraction...');
      const apiResponse = await fetch(`${BACKEND_URL}/api/extract-lightshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url }),
        signal: AbortSignal.timeout(10000)
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        if (data.success && data.imageUrl) {
          console.log('[Background] Backend API extracted image URL:', data.imageUrl);
          return { success: true, imageUrl: data.imageUrl };
        }
      }
      console.log('[Background] Backend API extraction failed, trying direct fetch...');
    } catch (apiError) {
      console.log('[Background] Backend API not available:', apiError.message);
    }

    // Try fetching with realistic browser headers
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
        return { success: true, imageUrl: imageUrl };
      }
    }

    console.log('[Background] No image URL found in HTML');
    return { success: false, error: 'Could not find image URL in page' };

  } catch (error) {
    console.error('[Background] Lightshot extraction error:', error);
    return { success: false, error: error.message };
  }
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
