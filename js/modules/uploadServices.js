/**
 * Upload Services Module
 * Handles file uploads to cloud services (Catbox, vgy.me, Google Drive)
 * @module uploadServices
 */

import { logErrorMessage, logInfo, withErrorLogging } from './errorLogger.js';
import { sanitizeFilename } from './validator.js';
import { getStorage, setStorage } from './storage.js';

/**
 * Converts blob to base64 data URL
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 data URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads an image from URL
 * @param {string} url - Image URL
 * @returns {Promise<Blob>} Image blob
 */
export async function downloadImage(url) {
  const wrappedFn = withErrorLogging(async () => {
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
 * Uploads file to Google Drive
 * @param {Blob|File} file - File to upload
 * @param {string} sessionId - Google Drive session ID
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToGoogleDrive(file, sessionId) {
  const wrappedFn = withErrorLogging(async () => {
    const fileData = await blobToBase64(file);
    const extension = file.type.split('/')[1] || 'png';
    const filename = sanitizeFilename(`image_${Date.now()}.${extension}`);

    const response = await chrome.runtime.sendMessage({
      action: 'googleDriveUpload',
      fileData: fileData,
      fileName: filename,
      sessionId: sessionId
    });

    if (response.success) {
      await logInfo('Google Drive upload successful', { url: response.url });
      return response.url;
    } else {
      // Check for auth-related errors
      const authErrors = [
        'Unauthorized',
        'Invalid session',
        'Token expired',
        'refresh failed',
        'reconnect to Google Drive'
      ];
      const isAuthError = response.error && authErrors.some(err =>
        response.error.toLowerCase().includes(err.toLowerCase())
      );

      if (isAuthError) {
        await getStorage(['googleDriveConnected']).then(() =>
          setStorage({ googleDriveConnected: false })
        );
        throw new Error('GOOGLE_DRIVE_SESSION_EXPIRED');
      }
      throw new Error(response.error);
    }
  }, 'uploadToGoogleDrive');

  return wrappedFn();
}
