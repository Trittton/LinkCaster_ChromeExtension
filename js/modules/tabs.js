/**
 * Tabs Module
 * Handles tab switching and state management
 * @module tabs
 */

import { getStorage, setStorage } from './storage.js';
import { logInfo } from './errorLogger.js';

/**
 * Currently active tab name
 * @type {string}
 */
let currentTab = 'convert';

/**
 * Tab button elements
 * @type {NodeList}
 */
let tabButtons = null;

/**
 * Tab content elements
 * @type {NodeList}
 */
let tabContents = null;

/**
 * Initializes the tab system
 * @param {NodeList} buttons - Tab button elements
 * @param {NodeList} contents - Tab content elements
 * @returns {Promise<void>}
 */
export async function initTabs(buttons, contents) {
  tabButtons = buttons;
  tabContents = contents;

  // Setup click listeners for all tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Load and restore last active tab
  await loadLastActiveTab();

  await logInfo('Tabs initialized', { activeTab: currentTab });
}

/**
 * Switches to a different tab
 * @param {string} tabName - Name of tab to switch to
 * @returns {void}
 */
export function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  tabButtons.forEach(button => {
    if (button.getAttribute('data-tab') === tabName) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // Update tab contents
  tabContents.forEach(content => {
    if (content.id === `tab-${tabName}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Save current tab
  setStorage({ currentTab: tabName });

  logInfo('Tab switched', { tab: tabName });
}

/**
 * Loads and restores the last active tab from storage
 * @returns {Promise<void>}
 */
export async function loadLastActiveTab() {
  const data = await getStorage(['currentTab']);

  if (data.currentTab) {
    switchTab(data.currentTab);
  } else {
    // Default to convert tab if no saved state
    switchTab('convert');
  }
}

/**
 * Gets the currently active tab name
 * @returns {string} Current tab name
 */
export function getCurrentTab() {
  return currentTab;
}

/**
 * Checks if a specific tab is currently active
 * @param {string} tabName - Tab name to check
 * @returns {boolean} True if tab is active
 */
export function isTabActive(tabName) {
  return currentTab === tabName;
}
