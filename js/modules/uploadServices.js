/**
 * Upload Services Module
 * Handles file uploads to cloud services (Catbox, vgy.me, Google Drive)
 * @module uploadServices
 */

import { logErrorMessage, logInfo, withErrorLogging } from './errorLogger.js';
import { sanitizeFilename } from './validator.js';
import { setStorage } from './storage.js';
import { getEffectiveMimeType } from './mimeFallback.js';

/**
 * Drive resumable-upload chunk size — must be a multiple of 256KiB (FR-6)
 * @constant {number}
 */
const DRIVE_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Downloads an image from URL
 * @param {string} url - Image URL
 * @returns {Promise<Blob>} Image blob
 */
export async function downloadImage(url) {
  const wrappedFn = withErrorLogging(async () => {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      if (!blob.type.startsWith('image/')) {
        throw new Error('URL does not point to a valid image');
      }

      return blob;
    } catch (directError) {
      // Fallback: relay the image through the backend for networks that
      // block the Lightshot CDN (FR-2). Only applies to known CDN hosts.
      const isLightshotCdn = /^https:\/\/(image\.prntscr\.com|img\.lightshot\.app)\//i.test(url);
      if (!isLightshotCdn) throw directError;

      await logInfo('Direct image download failed, trying backend relay', { url });
      const response = await chrome.runtime.sendMessage({ action: 'fetchMediaViaBackend', url });

      if (!response || !response.success || !response.dataUrl) {
        throw new Error(response?.error || directError.message);
      }

      const blob = await (await fetch(response.dataUrl)).blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('Backend relay did not return a valid image');
      }
      return blob;
    }
  }, 'downloadImage');

  return wrappedFn();
}

/**
 * Gets direct image URL from page (handles Lightshot, iCloud, etc.)
 * @param {string} url - Page or image URL
 * @returns {Promise<string>} Direct image URL
 */
