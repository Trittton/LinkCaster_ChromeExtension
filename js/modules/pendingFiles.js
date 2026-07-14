/**
 * Pending Files Module (FR-3)
 * Accumulating attachment list: files picked via the file input are added as
 * removable chips instead of replacing the previous selection (the native
 * <input type="file"> resets its FileList on every pick). Files leave the
 * list only when uploaded successfully or removed by the user.
 * All nodes are DOM-built (no HTML string interpolation — F-C3).
 * @module pendingFiles
 */

import { formatFileSize } from './uiHelpers.js';

/**
 * Creates a pending-files controller bound to a container element.
 * @param {HTMLElement} container - Element the chips render into
 * @returns {{add: Function, remove: Function, entries: Function, count: Function}}
 */
export function createPendingFiles(container) {
  /** @type {Map<string, {file: File, el: HTMLElement}>} */
  const items = new Map();
  let seq = 0;

  function refreshVisibility() {
    container.style.display = items.size ? 'flex' : 'none';
  }

  function keyOf(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function has(file) {
    for (const item of items.values()) {
      if (keyOf(item.file) === keyOf(file)) return true;
    }
    return false;
  }

  /**
   * Adds files as chips, skipping duplicates (same name+size+mtime).
   * @param {FileList|File[]} fileList - Files to add
   * @returns {number} How many files were actually added
   */
  function add(fileList) {
    let added = 0;

    for (const file of Array.from(fileList || [])) {
      if (has(file)) continue;

      const id = `pf-${seq++}`;
      const el = document.createElement('div');
      el.className = 'pending-file';

      const nameEl = document.createElement('span');
      nameEl.className = 'pending-file-name';
      nameEl.textContent = file.name;
      nameEl.title = file.name;

      const sizeEl = document.createElement('span');
      sizeEl.className = 'pending-file-size';
      sizeEl.textContent = formatFileSize(file.size);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'pending-file-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove from list';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.addEventListener('click', () => remove(id));

      el.append(nameEl, sizeEl, removeBtn);
      container.appendChild(el);
      items.set(id, { file, el });
      added++;
    }

    refreshVisibility();
    return added;
  }

  /**
   * Removes a chip by id.
   * @param {string} id - Chip id
   */
  function remove(id) {
    const item = items.get(id);
    if (!item) return;
    item.el.remove();
    items.delete(id);
    refreshVisibility();
  }

  /**
   * Returns pending files with their ids.
   * @returns {Array<{id: string, file: File}>}
   */
  function entries() {
    return [...items.entries()].map(([id, v]) => ({ id, file: v.file }));
  }

  /**
   * Returns the number of pending files.
   * @returns {number}
   */
  function count() {
    return items.size;
  }

  refreshVisibility();
  return { add, remove, entries, count };
}
