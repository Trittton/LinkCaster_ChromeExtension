// Background service worker for the extension
// Handles OAuth and API interactions that require signing

// Token refresh lock to prevent race conditions during parallel uploads
let tokenRefreshPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Image Link Converter extension installed');

  // Set default settings
  chrome.storage.sync.get(['selectedHost'], (result) => {
    if (!result.selectedHost) {
      chrome.storage.sync.set({ selectedHost: 'catbox' });
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    // Handle image download if needed
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        sendResponse({ success: true, blob: blob });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.action === 'flickrOAuth') {
    handleFlickrOAuth(request.config)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'flickrUpload') {
    handleFlickrUpload(request.imageData, request.oauthToken, request.oauthTokenSecret, request.config)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'gyazoOAuth') {
    handleGyazoOAuth(request.config)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// OAuth 1.0a helper functions
function generateNonce() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generateTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

async function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
  // Sort parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Create signature base string
  const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const messageData = encoder.encode(signatureBaseString);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to base64
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

  return signatureBase64;
}

async function handleFlickrOAuth(config) {
  try {
    // Step 1: Get request token
    const requestTokenUrl = config.requestTokenUrl;
    const oauthParams = {
      oauth_nonce: generateNonce(),
      oauth_timestamp: generateTimestamp(),
      oauth_consumer_key: config.apiKey,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_version: '1.0',
      oauth_callback: config.callbackUrl
    };

    const signature = await generateOAuthSignature('GET', requestTokenUrl, oauthParams, config.apiSecret);
    oauthParams.oauth_signature = signature;

    const requestTokenQueryString = Object.keys(oauthParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    const requestTokenResponse = await fetch(`${requestTokenUrl}?${requestTokenQueryString}`);
    const requestTokenText = await requestTokenResponse.text();

    if (!requestTokenResponse.ok) {
      throw new Error('Failed to get request token: ' + requestTokenText);
    }

    // Parse request token response
    const requestTokenParams = new URLSearchParams(requestTokenText);
    const oauthToken = requestTokenParams.get('oauth_token');
    const oauthTokenSecret = requestTokenParams.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      throw new Error('Invalid request token response');
    }

    // Step 2: Launch authorization flow
    const authorizeUrl = `${config.authorizeUrl}?oauth_token=${oauthToken}&perms=write`;

    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authorizeUrl,
      interactive: true
    });

    // Parse the callback URL for the verifier
    const callbackParams = new URL(redirectUrl).searchParams;
    const oauthVerifier = callbackParams.get('oauth_verifier');

    if (!oauthVerifier) {
      throw new Error('No OAuth verifier received');
    }

    // Step 3: Exchange for access token
    const accessTokenUrl = config.accessTokenUrl;
    const accessTokenParams = {
      oauth_nonce: generateNonce(),
      oauth_timestamp: generateTimestamp(),
      oauth_consumer_key: config.apiKey,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_version: '1.0',
      oauth_token: oauthToken,
      oauth_verifier: oauthVerifier
    };

    const accessSignature = await generateOAuthSignature(
      'GET',
      accessTokenUrl,
      accessTokenParams,
      config.apiSecret,
      oauthTokenSecret
    );
    accessTokenParams.oauth_signature = accessSignature;

    const accessTokenQueryString = Object.keys(accessTokenParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(accessTokenParams[key])}`)
      .join('&');

    const accessTokenResponse = await fetch(`${accessTokenUrl}?${accessTokenQueryString}`);
    const accessTokenText = await accessTokenResponse.text();

    if (!accessTokenResponse.ok) {
      throw new Error('Failed to get access token: ' + accessTokenText);
    }

    // Parse access token response
    const accessTokenParams2 = new URLSearchParams(accessTokenText);
    const finalOauthToken = accessTokenParams2.get('oauth_token');
    const finalOauthTokenSecret = accessTokenParams2.get('oauth_token_secret');
    const username = accessTokenParams2.get('username') || accessTokenParams2.get('fullname');

    if (!finalOauthToken || !finalOauthTokenSecret) {
      throw new Error('Invalid access token response');
    }

    return {
      success: true,
      token: finalOauthToken,
      tokenSecret: finalOauthTokenSecret,
      username: username
    };

  } catch (error) {
    console.error('Flickr OAuth error:', error);
    return { success: false, error: error.message };
  }
}

async function handleFlickrUpload(base64Data, oauthToken, oauthTokenSecret, config) {
  try {
    // Convert base64 to blob
    const response = await fetch(base64Data);
    const blob = await response.blob();

    // Create form data
    const formData = new FormData();
    formData.append('photo', blob, 'image.jpg');

    // OAuth parameters
    const oauthParams = {
      oauth_nonce: generateNonce(),
      oauth_timestamp: generateTimestamp(),
      oauth_consumer_key: config.apiKey,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_version: '1.0',
      oauth_token: oauthToken
    };

    // Generate signature (for upload, we don't include the file data in signature)
    const signature = await generateOAuthSignature(
      'POST',
      config.uploadUrl,
      oauthParams,
      config.apiSecret,
      oauthTokenSecret
    );
    oauthParams.oauth_signature = signature;

    // Build Authorization header
    const authHeader = 'OAuth ' + Object.keys(oauthParams)
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    // Upload image
    const uploadResponse = await fetch(config.uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader
      },
      body: formData
    });

    const uploadText = await uploadResponse.text();

    if (!uploadResponse.ok) {
      throw new Error('Upload failed: ' + uploadText);
    }

    // Parse XML response to get photo ID
    const photoIdMatch = uploadText.match(/<photoid>(\d+)<\/photoid>/);
    if (!photoIdMatch) {
      throw new Error('Could not parse photo ID from response');
    }

    const photoId = photoIdMatch[1];

    // Construct Flickr URL (you might want to get the actual URL via flickr.photos.getInfo API call)
    // For now, we'll return a simple flickr.com URL
    const flickrUrl = `https://www.flickr.com/photos/upload/edit/?ids=${photoId}`;

    return {
      success: true,
      url: flickrUrl,
      photoId: photoId
    };

  } catch (error) {
    console.error('Flickr upload error:', error);
    return { success: false, error: error.message };
  }
}

