/**
 * File Monitoring Module
 * Handles folder monitoring and file detection
 * @module fileMonitoring
 */

import { logErrorMessage, logWarning } from './errorLogger.js';
import { isValidTimeFilter } from './validator.js';

/**
 * Scans a folder for files matching criteria
 * @param {FileSystemDirectoryHandle} folderHandle - Folder to scan
 * @param {string} fileType - File type to search for ('image' or 'video')
 * @param {number} timeFilterMinutes - Only include files from last N minutes
 * @param {Set<string>} uploadedFiles - Set of already uploaded file names
 * @returns {Promise<Array<{name: string, file: File, lastModified: number, size: number, uploaded: boolean}>>} Found files
 */
export async function scanFolder(folderHandle, fileType, timeFilterMinutes, uploadedFiles) {
  if (!folderHandle) {
    return [];
  }

  if (!isValidTimeFilter(timeFilterMinutes)) {
    await logWarning('Invalid time filter value', { timeFilterMinutes });
    timeFilterMinutes = 20; // Default fallback
  }

  try {
    // Check permission status
    const permission = await folderHandle.queryPermission({ mode: 'read' });

    if (permission !== 'granted') {
      console.log('Folder permission expired, user needs to reselect folder');
      return [];
    }

    const files = [];
    const now = Date.now();
    const timeLimit = timeFilterMinutes * 60 * 1000;

    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();

          // Check file type
          const isCorrectType = fileType === 'image'
            ? file.type.startsWith('image/')
            : file.type.startsWith('video/');

          if (!isCorrectType) continue;

          // Check file age
          const fileAge = now - file.lastModified;
          if (fileAge > timeLimit) continue;

          files.push({
            name: file.name,
            file: file,
            lastModified: file.lastModified,
            size: file.size,
            uploaded: uploadedFiles.has(file.name)
          });
        } catch (fileError) {
          await logWarning(`Failed to read file entry in folder`, fileError);
        }
      }
    }

    // Sort by most recent first
    return files.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    await logErrorMessage('Error scanning folder', error);
    return [];
  }
}

/**
 * Requests permission for folder access
 * @param {FileSystemDirectoryHandle} folderHandle - Folder handle to request permission for
 * @returns {Promise<boolean>} True if permission granted
 */
export async function requestFolderPermission(folderHandle) {
  if (!folderHandle) return false;

  try {
    const permission = await folderHandle.requestPermission({ mode: 'read' });
    return permission === 'granted';
  } catch (error) {
    await logErrorMessage('Failed to request folder permission', error);
    return false;
  }
}

/**
 * Checks if folder permission is still valid
 * @param {FileSystemDirectoryHandle} folderHandle - Folder handle to check
 * @returns {Promise<boolean>} True if permission still valid
 */
export async function checkFolderPermission(folderHandle) {
  if (!folderHandle) return false;

  try {
    const permission = await folderHandle.queryPermission({ mode: 'read' });
    return permission === 'granted';
  } catch (error) {
    return false;
  }
}
