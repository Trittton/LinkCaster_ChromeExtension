/**
 * Constants Module
 * Centralized constants for the extension
 * @module constants
 */

/**
 * API endpoint URLs
 * @constant {Object}
 */
export const API_ENDPOINTS = {
  CATBOX: 'https://catbox.moe/user/api.php',
  FREEIMAGE: 'https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5',
  VGY: 'https://vgy.me/upload',
  GYAZO: 'https://upload.gyazo.com/api/upload',
  BACKEND: 'https://web-production-674b.up.railway.app',
  FLICKR_REQUEST_TOKEN: 'https://www.flickr.com/services/oauth/request_token',
  FLICKR_AUTHORIZE: 'https://www.flickr.com/services/oauth/authorize',
  FLICKR_ACCESS_TOKEN: 'https://www.flickr.com/services/oauth/access_token',
  FLICKR_UPLOAD: 'https://up.flickr.com/services/upload/'
};

/**
 * API documentation links
 * @constant {Object}
 */
export const API_LINKS = {
  vgy: 'https://vgy.me/account/details',
  flickr: 'https://www.flickr.com/services/apps/create/apply',
  gyazo: 'https://gyazo.com/oauth/applications'
};

/**
 * Service information text
 * @constant {Object}
 */
export const SERVICE_INFO = {
  vgy: 'Requires user key',
  flickr: 'Requires OAuth authentication',
  gyazo: 'Requires access token',
  gdrive: 'Requires Google Drive connection'
};

/**
 * File size limits in bytes
 * @constant {Object}
 */
export const FILE_LIMITS = {
  MAX_IMAGE_SIZE: 300 * 1024 * 1024, // 300MB
  MAX_VIDEO_SIZE: 700 * 1024 * 1024, // 700MB
  MAX_HISTORY_ITEMS: 50
};

/**
 * Storage keys for Chrome storage
 * @constant {Object}
 */
export const STORAGE_KEYS = {
  // Local storage
  INPUT_TEXT: 'inputText',
  OUTPUT_TEXT: 'outputText',
  OUTPUT_VISIBLE: 'outputVisible',
  CURRENT_TAB: 'currentTab',
  THEME: 'theme',
  GDRIVE_SESSION_ID: 'googleDriveSessionId',
  GDRIVE_CONNECTED: 'googleDriveConnected',
  GDRIVE_CONNECTED_AT: 'googleDriveConnectedAt',
  IMAGE_UPLOAD_SERVICE: 'imageUploadService',
  IMAGE_TIME_FILTER: 'imageTimeFilter',
  VIDEO_TIME_FILTER: 'videoTimeFilter',
  IMAGE_UPLOAD_HISTORY: 'imageUploadHistory',
  VIDEO_UPLOAD_HISTORY: 'videoUploadHistory',
  UPLOADED_IMAGE_FILES: 'uploadedImageFiles',
  UPLOADED_VIDEO_FILES: 'uploadedVideoFiles',
  ERROR_LOGS: 'errorLogs',

  // Sync storage (API keys, settings)
  SELECTED_HOST: 'selectedHost',
  VGY_API_KEY: 'vgyApiKey',
  GYAZO_ACCESS_TOKEN: 'gyazoAccessToken',
  FLICKR_API_KEY: 'flickrApiKey',
  FLICKR_API_SECRET: 'flickrApiSecret',
  FLICKR_OAUTH_TOKEN: 'flickrOAuthToken',
  FLICKR_OAUTH_TOKEN_SECRET: 'flickrOAuthTokenSecret',
  FLICKR_USERNAME: 'flickrUsername'
};

/**
 * IndexedDB keys for folder handles
 * @constant {Object}
 */
export const INDEXEDDB_KEYS = {
  IMAGE_FOLDER_HANDLE: 'imageFolderHandle',
  VIDEO_FOLDER_HANDLE: 'videoFolderHandle'
};

/**
 * Default time filter values (in minutes)
 * @constant {Object}
 */
export const DEFAULT_TIME_FILTERS = {
  IMAGE: 20,
  VIDEO: 20
};

/**
 * Supported image MIME types
 * @constant {string[]}
 */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml'
];

/**
 * Supported video MIME types
 * @constant {string[]}
 */
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska'
];

/**
 * Tab names
 * @constant {Object}
 */
export const TAB_NAMES = {
  CONVERT: 'convert',
  UPLOAD_IMG: 'upload-img',
  UPLOAD_VID: 'upload-vid'
};

/**
 * Theme names
 * @constant {Object}
 */
export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light'
};