// OAuth 2.0 for Gyazo
async function handleGyazoOAuth(config) {
  try {
    // Step 1: Build authorization URL
    const state = generateNonce();
    const authUrl = `${config.authorizeUrl}?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(config.callbackUrl)}&response_type=code&state=${state}`;

    console.log('Launching Gyazo OAuth flow...', authUrl);

    // Step 2: Launch OAuth flow
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    console.log('Got redirect URL:', redirectUrl);

    // Step 3: Parse callback URL
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    if (returnedState !== state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Step 4: Exchange code for access token
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Gyazo token data:', tokenData);

    if (!tokenData.access_token) {
      throw new Error('No access token in response');
    }

    return {
      success: true,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      username: tokenData.username || null
    };

  } catch (error) {
    console.error('Gyazo OAuth error:', error);
    return { success: false, error: error.message };
  }
}

// ===== Google Drive OAuth and Upload =====

const BACKEND_URL = 'https://web-production-674b.up.railway.app';
let currentSession = null;

// Handle Google Drive OAuth message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
      // Keep sessionId for backward compatibility
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
  // If a refresh is already in progress, wait for it instead of starting a new one
  if (tokenRefreshPromise) {
    console.log('Token refresh already in progress, waiting for it to complete...');
    return await tokenRefreshPromise;
  }

  // Create and store the refresh promise
  tokenRefreshPromise = doTokenRefresh();

  try {
    const result = await tokenRefreshPromise;
    return result;
  } finally {
    // Clear the promise when done (success or failure)
    tokenRefreshPromise = null;
  }
}

