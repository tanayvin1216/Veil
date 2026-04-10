/**
 * SPA mutation detection and screen reader announcements.
 * Watches for significant DOM changes and announces them via aria-live.
 * @module mutation-observer
 */

import { MUTATION_DEBOUNCE_MS, MUTATION_THRESHOLD } from '../utils/constants.js';
import { debug, info } from '../utils/logger.js';
import { announce } from './aria-injector.js';

const CONTEXT = 'MutationObserver';
const LIVE_REGION_ID = 'veil-announcements';

/** @type {MutationObserver|null} */
let observer = null;

/** @type {number|null} */
let debounceTimer = null;

/** Track last URL for SPA route change detection */
let lastUrl = '';

/** Accumulated mutations during debounce window */
let pendingMutations = [];

/**
 * Start observing DOM mutations on the document body.
 * @param {Document} doc - The document to observe
 */
export function startObserving(doc) {
  if (observer) {
    stopObserving();
  }

  lastUrl = window.location.href;

  observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      processMutations(doc, pendingMutations);
      pendingMutations = [];
    }, MUTATION_DEBOUNCE_MS);
  });

  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });

  monitorUrlChanges(doc);

  info(CONTEXT, 'Started observing DOM mutations');
}

/**
 * Stop observing DOM mutations.
 */
export function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingMutations = [];
  debug(CONTEXT, 'Stopped observing');
}

/**
 * Process accumulated mutations and announce significant changes.
 * @param {Document} doc
 * @param {MutationRecord[]} mutations
 */
function processMutations(doc, mutations) {
  let addedNodes = 0;
  let removedNodes = 0;
  let significantAdditions = [];

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (isVeilElement(node)) continue;

      addedNodes++;
      const description = describeAddedNode(node);
      if (description) {
        significantAdditions.push(description);
      }
    }

    removedNodes += mutation.removedNodes.length;
  }

  const totalChanges = addedNodes + removedNodes;
  if (totalChanges < MUTATION_THRESHOLD) {
    debug(CONTEXT, `Minor change (${totalChanges} nodes), not announcing`);
    return;
  }

  const currentUrl = window.location.href;
  const isRouteChange = currentUrl !== lastUrl;
  lastUrl = currentUrl;

  const message = buildAnnouncement(
    isRouteChange,
    addedNodes,
    significantAdditions
  );

  if (message) {
    announce(doc, LIVE_REGION_ID, message);
    info(CONTEXT, `Announced: "${message}"`);
  }
}

/**
 * Build a human-readable announcement message.
 * @param {boolean} isRouteChange
 * @param {number} addedNodes
 * @param {string[]} significantAdditions
 * @returns {string|null}
 */
function buildAnnouncement(isRouteChange, addedNodes, significantAdditions) {
  if (isRouteChange) {
    const title = document.title || 'new page';
    return `Navigated to ${title}. Page content updated.`;
  }

  if (significantAdditions.length > 0) {
    const description = significantAdditions.slice(0, 3).join(', ');
    return `Page content updated. ${description}.`;
  }

  if (addedNodes > 10) {
    return 'Page content updated with new content.';
  }

  return null;
}

/**
 * Describe a significant added node for announcements.
 * @param {HTMLElement} node
 * @returns {string|null}
 */
function describeAddedNode(node) {
  const tag = node.tagName?.toLowerCase();

  if (['script', 'style', 'link', 'meta', 'noscript'].includes(tag)) {
    return null;
  }

  if (node.getAttribute('role') === 'dialog' || node.classList.contains('modal')) {
    const title = node.querySelector('h1, h2, h3, [role="heading"]');
    const titleText = title?.textContent?.trim() || 'dialog';
    return `A ${titleText} opened`;
  }

  if (node.getAttribute('role') === 'alert' || node.getAttribute('role') === 'status') {
    const text = node.textContent?.trim();
    if (text && text.length < 200) {
      return text;
    }
    return 'An alert appeared';
  }

  if (tag === 'form') {
    return 'A form appeared';
  }

  if (['ul', 'ol'].includes(tag) && node.children.length > 3) {
    return `A list with ${node.children.length} items appeared`;
  }

  if (tag === 'table') {
    const rows = node.querySelectorAll('tr').length;
    return `A table with ${rows} rows appeared`;
  }

  const childCount = node.querySelectorAll('*').length;
  if (childCount > 20) {
    const headings = node.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length > 0) {
      return `New section: ${headings[0].textContent?.trim()}`;
    }
    return 'New content section loaded';
  }

  return null;
}

/**
 * Check if a node was created by Veil (to avoid announcing our own changes).
 * @param {Node} node
 * @returns {boolean}
 */
function isVeilElement(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return node.hasAttribute?.('data-veil') ||
    node.id?.startsWith('veil-');
}

/**
 * Monitor URL changes for SPA navigation detection.
 * Uses both popstate and History API interception.
 * @param {Document} doc
 */
function monitorUrlChanges(doc) {
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const title = doc.title || 'new page';
        announce(doc, LIVE_REGION_ID, `Navigated to ${title}.`);
      }
    }, 100);
  });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const title = doc.title || 'new page';
        announce(doc, LIVE_REGION_ID, `Navigated to ${title}.`);
      }
    }, 200);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
      }
    }, 200);
  };
}
