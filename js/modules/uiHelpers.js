/**
 * UI Helpers Module
 * Provides utility functions for UI updates, themes, and status messages
 * @module uiHelpers
 */

import { sanitizeHtml } from './validator.js';

/**
 * Status message types
 * @readonly
 * @enum {string}
 */
export const StatusType = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning'
};

/**
 * Shows a status message to the user
 * @param {string} message - Message to display
 * @param {string} type - Message type from StatusType enum
 * @param {HTMLElement} [statusElement] - Custom status element (optional)
 * @returns {void}
 */
export function showStatus(message, type, statusElement = null) {
  const statusDiv = statusElement || document.getElementById('status');
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // Auto-hide after timeout
  const timeout = type === StatusType.ERROR ? 8000 : 5000;
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, timeout);
}

/**
 * Updates a progress bar
 * @param {number} current - Current progress value
 * @param {number} total - Total progress value
 * @param {string} message - Progress message
 * @param {HTMLElement} progressFill - Progress fill element
 * @param {HTMLElement} progressText - Progress text element
 * @returns {void}
 */
export function updateProgress(current, total, message, progressFill, progressText) {
  const percentage = (current / total) * 100;
  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressText) progressText.textContent = message;
}

/**
 * Formats a date for display
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Formats file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Creates a history item HTML element
 * @param {Object} item - History item data
 * @param {string} item.fileName - File name
 * @param {string} item.url - File URL
 * @param {number} item.timestamp - Upload timestamp
 * @param {string} copyBtnClass - CSS class for copy button
 * @param {string} openBtnClass - CSS class for open button
 * @returns {string} HTML string
 */
export function createHistoryItemHtml(item, copyBtnClass, openBtnClass) {
  const dateStr = formatDate(item.timestamp);
  const safeFileName = sanitizeHtml(item.fileName);
  const safeUrl = sanitizeHtml(item.url);

  return `
    <div class="history-item" data-url="${safeUrl}">
      <div class="history-item-header">
        <div class="history-item-name">${safeFileName}</div>
        <div class="history-item-date">${dateStr}</div>
      </div>
      <div class="history-item-url">${safeUrl}</div>
      <div class="history-item-actions">
        <button class="primary ${copyBtnClass}">Copy Link</button>
        <button class="secondary ${openBtnClass}">Open</button>
      </div>
    </div>
  `;
}

/**
 * Creates a file item HTML element for detected files
 * @param {Object} fileInfo - File information
 * @param {string} fileInfo.name - File name
 * @param {number} fileInfo.size - File size in bytes
 * @param {number} fileInfo.lastModified - Last modified timestamp
 * @param {boolean} fileInfo.uploaded - Whether file was uploaded
 * @param {string} [fileInfo.url] - URL of uploaded file (optional)
 * @param {boolean} [wasChecked=false] - Whether checkbox should be checked
 * @returns {string} HTML string
 */
export function createFileItemHtml(fileInfo, wasChecked = false) {
  const uploadedClass = fileInfo.uploaded ? 'uploaded' : '';

  // Create uploaded badge - clickable if URL is available
  let uploadedBadge = '';
  if (fileInfo.uploaded) {
    if (fileInfo.url) {
      uploadedBadge = `<a href="${sanitizeHtml(fileInfo.url)}" target="_blank" class="uploaded-badge-link" title="Click to open uploaded file">✓ Uploaded</a>`;
    } else {
      uploadedBadge = '<span class="uploaded-badge">✓ Uploaded</span>';
    }
  }

  const sizeStr = formatFileSize(fileInfo.size);
  const timeStr = new Date(fileInfo.lastModified).toLocaleTimeString();
  const safeFileName = sanitizeHtml(fileInfo.name);
  const checkedAttr = wasChecked ? 'checked' : '';

  return `
    <div class="file-item ${uploadedClass}" style="padding: 8px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${safeFileName}${uploadedBadge}
        </div>
        <div style="font-size: 10px; color: var(--text-dimmed); margin-top: 2px;">
          ${sizeStr} • ${timeStr}
        </div>
      </div>
      <input type="checkbox" class="file-checkbox ${uploadedClass}" data-filename="${safeFileName}" ${checkedAttr} style="margin-left: 8px;">
    </div>
  `;
}