// Actual token refresh implementation
async function doTokenRefresh() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  const storage = await chrome.storage.local.get(['googleDriveRefreshToken']);

  if (!storage.googleDriveRefreshToken) {
    throw new Error('No refresh token available. Please reconnect to Google Drive.');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Refreshing Google Drive access token (attempt ${attempt}/${MAX_RETRIES})...`);

      // Use backend to refresh token (backend has client secret)
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

      // Update stored tokens
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
    // Search for existing folder
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

    // Create folder if not found
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
    // First, find or create LinkCaster_Content folder
    const mainFolderId = await findOrCreateFolder(accessToken, 'LinkCaster_Content');
    if (!mainFolderId) {
      console.log('Could not create main folder, uploading to root');
      return null;
    }

    // Determine subfolder based on file type
    const subfolderName = fileType.startsWith('video/') ? 'Videos' : 'Images';

    // Find or create the subfolder
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

    // Get tokens from local storage
    let storage = await chrome.storage.local.get([
      'googleDriveAccessToken',
      'googleDriveRefreshToken',
      'googleDriveTokenExpiry'
    ]);

    // Check if we have tokens stored locally
    if (!storage.googleDriveAccessToken) {
      // Fallback to old server-side session method
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

    // Upload directly to Google Drive using local tokens
    console.log('Uploading directly to Google Drive API...');

    // Parse base64 data
    const base64Match = fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 data format');
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    // Convert base64 to blob
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Get the folder to upload to (LinkCaster_Content/Images or Videos)
    const folderId = await getUploadFolderId(storage.googleDriveAccessToken, mimeType);

    // Prepare multipart upload
    const metadata = {
      name: fileName,
      mimeType: mimeType
    };

    // If we have a folder ID, set the parent
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

    // Upload to Google Drive
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

    // Generate preview URL
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

    // Verify session before upload
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

    // APPROACH 1: Try using backend proxy service to get rendered HTML
    try {
      console.log('[Background] Attempting backend API extraction...');
      const apiResponse = await fetch(`${BACKEND_URL}/api/extract-lightshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
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

    // APPROACH 2: Try fetching with realistic browser headers
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

    // Log the full HTML for analysis (first 3000 chars to see more)
    console.log('[Background] HTML content (first 3000 chars):', html.substring(0, 3000));

    // Try multiple extraction patterns - including JavaScript variables and embedded data
    // Note: Lightshot uses both image.prntscr.com AND img.lightshot.app domains
    const patterns = [
      // Meta tags (most common - Lightshot puts image URLs in og:image and twitter:image)
      /property=["']og:image["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']\s+property=["']og:image["']/i,
      /name=["']twitter:image:src["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']\s+name=["']twitter:image["']/i,
      // JavaScript variables that might contain the image URL
      /var\s+\w+\s*=\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      /const\s+\w+\s*=\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      /let\s+\w+\s*=\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      // Common JavaScript patterns
      /imageUrl\s*[=:]\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      /url\s*[=:]\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      /src\s*[=:]\s*["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"']+)["']/i,
      // Direct image src
      /src=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      /src=["']\/\/((?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      // JSON data
      /"url"\s*:\s*"(https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"]+)"/i,
      /"image"\s*:\s*"(https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"]+)"/i,
      // Data attributes
      /data-[a-z-]*=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
      // Any occurrence in quotes (various quote styles)
      /["'](https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)\/[^"']+)["']/i,
      /`(https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)\/[^`]+)`/i,
      // Without protocol
      /["']\/\/((?:image\.prntscr\.com|img\.lightshot\.app)\/[^"']+)["']/i,
      // Any occurrence (last resort)
      /https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)\/([a-zA-Z0-9_\-\.\/]+)/i,
      /(?:image\.prntscr\.com|img\.lightshot\.app)\/([a-zA-Z0-9_\-\.\/]+)/i
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = html.match(pattern);
      if (match) {
        let imageUrl = match[1];

        // Normalize URL
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (!imageUrl.startsWith('http')) {
          // If we only got the path/filename, construct full URL
          if (imageUrl.includes('image.prntscr.com') || imageUrl.includes('img.lightshot.app')) {
            imageUrl = 'https://' + imageUrl;
          } else {
            // Default to img.lightshot.app (Lightshot's current CDN)
            imageUrl = 'https://img.lightshot.app/' + imageUrl;
          }
        }

        console.log(`[Background] Found image URL with pattern ${i}:`, imageUrl);
        return { success: true, imageUrl: imageUrl };
      }
    }

    // If no patterns matched, log more details for debugging
    console.log('[Background] No image URL found in HTML');
    console.log('[Background] Searching for any image domain occurrence...');

    // Check if domain exists anywhere
    const domains = ['image.prntscr.com', 'img.lightshot.app'];
    for (const domain of domains) {
      if (html.includes(domain)) {
        const index = html.indexOf(domain);
        console.log(`[Background] Found "${domain}" at position:`, index);
        console.log('[Background] Context around it:', html.substring(Math.max(0, index - 100), Math.min(html.length, index + 200)));
      }
    }

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

    // Extract token from URL
    // Patterns:
    // - https://share.icloud.com/photos/TOKEN (redirects to icloud.com/photos/#TOKEN)
    // - https://www.icloud.com/photos/#TOKEN
    // - https://www.icloud.com/photos/#/icloudlinks/TOKEN/
    // - https://www.icloud.com/sharedalbum/#TOKEN
    let token = null;
    let resolvedUrl = url;

    // First, if it's a share.icloud.com URL, we need to follow the redirect
    if (url.includes('share.icloud.com')) {
      try {
        console.log('[Background] Following share.icloud.com redirect...');
        const redirectResponse = await fetch(url, {
          method: 'HEAD',
          redirect: 'manual'
        });

        // Check for redirect location
        const location = redirectResponse.headers.get('Location');
        if (location) {
          resolvedUrl = location;
          console.log('[Background] Redirected to:', resolvedUrl);
        } else {
          // Try GET request if HEAD didn't work
          const getResponse = await fetch(url, { redirect: 'follow' });
          resolvedUrl = getResponse.url;
          console.log('[Background] Followed redirect to:', resolvedUrl);
        }
      } catch (redirectError) {
        console.log('[Background] Redirect follow failed, trying token extraction from original URL');
      }
    }

    // Try share.icloud.com/photos/TOKEN pattern
    const shareIcloudMatch = resolvedUrl.match(/share\.icloud\.com\/photos\/([A-Za-z0-9_-]+)/);
    if (shareIcloudMatch) {
      token = shareIcloudMatch[1];
      console.log('[Background] Extracted share.icloud.com token:', token);
    }

    // Try icloud.com/photos/#TOKEN pattern (direct token after hash)
    if (!token) {
      const photosHashMatch = resolvedUrl.match(/icloud\.com\/photos\/#([A-Za-z0-9_-]+)/);
      if (photosHashMatch) {
        token = photosHashMatch[1];
        console.log('[Background] Extracted icloud.com/photos/# token:', token);
      }
    }

    // Try icloudlinks pattern
    if (!token) {
      const icloudLinksMatch = resolvedUrl.match(/icloudlinks\/([A-Za-z0-9_-]+)/);
      if (icloudLinksMatch) {
        token = icloudLinksMatch[1];
        console.log('[Background] Extracted iCloud Links token:', token);
      }
    }

    // Try shared album pattern
    if (!token) {
      const sharedAlbumMatch = resolvedUrl.match(/sharedalbum\/#([A-Za-z0-9]+)/);
      if (sharedAlbumMatch) {
        token = sharedAlbumMatch[1];
        console.log('[Background] Extracted Shared Album token:', token);
      }
    }

    // Try generic hash pattern as last resort
    if (!token) {
      const hashMatch = resolvedUrl.match(/#([A-Za-z0-9_-]+)/);
      if (hashMatch) {
        token = hashMatch[1];
        console.log('[Background] Extracted generic token:', token);
      }
    }

    // Also try from original URL if nothing found
    if (!token && url !== resolvedUrl) {
      const origMatch = url.match(/\/photos\/([A-Za-z0-9_-]+)/);
      if (origMatch) {
        token = origMatch[1];
        console.log('[Background] Extracted token from original URL path:', token);
      }
    }

    if (!token) {
      throw new Error('Could not extract token from iCloud URL');
    }

    // APPROACH 0: Try backend server with headless browser (most reliable)
    try {
      console.log('[Background] Trying backend API for iCloud extraction...');
      const apiResponse = await fetch(`${BACKEND_URL}/api/extract-icloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url, token: token }),
        signal: AbortSignal.timeout(30000) // 30 second timeout for headless browser
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

    // APPROACH 1: Fetch the share.icloud.com page and extract og:image meta tag
    // iCloud Photo Links include a preview image in the meta tags
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
        console.log('[Background] Got iCloud page HTML, length:', html.length);
        console.log('[Background] HTML preview:', html.substring(0, 1500));

        // Try to extract og:image meta tag
        const ogImagePatterns = [
          /property="og:image"\s+content="([^"]+)"/i,
          /content="([^"]+)"\s+property="og:image"/i,
          /property='og:image'\s+content='([^']+)'/i,
          /content='([^']+)'\s+property='og:image'/i,
          /name="twitter:image"\s+content="([^"]+)"/i,
          /content="([^"]+)"\s+name="twitter:image"/i
        ];

        for (const pattern of ogImagePatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            let imageUrl = match[1];
            // Decode HTML entities
            imageUrl = imageUrl.replace(/&amp;/g, '&');
            console.log('[Background] Found og:image URL:', imageUrl);
            return { success: true, mediaUrl: imageUrl };
          }
        }

        // Try to find any image URL in the page
        const imgPatterns = [
          /"(https:\/\/[^"]+\.(?:jpg|jpeg|png|gif|heic|webp)[^"]*)"/gi,
          /'(https:\/\/[^']+\.(?:jpg|jpeg|png|gif|heic|webp)[^']*)'/gi,
          /(https:\/\/cvws\.icloud-content\.com[^"'\s]+)/gi,
          /(https:\/\/[^"'\s]*icloud[^"'\s]*\.(?:jpg|jpeg|png|gif|heic|webp|mov|mp4)[^"'\s]*)/gi
        ];

        for (const pattern of imgPatterns) {
          const matches = html.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && !match[1].includes('favicon') && !match[1].includes('icon')) {
              let imageUrl = match[1].replace(/&amp;/g, '&');
              console.log('[Background] Found image URL in page:', imageUrl);
              return { success: true, mediaUrl: imageUrl };
            }
          }
        }
      }
    } catch (pageError) {
      console.log('[Background] Page fetch failed:', pageError.message);
    }

    // APPROACH 2: Try the cvws (content viewing web service) API
    try {
      console.log('[Background] Trying cvws API for iCloud Photo Link...');

      const cvwsResponse = await fetch(`https://cvws.icloud-content.com/B/${token}/download`, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        redirect: 'follow'
      });

      console.log('[Background] cvws response status:', cvwsResponse.status);
      console.log('[Background] cvws response URL:', cvwsResponse.url);

      if (cvwsResponse.ok) {
        const contentType = cvwsResponse.headers.get('content-type');
        if (contentType && (contentType.includes('image') || contentType.includes('video'))) {
          console.log('[Background] Got direct media from cvws API');
          return { success: true, mediaUrl: cvwsResponse.url };
        }
      }

      if (cvwsResponse.url && cvwsResponse.url !== `https://cvws.icloud-content.com/B/${token}/download`) {
        console.log('[Background] cvws redirected to:', cvwsResponse.url);
        return { success: true, mediaUrl: cvwsResponse.url };
      }
    } catch (cvwsError) {
      console.log('[Background] cvws API failed:', cvwsError.message);
    }

    // APPROACH 3: Try iCloud Photos web API with different endpoints
    try {
      console.log('[Background] Trying iCloud Photos web API...');

      const endpoints = [
        `https://www.icloud.com/sharedstreams/${token}/en_US/`,
        `https://p23-sharedstreams.icloud.com/${token}/sharedstreams/webstream`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: endpoint.includes('webstream') ? 'POST' : 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/html, */*',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: endpoint.includes('webstream') ? JSON.stringify({ streamCtag: null }) : undefined
          });

          if (response.ok) {
            const text = await response.text();
            console.log('[Background] Endpoint response:', text.substring(0, 500));

            const urlMatch = text.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|gif|heic|mov|mp4)[^"'\s]*/i);
            if (urlMatch) {
              console.log('[Background] Extracted media URL:', urlMatch[0]);
              return { success: true, mediaUrl: urlMatch[0] };
            }
          }
        } catch (e) {
          console.log('[Background] Endpoint failed:', endpoint, e.message);
        }
      }
    } catch (photosApiError) {
      console.log('[Background] Photos web API failed:', photosApiError.message);
    }

    // APPROACH 3: Try multiple iCloud partition servers (sharedstreams API)
    // This works for iCloud Shared Albums
    const partitions = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
                        '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
                        '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
                        '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
                        '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
                        '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
                        '61', '62', '63', '64', '65', '66', '67', '68', '69', '70'];

    let webstreamData = null;
    let workingBaseUrl = null;

    for (const partition of partitions) {
      const baseUrl = `https://p${partition}-sharedstreams.icloud.com/${token}/sharedstreams`;

      try {
        console.log(`[Background] Trying iCloud partition p${partition}...`);

        const webstreamResponse = await fetch(`${baseUrl}/webstream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ streamCtag: null })
        });

        if (webstreamResponse.ok) {
          webstreamData = await webstreamResponse.json();

          // Check if we got redirected to a different host
          const redirectHost = webstreamResponse.headers.get('X-Apple-MMe-Host');
          if (redirectHost) {
            workingBaseUrl = `https://${redirectHost}/${token}/sharedstreams`;
            console.log('[Background] Redirected to:', workingBaseUrl);
          } else {
            workingBaseUrl = baseUrl;
          }

          console.log('[Background] Found working partition:', partition);
          break;
        }
      } catch (partitionError) {
        console.log(`[Background] Partition p${partition} failed:`, partitionError.message);
      }
    }

    if (!webstreamData || !workingBaseUrl) {
      throw new Error('Could not connect to iCloud servers. The link may be invalid or expired.');
    }

    console.log('[Background] Webstream data:', JSON.stringify(webstreamData).substring(0, 500));

    // Extract photo GUIDs from webstream
    const photos = webstreamData.photos || [];
    if (photos.length === 0) {
      throw new Error('No photos found in iCloud link');
    }

    // Get the first photo (for single image links)
    const photo = photos[0];
    const photoGuid = photo.photoGuid;

    if (!photoGuid) {
      throw new Error('Could not extract photo identifier');
    }

    console.log('[Background] Photo GUID:', photoGuid);

    // Get asset URLs
    const assetUrlsResponse = await fetch(`${workingBaseUrl}/webasseturls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ photoGuids: [photoGuid] })
    });

    if (!assetUrlsResponse.ok) {
      throw new Error('Failed to get asset URLs from iCloud');
    }

    const assetUrlsData = await assetUrlsResponse.json();
    console.log('[Background] Asset URLs data:', JSON.stringify(assetUrlsData).substring(0, 500));

    // Find the best quality asset
    const items = assetUrlsData.items || {};
    let bestAsset = null;
    let maxSize = 0;

    // Get derivatives from the photo to find the best quality
    const derivatives = photo.derivatives || {};

    for (const [key, derivative] of Object.entries(derivatives)) {
      const checksum = derivative.checksum;
      if (checksum && items[checksum]) {
        const fileSize = parseInt(derivative.fileSize) || 0;
        if (fileSize > maxSize) {
          maxSize = fileSize;
          bestAsset = items[checksum];
        }
      }
    }

    // If no derivative matched, try to get any asset
    if (!bestAsset) {
      const assetKeys = Object.keys(items);
      if (assetKeys.length > 0) {
        bestAsset = items[assetKeys[0]];
      }
    }

    if (!bestAsset || !bestAsset.url_location || !bestAsset.url_path) {
      throw new Error('Could not find downloadable asset URL');
    }

    // Construct the final URL
    const mediaUrl = `https://${bestAsset.url_location}${bestAsset.url_path}`;
    console.log('[Background] Extracted iCloud media URL:', mediaUrl);

    return { success: true, mediaUrl: mediaUrl };

  } catch (error) {
    console.error('[Background] iCloud extraction error:', error);
    return { success: false, error: error.message };
  }
}
