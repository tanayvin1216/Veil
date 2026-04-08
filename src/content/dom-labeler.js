/**
 * DOM Element Registry — labels every interactive element for voice agent grounding.
 * Builds a structured registry that maps spoken commands to DOM elements.
 * @module dom-labeler
 */

import { debug, info } from '../utils/logger.js';

const CONTEXT = 'DOMLabeler';

/** @type {Map<string, ElementEntry>} */
let elementRegistry = new Map();

/** Counter for generating sequential element IDs */
let elementCounter = 0;

/**
 * Interactive element selectors to include in the registry.
 */
const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  '[role="button"]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="searchbox"]',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary',
  'video',
  'audio',
].join(', ');

/**
 * Build the element registry by scanning the document.
 * @param {Document} doc - The document to scan
 * @returns {ElementEntry[]} Array of all registered elements
 */
export function buildElementRegistry(doc) {
  const startTime = performance.now();
  elementRegistry.clear();
  elementCounter = 0;

  const elements = doc.querySelectorAll(INTERACTIVE_SELECTORS);

  for (const el of elements) {
    if (!isElementVisible(el)) continue;

    const entry = createElementEntry(el);
    elementRegistry.set(entry.id, entry);
  }

  const elapsed = Math.round(performance.now() - startTime);
  info(CONTEXT, `Registry built: ${elementRegistry.size} elements in ${elapsed}ms`);

  return getRegistryArray();
}

/**
 * Get the full registry as an array.
 * @returns {ElementEntry[]}
 */
export function getRegistryArray() {
  return Array.from(elementRegistry.values());
}

/**
 * Get the registry as a Map.
 * @returns {Map<string, ElementEntry>}
 */
export function getRegistry() {
  return elementRegistry;
}

/**
 * Look up an element entry by its ID.
 * @param {string} id - Element ID (e.g., "el-47")
 * @returns {ElementEntry|null}
 */
export function getElementById(id) {
  return elementRegistry.get(id) || null;
}

/**
 * Find the real DOM element for a registry entry.
 * @param {string} id - Element ID from the registry
 * @returns {HTMLElement|null}
 */
export function getDOMElement(id) {
  const entry = elementRegistry.get(id);
  if (!entry) return null;
  return document.querySelector(`[data-accessagent-id="${id}"]`);
}

/**
 * Fuzzy-match a spoken query against the element registry.
 * Returns ranked results by match confidence.
 * @param {string} query - The spoken text to match (e.g., "add to cart")
 * @param {number} maxResults - Maximum results to return
 * @returns {MatchResult[]}
 */
export function fuzzyMatch(query, maxResults = 5) {
  if (!query || query.trim().length === 0) return [];

  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(normalizedQuery);
  const results = [];

  for (const entry of elementRegistry.values()) {
    const score = calculateMatchScore(queryTokens, normalizedQuery, entry);
    if (score > 0) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults).map(r => ({
    element: r.entry,
    confidence: Math.min(r.score / 100, 1),
  }));
}

/**
 * Calculate match score between query tokens and an element entry.
 * @param {string[]} queryTokens
 * @param {string} normalizedQuery
 * @param {ElementEntry} entry
 * @returns {number} Score from 0-100
 */
function calculateMatchScore(queryTokens, normalizedQuery, entry) {
  let score = 0;

  const fields = [
    { text: entry.ariaLabel, weight: 40 },
    { text: entry.visibleText, weight: 35 },
    { text: entry.nearbyText, weight: 15 },
    { text: entry.role, weight: 10 },
  ];

  for (const field of fields) {
    if (!field.text) continue;
    const normalizedField = normalizeText(field.text);

    if (normalizedField === normalizedQuery) {
      score += field.weight;
      continue;
    }

    if (normalizedField.includes(normalizedQuery)) {
      score += field.weight * 0.8;
      continue;
    }

    if (normalizedQuery.includes(normalizedField)) {
      score += field.weight * 0.6;
      continue;
    }

    const fieldTokens = tokenize(normalizedField);
    const matchingTokens = queryTokens.filter(
      qt => fieldTokens.some(ft => ft.includes(qt) || qt.includes(ft))
    );

    if (matchingTokens.length > 0) {
      const tokenMatchRatio = matchingTokens.length / queryTokens.length;
      score += field.weight * tokenMatchRatio * 0.5;
    }
  }

  return score;
}