export async function getDirectImageUrl(url) {
  // If already a direct image link, return it
  if (/\.(jpg|jpeg|png|gif|bmp|webp|mp4|mov|m4v)(\?.*)?$/i.test(url)) {
    return url;
  }

  // Handle iCloud shared photo/video links via backend
  if (url.includes('share.icloud.com') || url.includes('icloud.com/photos')) {
    return await withErrorLogging(async () => {
      console.log('[DEBUG] Processing iCloud URL via backend:', url);

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'extractICloudMedia',
          url: url
        });

        if (response && response.success && response.mediaUrl) {
          console.log('[DEBUG] Successfully extracted iCloud media URL:', response.mediaUrl);
          return response.mediaUrl;
        } else {
          const errorMsg = response?.error || 'Could not extract media from iCloud link';
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error('[DEBUG] iCloud extraction failed:', error.message);
        throw new Error('iCloud Photo Links are not supported. Please download the image first and use the Upload Img tab.');
      }
    }, 'getDirectImageUrl - iCloud')();
  }

  // Handle Lightshot/prnt.sc URLs
  if (url.includes('prnt.sc') || url.includes('prntscr.com')) {
    return await withErrorLogging(async () => {
      console.log('[DEBUG] Processing Lightshot URL:', url);

      // Try using background script to fetch the image URL
      try {
        console.log('[DEBUG] Attempting extraction via background script...');
        const response = await chrome.runtime.sendMessage({
          action: 'extractLightshotImage',
          url: url
        });

        if (response && response.success && response.imageUrl) {
          console.log('[DEBUG] Successfully extracted image URL:', response.imageUrl);
          return response.imageUrl;
        } else {
          console.warn('[DEBUG] Background extraction returned no URL:', response);
        }
      } catch (error) {
        console.warn('[DEBUG] Background extraction failed:', error.message);
      }

      // Fallback: Try direct fetch
      console.log('[DEBUG] Falling back to direct fetch...');
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch Lightshot page: ${response.status}`);
      }

      const html = await response.text();
      console.log('[DEBUG] HTML length:', html.length);

      // Try multiple patterns to find the image URL
      const patterns = [
        /property=["']og:image["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
        /name=["']twitter:image:src["']\s+content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
        /src=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
        /src=["']\/\/((?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']/i,
        /"(https?:\/\/(?:image\.prntscr\.com|img\.lightshot\.app)[^"]+)"/i,
        /content=["']([^"']*(?:image\.prntscr\.com|img\.lightshot\.app)[^"']*)["']\s+property=["']og:image["']/i,
        /(?:image\.prntscr\.com|img\.lightshot\.app)\/([^"'\s<>]+)/i
      ];

      for (const pattern of patterns) {
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
          console.log('[DEBUG] Extracted image URL from HTML:', imageUrl);
          return imageUrl;
        }
      }

      throw new Error('Could not find image in Lightshot page - the image may be deleted, or Lightshot requires JavaScript which we cannot execute');
    }, 'getDirectImageUrl - Lightshot')();
  }

  return url;
}

/**
 * Uploads file to Catbox.moe
 * @param {Blob|File} file - File to upload
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToCatbox(file) {
  const wrappedFn = withErrorLogging(async () => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 60000; // 60 seconds timeout

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Add delay before retries
        if (attempt > 0) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          await logInfo(`Waiting ${waitTime}ms before retry ${attempt}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const formData = new FormData();
        formData.append('fileToUpload', file, 'image.png');
        formData.append('reqtype', 'fileupload');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        await logInfo(`Uploading to Catbox (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);

        const response = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Catbox upload failed: ${response.status} - ${errorText}`);
        }

        const url = await response.text();

        if (url && url.startsWith('http')) {
          await logInfo('Catbox upload successful', { url, attempt: attempt + 1 });
          return url.trim();
        }

        throw new Error('Catbox returned invalid response: ' + url);
      } catch (error) {
        await logErrorMessage(`Catbox upload attempt ${attempt + 1} failed`, error);

        if (attempt === MAX_RETRIES) {
          if (error.name === 'AbortError') {
            throw new Error('Catbox upload timed out after 60 seconds. The service might be slow or unavailable.');
          }
          if (error.message.includes('Failed to fetch')) {
            throw new Error('Cannot connect to Catbox. Please check your internet connection or try again later.');
          }
          throw error;
        }

        await logInfo(`Will retry in a moment...`);
      }
    }
  }, 'uploadToCatbox');

  return wrappedFn();
}

/**
 * Uploads file to vgy.me
 * @param {Blob|File} file - File to upload
 * @param {string} userKey - vgy.me user key
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToVgy(file, userKey) {
  const wrappedFn = withErrorLogging(async () => {
    const formData = new FormData();
    formData.append('file', file, 'image.png');
    formData.append('userkey', userKey);

    const response = await fetch('https://vgy.me/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.error === true) {
      if (data.messages && data.messages.Unauthorized) {
        throw new Error('Invalid vgy.me user key. Please check your API credentials.');
      }

      if (data.messages) {
        const firstMessage = Object.values(data.messages)[0];
        throw new Error(`vgy.me: ${firstMessage}`);
      }

      throw new Error('vgy.me upload failed');
    }

    const url = data.image || data.url || data.link;
    if (url) {
      await logInfo('vgy.me upload successful', { url });
      return url;
    }

    throw new Error('vgy.me returned invalid response');
  }, 'uploadToVgy');

  return wrappedFn();
}

/**
 * Detects auth-related failures and converts them into the session-expired
 * sentinel error after flagging the connection as broken.
 * @param {string} errorMessage - Error message from background/API
 * @returns {Promise<Error>} Error to throw
 */
async function toUploadError(errorMessage) {
  const authErrors = [
    'Unauthorized',
    'Invalid session',
    'Token expired',
    'refresh failed',
    'reconnect to Google Drive',
    'Not connected to Google Drive'
  ];
  const isAuthError = errorMessage && authErrors.some(err =>
    errorMessage.toLowerCase().includes(err.toLowerCase())
  );

  if (isAuthError) {
    await setStorage({ googleDriveConnected: false });
    return new Error('GOOGLE_DRIVE_SESSION_EXPIRED');
  }
  return new Error(errorMessage || 'Google Drive upload failed');
}

