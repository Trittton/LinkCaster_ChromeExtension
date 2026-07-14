/**
 * Upload Results Module (FR-3 "bubbles")
 * Renders per-file upload result cards with live status, replacing the
 * plain-textarea output. Shared by the Upload Img and Upload Vid tabs.
 * All nodes are DOM-built (no HTML string interpolation — F-C3).
 * @module uploadResults
 */

import { formatFileSize } from './uiHelpers.js';

/**
 * Validates that a URL is safe to use as a link target.
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Creates an upload results controller bound to a container element.
 * @param {HTMLElement} container - Element the result cards render into
 * @returns {{reset: Function, add: Function, setUploading: Function, setDone: Function, setFailed: Function, urls: Function, count: Function}}
 */
export function createUploadResults(container) {
  /** @type {Map<string, {el: HTMLElement, statusEl: HTMLElement, actionsEl: HTMLElement, url: string|null}>} */
  const items = new Map();

  function reset() {
    items.clear();
    container.textContent = '';
  }

  /**
   * Adds a file card in the "queued" state.
   * @param {string} id - Unique id for this file (e.g. name + index)
   * @param {string} name - File name
   * @param {number} size - File size in bytes
   */
  function add(id, name, size) {
    const el = document.createElement('div');
    el.className = 'upload-result-item';

    const header = document.createElement('div');
    header.className = 'upload-result-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'upload-result-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const sizeEl = document.createElement('span');
    sizeEl.className = 'upload-result-size';
    sizeEl.textContent = formatFileSize(size);

    header.append(nameEl, sizeEl);

    const statusEl = document.createElement('div');
    statusEl.className = 'upload-result-status';
    statusEl.textContent = 'Queued…';

    const actionsEl = document.createElement('div');
    actionsEl.className = 'upload-result-actions';

    el.append(header, statusEl, actionsEl);
    container.appendChild(el);

    items.set(id, { el, statusEl, actionsEl, url: null });
  }

  /**
   * Marks a file as uploading, optionally with byte-level progress (FR-6).
   * @param {string} id - File id
   * @param {number|null} [percent] - Progress percentage (0-100), or null for indeterminate
   */
  function setUploading(id, percent = null) {
    const item = items.get(id);
    if (!item) return;
    item.el.className = 'upload-result-item uploading';
    item.statusEl.textContent = percent === null ? 'Uploading…' : `Uploading… ${percent}%`;
  }

  /**
   * Marks a file as uploaded and renders the link + copy action.
   * @param {string} id - File id
   * @param {string} url - Uploaded file URL
   * @param {string} [note] - Optional extra status note (e.g. Drive processing hint)
   */
  function setDone(id, url, note = '') {
    const item = items.get(id);
    if (!item) return;
    item.url = url;
    item.el.className = 'upload-result-item done';
    item.statusEl.textContent = note ? `✓ Uploaded — ${note}` : '✓ Uploaded';
    item.actionsEl.textContent = '';

    if (isSafeHttpUrl(url)) {
      const link = document.createElement('a');
      link.className = 'upload-result-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = url;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'secondary upload-result-copy';
      copyBtn.textContent = 'Copy Link';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 1500);
        } catch {
          copyBtn.textContent = 'Copy failed';
        }
      });

      item.actionsEl.append(link, copyBtn);
    }
  }

  /**
   * Marks a file as failed with a reason and optional retry.
   * @param {string} id - File id
   * @param {string} reason - Human-readable failure reason
   * @param {Function} [retryFn] - Called when the user clicks Retry
   */
  function setFailed(id, reason, retryFn = null) {
    const item = items.get(id);
    if (!item) return;
    item.el.className = 'upload-result-item failed';
    item.statusEl.textContent = `✗ ${reason}`;
    item.actionsEl.textContent = '';

    if (retryFn) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'secondary upload-result-retry';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => retryFn());
      item.actionsEl.appendChild(retryBtn);
    }
  }

  /**
   * Returns all successfully uploaded URLs in insertion order.
   * @returns {string[]}
   */
  function urls() {
    return [...items.values()].map((i) => i.url).filter(Boolean);
  }

  /**
   * Returns the number of tracked items.
   * @returns {number}
   */
  function count() {
    return items.size;
  }

  return { reset, add, setUploading, setDone, setFailed, urls, count };
}
