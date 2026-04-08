/**
 * Wrapper around chrome.storage.local for type-safe access.
 * @module storage
 */

import { DEFAULT_SETTINGS } from './constants.js';

/**
 * Retrieve a value from chrome.storage.local.
 * @param {string} key - Storage key
 * @returns {Promise<*>} The stored value, or the default if unset
 */
export async function get(key) {
  const result = await chrome.storage.local.get(key);
  if (result[key] !== undefined) {
    return result[key];
  }
  return DEFAULT_SETTINGS[key] ?? null;
}

/**
 * Retrieve multiple values from chrome.storage.local.
 * @param {string[]} keys - Storage keys
 * @returns {Promise<Record<string, *>>} Object mapping keys to values
 */
export async function getMultiple(keys) {
  const result = await chrome.storage.local.get(keys);
  const merged = {};
  for (const key of keys) {
    merged[key] = result[key] !== undefined
      ? result[key]
      : (DEFAULT_SETTINGS[key] ?? null);
  }
  return merged;
}

/**
 * Set a value in chrome.storage.local.
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 */
export async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Set multiple values in chrome.storage.local.
 * @param {Record<string, *>} entries - Key-value pairs to store
 * @returns {Promise<void>}
 */
export async function setMultiple(entries) {
  await chrome.storage.local.set(entries);
}

/**
 * Remove a value from chrome.storage.local.
 * @param {string} key - Storage key to remove
 * @returns {Promise<void>}
 */
export async function remove(key) {
  await chrome.storage.local.remove(key);
}

/**
 * Initialize default settings on first install.
 * Only sets values that don't already exist.
 * @returns {Promise<void>}
 */
export async function initializeDefaults() {
  const existing = await chrome.storage.local.get(
    Object.keys(DEFAULT_SETTINGS)
  );
  const toSet = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) {
      toSet[key] = defaultValue;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}
