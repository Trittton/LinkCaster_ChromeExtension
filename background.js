// Background service worker for the extension
// Handles OAuth and API interactions that require signing

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

    // Store session ID and connection status
    await chrome.storage.local.set({
      googleDriveSessionId: sessionId,
      googleDriveConnected: true,
      googleDriveConnectedAt: Date.now()
    });

    return { success: true, sessionId: sessionId };
  } catch (error) {
    console.error('Google Drive OAuth error:', error);
    return { success: false, error: error.message };
  }
}

async function handleGoogleDriveUpload(fileData, fileName, sessionId) {
  try {
    console.log(`Uploading ${fileName} to Google Drive...`);

    const uploadResponse = await fetch(`${BACKEND_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        fileData: fileData,
        fileName: fileName
      })
    });

    const result = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    console.log('Upload successful:', result.previewUrl);
    return { success: true, url: result.previewUrl, fileId: result.fileId };
  } catch (error) {
    console.error('Google Drive upload error:', error);
    return { success: false, error: error.message };
  }
}
