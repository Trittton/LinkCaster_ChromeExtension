/**
 * Validation and Sanitization Module
 * Provides input validation and sanitization utilities
 * @module validator
 */

import { logWarning } from './errorLogger.js';

/**
 * Maximum file size in bytes (100MB)
 * @constant {number}
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Maximum video file size in bytes (500MB)
 * @constant {number}
 */
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

/**
 * Allowed image MIME types
 * @constant {Set<string>}
 */
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml'
]);

/**
 * Allowed video MIME types
 * @constant {Set<string>}
 */
export const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska'
]);

/**
 * Validates a URL string
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates an image URL based on extension or known services
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid image URL
 */
export function isValidImageUrl(url) {
  if (!isValidUrl(url)) return false;

  const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp)(\?.*)?$/i;
  const knownServices = /(prnt\.sc|prntscr\.com|lightshot\.com|i\.imgur\.com|imgur\.com)/i;

  return imageExtensions.test(url) || knownServices.test(url);
}

/**
 * Validates a file object
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @param {number} [options.maxSize] - Maximum file size in bytes
 * @param {Set<string>} [options.allowedTypes] - Allowed MIME types
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateFile(file, options = {}) {
  const { maxSize = MAX_FILE_SIZE, allowedTypes = null } = options;

  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'Invalid file object' };
  }

  // Check file size
  if (file.size > maxSize) {
    const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
    return { valid: false, error: `File size exceeds ${sizeMB}MB limit` };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check MIME type if allowedTypes specified
  if (allowedTypes && !allowedTypes.has(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed` };
  }

  return { valid: true };
}

/**
 * Validates an image file
 * @param {File} file - Image file to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateImageFile(file) {
  return validateFile(file, {
    maxSize: MAX_FILE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  });
}

/**
 * Validates a video file
 * @param {File} file - Video file to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateVideoFile(file) {
  return validateFile(file, {
    maxSize: MAX_VIDEO_SIZE,
    allowedTypes: ALLOWED_VIDEO_TYPES
  });
}

/**
 * Sanitizes HTML string to prevent XSS attacks
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Sanitizes a filename by removing potentially dangerous characters
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'file';

  // Remove path traversal attempts
  filename = filename.replace(/\.\./g, '');

  // Remove special characters except common ones
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Ensure filename isn't too long
  if (filename.length > 255) {
    const ext = filename.substring(filename.lastIndexOf('.'));
    filename = filename.substring(0, 255 - ext.length) + ext;
  }

  return filename;
}

/**
 * Validates API key format (basic check)
 * @param {string} apiKey - API key to validate
 * @returns {boolean} True if valid format
 */
export function isValidApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;

  // Basic validation: at least 8 characters, no whitespace
  return apiKey.length >= 8 && !/\s/.test(apiKey);
}

/**
 * Validates session ID format
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;

  // Basic validation: non-empty, no whitespace, reasonable length
  return sessionId.length > 0 && sessionId.length < 256 && !/\s/.test(sessionId);
}

/**
 * Extracts and validates URLs from text
 * @param {string} text - Text containing URLs
 * @returns {string[]} Array of valid URLs
 */
export function extractValidUrls(text) {
  if (!text || typeof text !== 'string') return [];

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];

  const validUrls = matches.filter(url => isValidUrl(url));

  if (matches.length !== validUrls.length) {
    logWarning('Some URLs were filtered out during validation', {
      total: matches.length,
      valid: validUrls.length
    });
  }

  return validUrls;
}

/**
 * Validates a batch of files
 * @param {File[]} files - Files to validate
 * @param {Object} options - Validation options
 * @returns {{valid: File[], invalid: Array<{file: File, error: string}>}} Validation results
 */
export function validateFiles(files, options = {}) {
  const valid = [];
  const invalid = [];

  for (const file of files) {
    const result = validateFile(file, options);
    if (result.valid) {
      valid.push(file);
    } else {
      invalid.push({ file, error: result.error });
    }
  }

  return { valid, invalid };
}

/**
 * Validates time filter value (in minutes)
 * @param {number} minutes - Time in minutes
 * @returns {boolean} True if valid
 */
export function isValidTimeFilter(minutes) {
  return typeof minutes === 'number' && minutes > 0 && minutes <= 1440;
}
