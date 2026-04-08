/**
 * Safe ARIA attribute injection utility.
 * Non-destructive: never removes existing valid attributes, only adds or enhances.
 * All mutations are tracked for repair reports.
 * @module aria-injector
 */

import { debug } from '../utils/logger.js';

const CONTEXT = 'AriaInjector';
const DATA_ATTR = 'data-accessagent';
const DATA_REPAIR_TYPE = 'data-accessagent-repair';

/**
 * Set an ARIA attribute on an element only if it doesn't already have a valid value.
 * @param {HTMLElement} element - Target DOM element
 * @param {string} attribute - ARIA attribute name (e.g., 'aria-label')
 * @param {string} value - Value to set
 * @returns {boolean} True if the attribute was injected, false if skipped
 */
export function setAriaIfMissing(element, attribute, value) {
  if (!element || !attribute || !value) {
    return false;
  }

  const existing = element.getAttribute(attribute);
  if (existing && existing.trim().length > 0) {
    debug(CONTEXT, `Skipped ${attribute} on <${element.tagName}> — already has: "${existing}"`);
    return false;
  }

  element.setAttribute(attribute, value);
  markAsRepaired(element, attribute);
  debug(CONTEXT, `Injected ${attribute}="${value}" on <${element.tagName}>`);
  return true;
}

/**
 * Set a role attribute on an element only if it doesn't already have one.
 * @param {HTMLElement} element - Target DOM element
 * @param {string} role - ARIA role to set
 * @returns {boolean} True if the role was injected
 */
export function setRoleIfMissing(element, role) {
  if (!element || !role) {
    return false;
  }

  const existing = element.getAttribute('role');
  if (existing && existing.trim().length > 0) {
    return false;
  }

  element.setAttribute('role', role);
  markAsRepaired(element, 'role');
  debug(CONTEXT, `Injected role="${role}" on <${element.tagName}>`);
  return true;
}

/**
 * Add an aria-level attribute to fix heading hierarchy.
 * @param {HTMLElement} element - Target heading or element with role="heading"
 * @param {number} level - Heading level (1-6)
 * @returns {boolean} True if the level was set
 */
export function setHeadingLevel(element, level) {
  if (!element || level < 1 || level > 6) {
    return false;
  }

  element.setAttribute('role', 'heading');
  element.setAttribute('aria-level', String(level));
  markAsRepaired(element, 'heading-level');
  debug(CONTEXT, `Fixed heading level to ${level} on <${element.tagName}>`);
  return true;
}

/**
 * Inject a skip navigation link at the top of the body if none exists.
 * @param {Document} doc - The document to modify
 * @param {string} targetId - ID of the main content element to skip to
 * @returns {boolean} True if the skip link was injected
 */
export function injectSkipLink(doc, targetId) {
  if (!doc || !targetId) {
    return false;
  }

  const existingSkip = doc.querySelector(
    'a[href^="#"][class*="skip"], a[href^="#main"], .skip-nav, .skip-link, .skip-to-content'
  );
  if (existingSkip) {
    debug(CONTEXT, 'Skip link already exists, skipping injection');
    return false;
  }

  const targetElement = doc.getElementById(targetId);
  if (!targetElement) {
    debug(CONTEXT, `Skip target #${targetId} not found`);
    return false;
  }

  const skipLink = doc.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = 'Skip to main content';
  skipLink.setAttribute(DATA_ATTR, 'skip-link');
  skipLink.setAttribute('class', 'accessagent-skip-link');
  skipLink.style.cssText = [
    'position: absolute',
    'top: -9999px',
    'left: -9999px',
    'z-index: 999999',
    'padding: 8px 16px',
    'background: #000',
    'color: #fff',
    'font-size: 14px',
    'font-family: system-ui, sans-serif',
    'text-decoration: none',
    'border-radius: 0 0 4px 0',
  ].join('; ');

  skipLink.addEventListener('focus', () => {
    skipLink.style.top = '0';
    skipLink.style.left = '0';
  });

  skipLink.addEventListener('blur', () => {
    skipLink.style.top = '-9999px';
    skipLink.style.left = '-9999px';
  });

  const body = doc.body;
  if (body && body.firstChild) {
    body.insertBefore(skipLink, body.firstChild);
  }

  debug(CONTEXT, `Injected skip link targeting #${targetId}`);
  return true;
}

/**
 * Inject an aria-live region for dynamic announcements.
 * @param {Document} doc - The document to modify
 * @param {string} id - Unique ID for the live region
 * @param {'polite'|'assertive'} politeness - aria-live value
 * @returns {HTMLElement|null} The created live region element
 */
export function injectLiveRegion(doc, id, politeness = 'polite') {
  if (!doc || !id) {
    return null;
  }

  const existing = doc.getElementById(id);
  if (existing) {
    return existing;
  }

  const region = doc.createElement('div');
  region.id = id;
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('role', 'status');
  region.setAttribute(DATA_ATTR, 'live-region');
  region.style.cssText = [
    'position: absolute',
    'width: 1px',
    'height: 1px',
    'overflow: hidden',
    'clip: rect(0, 0, 0, 0)',
    'white-space: nowrap',
    'border: 0',
    'padding: 0',
    'margin: -1px',
  ].join('; ');

  if (doc.body) {
    doc.body.appendChild(region);
  }

  debug(CONTEXT, `Injected aria-live="${politeness}" region #${id}`);
  return region;
}

/**
 * Announce a message through an aria-live region.
 * @param {Document} doc - The document
 * @param {string} regionId - ID of the live region
 * @param {string} message - Message to announce
 */
export function announce(doc, regionId, message) {
  const region = doc.getElementById(regionId);
  if (!region) {
    return;
  }

  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Mark an element as repaired by AccessAgent for tracking.
 * @param {HTMLElement} element - The repaired element
 * @param {string} repairType - Type of repair applied
 */
function markAsRepaired(element, repairType) {
  element.setAttribute(DATA_ATTR, 'repaired');
  const existing = element.getAttribute(DATA_REPAIR_TYPE) || '';
  const types = existing ? existing.split(',') : [];
  if (!types.includes(repairType)) {
    types.push(repairType);
  }
  element.setAttribute(DATA_REPAIR_TYPE, types.join(','));
}

/**
 * Count all elements repaired by AccessAgent on the page.
 * @param {Document} doc - The document to scan
 * @returns {Record<string, number>} Counts by repair type
 */
export function getRepairCounts(doc) {
  const repaired = doc.querySelectorAll(`[${DATA_REPAIR_TYPE}]`);
  const counts = {};

  for (const element of repaired) {
    const types = (element.getAttribute(DATA_REPAIR_TYPE) || '').split(',');
    for (const type of types) {
      if (type) {
        counts[type] = (counts[type] || 0) + 1;
      }
    }
  }

  return counts;
}
