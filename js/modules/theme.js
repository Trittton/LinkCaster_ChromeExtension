/**
 * Theme Module
 * Handles dark/light theme switching and persistence
 * @module theme
 */

import { getStorage, setStorage } from './storage.js';
import { logInfo } from './errorLogger.js';

/**
 * Theme toggle button element
 * @type {HTMLElement|null}
 */
let themeToggleButton = null;

/**
 * Initializes the theme system
 * @param {HTMLElement} themeToggle - Theme toggle button element
 * @returns {Promise<void>}
 */
export async function initTheme(themeToggle) {
  themeToggleButton = themeToggle;

  if (!themeToggleButton) {
    console.warn('Theme toggle button not found');
    return;
  }

  // Load saved theme
  const savedTheme = await loadTheme();
  applyTheme(savedTheme);

  // Setup toggle listener
  themeToggleButton.addEventListener('click', handleThemeToggle);

  await logInfo('Theme system initialized', { theme: savedTheme });
}

/**
 * Loads saved theme from storage
 * @returns {Promise<string>} Theme name ('dark' or 'light')
 */
async function loadTheme() {
  const data = await getStorage(['theme']);
  return data.theme || 'dark'; // Default to dark theme
}

/**
 * Applies theme to document
 * @param {string} theme - Theme name ('dark' or 'light')
 * @returns {void}
 */
export function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

/**
 * Updates theme icon in toggle button
 * @param {string} theme - Current theme name
 * @returns {void}
 */
function updateThemeIcon(theme) {
  if (!themeToggleButton) return;

  const icon = themeToggleButton.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Handles theme toggle button click
 * @returns {Promise<void>}
 */
async function handleThemeToggle() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  applyTheme(newTheme);
  await setStorage({ theme: newTheme });
  await logInfo('Theme changed', { from: currentTheme, to: newTheme });
}

/**
 * Gets current theme
 * @returns {string} Current theme name
 */
export function getCurrentTheme() {
  return document.body.getAttribute('data-theme') || 'dark';
}

/**
 * Sets theme programmatically
 * @param {string} theme - Theme to set ('dark' or 'light')
 * @returns {Promise<void>}
 */
export async function setTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') {
    console.warn(`Invalid theme: ${theme}, must be 'dark' or 'light'`);
    return;
  }

  applyTheme(theme);
  await setStorage({ theme });
  await logInfo('Theme set', { theme });
}