/**
 * Uploads file to Google Drive using the resumable upload protocol (FR-6).
 * The file streams from the popup in 8MB chunks — no base64 encoding and no
 * extension message-size ceiling (chrome.runtime messages cap at 64MiB).
 * Note: the upload runs in the popup context; closing the popup aborts it.
 * @param {Blob|File} file - File to upload
 * @param {string} sessionId - Google Drive session ID (kept for compatibility)
 * @param {Function} [onProgress] - Called with (uploadedBytes, totalBytes)
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToGoogleDrive(file, sessionId, onProgress = null) {
  const wrappedFn = withErrorLogging(async () => {
    // Resolve MIME via extension fallback (FR-1): files with an empty
    // browser-reported type would otherwise upload as untyped.
    const mimeType = getEffectiveMimeType(file) || file.type || 'application/octet-stream';
    const extension = mimeType.split('/')[1] || 'png';
    const filename = sanitizeFilename(`image_${Date.now()}.${extension}`);

    // Background supplies a fresh access token and the target folder.
    const prep = await chrome.runtime.sendMessage({ action: 'prepareDriveUpload', mimeType });
    if (prep === undefined) {
      // The running service worker predates this handler (popups reload from
      // disk on every open; the background worker only reloads with the
      // extension itself).
      throw new Error('Extension was updated — reload LinkCaster at chrome://extensions (↻) and try again.');
    }
    if (!prep.success) {
      throw await toUploadError(prep.error);
    }

    // Open a resumable upload session.
    const metadata = { name: filename, mimeType };
    if (prep.folderId) {
      metadata.parents = [prep.folderId];
    }

    const initResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${prep.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(file.size)
        },
        body: JSON.stringify(metadata)
      }
    );

    if (initResponse.status === 401) {
      throw await toUploadError('Unauthorized');
    }
    if (!initResponse.ok) {
      throw new Error(`Failed to start Drive upload: ${initResponse.status}`);
    }

    const sessionUrl = initResponse.headers.get('Location');
    if (!sessionUrl) {
      throw new Error('Drive did not return an upload session URL');
    }

    // Send the file in chunks; each failed chunk retries with backoff.
    let offset = 0;
    let fileMeta = null;

    while (offset < file.size) {
      const end = Math.min(offset + DRIVE_CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, end);

      let response = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch(sessionUrl, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
            body: chunk
          });
        } catch {
          response = null;
        }

        if (response && (response.status === 308 || response.ok)) break;

        if (attempt === 3) {
          throw new Error(`Drive chunk upload failed${response ? `: ${response.status}` : ' (network error)'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }

      if (response.status === 308) {
        // Drive reports how much it actually received; continue from there.
        const range = response.headers.get('Range');
        offset = range ? parseInt(range.split('-')[1], 10) + 1 : end;
      } else {
        fileMeta = await response.json();
        offset = file.size;
      }

      if (onProgress) {
        onProgress(Math.min(offset, file.size), file.size);
      }
    }

    if (!fileMeta || !fileMeta.id) {
      throw new Error('Drive upload finished without returning a file id');
    }

    // Background makes the file link-shareable and warms up video previews.
    const fin = await chrome.runtime.sendMessage({
      action: 'finalizeDriveUpload',
      fileId: fileMeta.id,
      mimeType
    });
    if (fin === undefined) {
      throw new Error('Extension was updated — reload LinkCaster at chrome://extensions (↻) and try again.');
    }
    if (!fin.success) {
      throw await toUploadError(fin.error);
    }

    await logInfo('Google Drive upload successful', { url: fin.url });
    return fin.url;
  }, 'uploadToGoogleDrive');

  return wrappedFn();
}
