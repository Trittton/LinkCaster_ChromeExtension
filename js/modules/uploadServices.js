/**
 * Upload Services Module
 * Handles file uploads to various cloud services
 * @module uploadServices
 */

import { logErrorMessage, logInfo, withErrorLogging } from './errorLogger.js';
import { validateImageFile, sanitizeFilename } from './validator.js';
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
 * Gets direct image URL from page (handles Lightshot, etc.)
 * @param {string} url - Page or image URL
 * @returns {Promise<string>} Direct image URL
 */
export async function getDirectImageUrl(url) {
  // If already a direct image link, return it
  if (/\.(jpg|jpeg|png|gif|bmp|webp)(\?.*)?$/i.test(url)) {
    return url;
  }

  // Handle Lightshot/prnt.sc URLs
  if (url.includes('prnt.sc') || url.includes('prntscr.com')) {
    return await withErrorLogging(async () => {
      console.log('[DEBUG] Processing Lightshot URL:', url);

      // Try using background script to fetch the image URL with proper rendering
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

      // Fallback: Try direct fetch (unlikely to work due to JS requirement)
      console.log('[DEBUG] Falling back to direct fetch...');
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch Lightshot page: ${response.status}`);
      }

      const html = await response.text();
      console.log('[DEBUG] HTML length:', html.length);

      // Try multiple patterns to find the image URL (Lightshot now uses img.lightshot.app)
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
            // Check if it contains the domain
            if (imageUrl.includes('image.prntscr.com') || imageUrl.includes('img.lightshot.app')) {
              imageUrl = 'https://' + imageUrl;
            } else {
              // Default to img.lightshot.app (Lightshot's current CDN)
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
    const formData = new FormData();
    formData.append('fileToUpload', file, 'image.png');
    formData.append('reqtype', 'fileupload');

    const response = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Catbox upload failed: ${response.status}`);
    }

    const url = await response.text();

    if (url && url.startsWith('http')) {
      await logInfo('Catbox upload successful', { url });
      return url.trim();
    }

    throw new Error('Catbox returned invalid response: ' + url);
  }, 'uploadToCatbox');

  return wrappedFn();
}

/**
 * Uploads file to FreeImage.host
 * @param {Blob|File} file - File to upload
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToFreeImage(file) {
  const wrappedFn = withErrorLogging(async () => {
    const formData = new FormData();
    formData.append('source', file);
    formData.append('type', 'file');
    formData.append('action', 'upload');

    const response = await fetch('https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`FreeImage upload failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.image && data.image.url) {
      await logInfo('FreeImage upload successful', { url: data.image.url });
      return data.image.url;
    }

    throw new Error('FreeImage returned invalid response');
  }, 'uploadToFreeImage');

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
 * Uploads file to Gyazo
 * @param {Blob|File} file - File to upload
 * @param {string} accessToken - Gyazo access token
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToGyazo(file, accessToken) {
  const wrappedFn = withErrorLogging(async () => {
    const formData = new FormData();
    formData.append('imagedata', file);

    const response = await fetch('https://upload.gyazo.com/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Gyazo access token. Please check your API credentials.');
      }

      const errorMsg = data.message || data.error || response.statusText;
      throw new Error(`Gyazo: ${errorMsg}`);
    }

    const url = data.url || data.permalink_url;
    if (url) {
      await logInfo('Gyazo upload successful', { url });
      return url;
    }

    throw new Error('Gyazo returned invalid response');
  }, 'uploadToGyazo');

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
      if (response.error && (response.error.includes('Unauthorized') || response.error.includes('Invalid session'))) {
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

/**
 * Uploads file to Flickr
 * @param {Blob|File} file - File to upload
 * @param {string} oauthToken - Flickr OAuth token
 * @param {string} oauthTokenSecret - Flickr OAuth token secret
 * @returns {Promise<string>} Uploaded file URL
 */
export async function uploadToFlickr(file, oauthToken, oauthTokenSecret) {
  const wrappedFn = withErrorLogging(async () => {
    const base64Data = await blobToBase64(file);

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'flickrUpload',
        imageData: base64Data,
        oauthToken: oauthToken,
        oauthTokenSecret: oauthTokenSecret
      }, (response) => {
        if (response && response.success) {
          logInfo('Flickr upload successful', { url: response.url });
          resolve(response.url);
        } else {
          reject(new Error(response?.error || 'Flickr upload failed'));
        }
      });
    });
  }, 'uploadToFlickr');

  return wrappedFn();
}
