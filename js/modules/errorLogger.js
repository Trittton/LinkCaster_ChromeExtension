/**
 * Error Logger Module
 * Provides centralized error logging and monitoring functionality
 * @module errorLogger
 */

/**
 * Error severity levels
 * @readonly
 * @enum {string}
 */
export const ErrorLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Error log entry structure
 * @typedef {Object} ErrorLogEntry
 * @property {string} timestamp - ISO timestamp of the error
 * @property {string} level - Error severity level
 * @property {string} message - Error message
 * @property {string} [stack] - Error stack trace
 * @property {Object} [context] - Additional context data
 */

/**
 * Maximum number of error logs to keep in storage
 * @constant {number}
 */
const MAX_LOG_ENTRIES = 100;

/**
 * Logs an error with specified severity level
 * @param {string} level - Error severity level from ErrorLevel enum
 * @param {string} message - Error message
 * @param {Error|Object} [errorOrContext] - Error object or additional context
 * @returns {Promise<void>}
 */
export async function logError(level, message, errorOrContext = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };

  // Add stack trace if Error object provided
  if (errorOrContext instanceof Error) {
    entry.stack = errorOrContext.stack;
    entry.errorMessage = errorOrContext.message;
  } else if (errorOrContext) {
    entry.context = errorOrContext;
  }

  // Console log for development
  const consoleMethod = level === ErrorLevel.ERROR || level === ErrorLevel.CRITICAL ? 'error' :
                       level === ErrorLevel.WARNING ? 'warn' : 'log';
  console[consoleMethod](`[${level.toUpperCase()}] ${message}`, errorOrContext);

  // Store in chrome.storage.local for persistence
  try {
    const { errorLogs = [] } = await chrome.storage.local.get(['errorLogs']);
    errorLogs.unshift(entry);

    // Keep only last MAX_LOG_ENTRIES
    if (errorLogs.length > MAX_LOG_ENTRIES) {
      errorLogs.length = MAX_LOG_ENTRIES;
    }

    await chrome.storage.local.set({ errorLogs });
  } catch (storageError) {
    console.error('Failed to store error log:', storageError);
  }
}

/**
 * Logs an informational message
 * @param {string} message - Info message
 * @param {Object} [context] - Additional context data
 * @returns {Promise<void>}
 */
export function logInfo(message, context = null) {
  return logError(ErrorLevel.INFO, message, context);
}

/**
 * Logs a warning message
 * @param {string} message - Warning message
 * @param {Object} [context] - Additional context data
 * @returns {Promise<void>}
 */
export function logWarning(message, context = null) {
  return logError(ErrorLevel.WARNING, message, context);
}

/**
 * Logs an error message
 * @param {string} message - Error message
 * @param {Error|Object} [errorOrContext] - Error object or context
 * @returns {Promise<void>}
 */
export function logErrorMessage(message, errorOrContext = null) {
  return logError(ErrorLevel.ERROR, message, errorOrContext);
}

/**
 * Logs a critical error message
 * @param {string} message - Critical error message
 * @param {Error|Object} [errorOrContext] - Error object or context
 * @returns {Promise<void>}
 */
export function logCritical(message, errorOrContext = null) {
  return logError(ErrorLevel.CRITICAL, message, errorOrContext);
}

/**
 * Retrieves all error logs from storage
 * @returns {Promise<ErrorLogEntry[]>} Array of error log entries
 */
export async function getErrorLogs() {
  try {
    const { errorLogs = [] } = await chrome.storage.local.get(['errorLogs']);
    return errorLogs;
  } catch (error) {
    console.error('Failed to retrieve error logs:', error);
    return [];
  }
}

/**
 * Clears all error logs from storage
 * @returns {Promise<void>}
 */
export async function clearErrorLogs() {
  try {
    await chrome.storage.local.set({ errorLogs: [] });
    console.log('Error logs cleared');
  } catch (error) {
    console.error('Failed to clear error logs:', error);
  }
}

/**
 * Wraps an async function with error logging
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context description for error logs
 * @returns {Function} Wrapped function with error logging
 */
export function withErrorLogging(fn, context) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      await logErrorMessage(`Error in ${context}`, error);
      throw error; // Re-throw to allow caller to handle
    }
  };
}
