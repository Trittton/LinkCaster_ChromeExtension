/**
 * MIME Fallback Module
 * Chrome derives File.type from the OS extension registry, not file contents.
 * On Windows machines without a registry mapping (common for .mov/.mkv/.avi),
 * File.type is an empty string and type checks silently fail (FR-1).
 * This module resolves an effective MIME type from the filename when needed.
 * @module mimeFallback
 */

/**
 * Extension → MIME type fallback table
 * @constant {Object<string, string>}
 */
const EXT_TO_MIME = {
  // Video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  // Image
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
};

/**
 * Returns the file's MIME type, falling back to an extension-based lookup
 * when the browser reports an empty type.
 * @param {File|{name: string, type?: string}} file - File or file-like object
 * @returns {string} Effective MIME type ('' if unknown)
 */
export function getEffectiveMimeType(file) {
  if (!file || !file.name) return '';
  if (file.type) return file.type;

  const dotIndex = file.name.lastIndexOf('.');
  if (dotIndex === -1) return '';

  const ext = file.name.slice(dotIndex + 1).toLowerCase();
  return EXT_TO_MIME[ext] || '';
}

/**
 * Checks whether a file is of the given media category ('image' or 'video'),
 * using the effective MIME type.
 * @param {File|{name: string, type?: string}} file - File to check
 * @param {string} category - 'image' or 'video'
 * @returns {boolean}
 */
export function isMediaCategory(file, category) {
  return getEffectiveMimeType(file).startsWith(`${category}/`);
}
