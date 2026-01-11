/**
 * Storage Module
 * Provides utilities for Chrome storage and IndexedDB operations
 * @module storage
 */

import { logErrorMessage } from './errorLogger.js';

/**
 * Retrieves data from Chrome storage (local or sync)
 * @param {string[]} keys - Keys to retrieve
 * @param {string} [area='local'] - Storage area ('local' or 'sync')
 * @returns {Promise<Object>} Retrieved data
 */
export async function getStorage(keys, area = 'local') {
  try {
    const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
    return await storage.get(keys);
  } catch (error) {
    await logErrorMessage(`Failed to get storage (${area})`, error);
    return {};
  }
}

/**
 * Sets data in Chrome storage (local or sync)
 * @param {Object} data - Data to store
 * @param {string} [area='local'] - Storage area ('local' or 'sync')
 * @returns {Promise<boolean>} True if successful
 */
export async function setStorage(data, area = 'local') {
  try {
    const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
    await storage.set(data);
    return true;
  } catch (error) {
    await logErrorMessage(`Failed to set storage (${area})`, error);
    return false;
  }
}

/**
 * Removes data from Chrome storage
 * @param {string|string[]} keys - Keys to remove
 * @param {string} [area='local'] - Storage area ('local' or 'sync')
 * @returns {Promise<boolean>} True if successful
 */
export async function removeStorage(keys, area = 'local') {
  try {
    const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
    await storage.remove(keys);
    return true;
  } catch (error) {
    await logErrorMessage(`Failed to remove storage (${area})`, error);
    return false;
  }
}

/**
 * Opens IndexedDB database
 * @param {string} [dbName='FolderMonitorDB'] - Database name
 * @param {number} [version=1] - Database version
 * @returns {Promise<IDBDatabase>} Database instance
 */
export function openDB(dbName = 'FolderMonitorDB', version = 1) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders');
      }
    };
  });
}

/**
 * Saves folder handle to IndexedDB
 * @param {string} key - Storage key
 * @param {FileSystemDirectoryHandle} handle - Folder handle to save
 * @returns {Promise<boolean>} True if successful
 */
export async function saveFolderHandle(key, handle) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['folders'], 'readwrite');
      const store = transaction.objectStore('folders');
      const request = store.put(handle, key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        logErrorMessage('Failed to save folder handle', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    await logErrorMessage('Failed to save folder handle', error);
    return false;
  }
}

/**
 * Retrieves folder handle from IndexedDB
 * @param {string} key - Storage key
 * @returns {Promise<FileSystemDirectoryHandle|null>} Folder handle or null
 */
export async function getFolderHandle(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['folders'], 'readonly');
      const store = transaction.objectStore('folders');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        logErrorMessage('Failed to get folder handle', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    await logErrorMessage('Failed to get folder handle', error);
    return null;
  }
}

/**
 * Adds item to history
 * @param {string} historyKey - History storage key
 * @param {Object} item - Item to add
 * @param {number} [maxItems=50] - Maximum items to keep
 * @returns {Promise<boolean>} True if successful
 */
export async function addToHistory(historyKey, item, maxItems = 50) {
  try {
    const data = await getStorage([historyKey]);
    const history = data[historyKey] || [];

    history.unshift(item);

    if (history.length > maxItems) {
      history.length = maxItems;
    }

    return await setStorage({ [historyKey]: history });
  } catch (error) {
    await logErrorMessage('Failed to add to history', error);
    return false;
  }
}

/**
 * Gets history items
 * @param {string} historyKey - History storage key
 * @returns {Promise<Array>} History items
 */
export async function getHistory(historyKey) {
  try {
    const data = await getStorage([historyKey]);
    return data[historyKey] || [];
  } catch (error) {
    await logErrorMessage('Failed to get history', error);
    return [];
  }
}

/**
 * Clears history
 * @param {string} historyKey - History storage key
 * @returns {Promise<boolean>} True if successful
 */
export async function clearHistory(historyKey) {
  return await setStorage({ [historyKey]: [] });
}
