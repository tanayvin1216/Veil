/**
 * Debug logging utility with configurable levels.
 * @module logger
 */

import { LOG_LEVELS } from './constants.js';

const PREFIX = '[AccessAgent]';

let currentLevel = LOG_LEVELS.INFO;

/**
 * Set the minimum log level for output.
 * @param {number} level - One of LOG_LEVELS values
 */
export function setLogLevel(level) {
  currentLevel = level;
}

/**
 * Get the current log level.
 * @returns {number}
 */
export function getLogLevel() {
  return currentLevel;
}

/**
 * Log a debug message (verbose, development only).
 * @param {string} context - Component or module name
 * @param {...*} args - Values to log
 */
export function debug(context, ...args) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.debug(`${PREFIX}[${context}]`, ...args);
  }
}

/**
 * Log an informational message.
 * @param {string} context - Component or module name
 * @param {...*} args - Values to log
 */
export function info(context, ...args) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.info(`${PREFIX}[${context}]`, ...args);
  }
}

/**
 * Log a warning.
 * @param {string} context - Component or module name
 * @param {...*} args - Values to log
 */
export function warn(context, ...args) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn(`${PREFIX}[${context}]`, ...args);
  }
}

/**
 * Log an error.
 * @param {string} context - Component or module name
 * @param {...*} args - Values to log
 */
export function error(context, ...args) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error(`${PREFIX}[${context}]`, ...args);
  }
}