/**
 * Create an element entry for the registry.
 * @param {HTMLElement} el
 * @returns {ElementEntry}
 */
function createElementEntry(el) {
  const id = `el-${++elementCounter}`;

  el.setAttribute('data-accessagent-id', id);

  const rect = el.getBoundingClientRect();

  const entry = {
    id,
    tag: el.tagName.toLowerCase(),
    ariaLabel: el.getAttribute('aria-label') || '',
    visibleText: getVisibleText(el),
    nearbyText: getNearbyText(el),
    role: el.getAttribute('role') || inferRole(el),
    position: {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    },
    isVisible: true,
    isFocusable: isFocusable(el),
    href: el.getAttribute('href') || '',
    type: el.getAttribute('type') || '',
    inputValue: el.value || '',
  };

  return entry;
}

/**
 * Get visible text from an element (direct children only for brevity).
 * @param {HTMLElement} el
 * @returns {string}
 */
function getVisibleText(el) {
  const text = el.textContent || '';
  return text.trim().substring(0, 200);
}

/**
 * Get nearby text from sibling and parent elements for context.
 * @param {HTMLElement} el
 * @returns {string}
 */
function getNearbyText(el) {
  const parts = [];

  const prev = el.previousElementSibling;
  if (prev) {
    const text = (prev.textContent || '').trim();
    if (text.length > 0 && text.length < 150) {
      parts.push(text);
    }
  }

  const parent = el.parentElement;
  if (parent) {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim();
        if (text.length > 0 && text.length < 150) {
          parts.push(text);
        }
      }
    }
  }

  const label = el.closest('label');
  if (label) {
    const labelText = (label.textContent || '').trim();
    if (labelText) parts.push(labelText);
  }

  return parts.join(' ').substring(0, 300);
}

/**
 * Infer ARIA role from element tag and attributes.
 * @param {HTMLElement} el
 * @returns {string}
 */
function inferRole(el) {
  const tag = el.tagName.toLowerCase();

  const roleMap = {
    a: 'link',
    button: 'button',
    input: inferInputRole(el),
    textarea: 'textbox',
    select: 'listbox',
    details: 'group',
    summary: 'button',
    video: 'video',
    audio: 'audio',
  };

  return roleMap[tag] || '';
}

/**
 * Infer role for input elements based on type.
 * @param {HTMLElement} el
 * @returns {string}
 */
function inferInputRole(el) {
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  const roleMap = {
    text: 'textbox',
    email: 'textbox',
    password: 'textbox',
    search: 'searchbox',
    tel: 'textbox',
    url: 'textbox',
    number: 'spinbutton',
    range: 'slider',
    checkbox: 'checkbox',
    radio: 'radio',
    button: 'button',
    submit: 'button',
    reset: 'button',
  };
  return roleMap[type] || 'textbox';
}

/**
 * Check if an element is visible in the viewport.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isElementVisible(el) {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hidden) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

/**
 * Check if an element is focusable.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isFocusable(el) {
  if (el.disabled) return false;
  if (el.getAttribute('tabindex') === '-1') return false;

  const focusableTags = ['a', 'button', 'input', 'textarea', 'select', 'summary'];
  if (focusableTags.includes(el.tagName.toLowerCase())) return true;
  if (el.getAttribute('tabindex') !== null) return true;

  return false;
}

/**
 * Normalize text for comparison — lowercase, trim, remove punctuation.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into tokens for matching.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text.split(/\s+/).filter(t => t.length > 0);
}

/**
 * @typedef {Object} ElementEntry
 * @property {string} id - Sequential ID (e.g., "el-47")
 * @property {string} tag - HTML tag name
 * @property {string} ariaLabel - ARIA label (may be generated by Tier 1)
 * @property {string} visibleText - Visible text content
 * @property {string} nearbyText - Text from surrounding elements
 * @property {string} role - ARIA role (explicit or inferred)
 * @property {{x: number, y: number}} position - Center position in viewport
 * @property {boolean} isVisible - Whether the element is currently visible
 * @property {boolean} isFocusable - Whether the element can receive focus
 * @property {string} href - href attribute (for links)
 * @property {string} type - type attribute (for inputs)
 * @property {string} inputValue - Current value (for inputs)
 */

/**
 * @typedef {Object} MatchResult
 * @property {ElementEntry} element - The matched element entry
 * @property {number} confidence - Match confidence (0-1)
 */
