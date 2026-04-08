/**
 * Tier 1 — Instant DOM Repair Engine.
 * Pure rule-based DOM analysis and repair. Runs synchronously, < 50ms target.
 * No AI calls. Every page load.
 * @module tier1-repair
 */

import { ICON_CLASS_MAP, LANDMARK_TAG_MAP } from '../utils/constants.js';
import { info, debug } from '../utils/logger.js';
import {
  setAriaIfMissing,
  setRoleIfMissing,
  setHeadingLevel,
  injectSkipLink,
  injectLiveRegion,
} from './aria-injector.js';

const CONTEXT = 'Tier1';

/**
 * Run all Tier 1 repairs on the document.
 * @param {Document} doc - The document to repair
 * @returns {RepairReport} Summary of all repairs made
 */
export function runTier1Repairs(doc) {
  const startTime = performance.now();
  const report = createEmptyReport();

  report.images = repairImages(doc);
  report.buttons = repairButtons(doc);
  report.formLabels = repairFormLabels(doc);
  report.headings = repairHeadingHierarchy(doc);
  report.landmarks = repairLandmarks(doc);
  report.focusTraps = repairFocusTraps(doc);
  report.skipLink = repairSkipNavigation(doc);

  injectLiveRegion(doc, 'accessagent-announcements', 'polite');

  report.totalRepairs = Object.values(report)
    .filter(v => typeof v === 'number')
    .reduce((sum, n) => sum + n, 0);
  report.executionMs = Math.round(performance.now() - startTime);

  info(CONTEXT, `Completed: ${report.totalRepairs} repairs in ${report.executionMs}ms`);
  return report;
}

/**
 * @returns {RepairReport}
 */
function createEmptyReport() {
  return {
    images: 0,
    buttons: 0,
    formLabels: 0,
    headings: 0,
    landmarks: 0,
    focusTraps: 0,
    skipLink: 0,
    totalRepairs: 0,
    executionMs: 0,
  };
}

// ─── Image Repair ──────────────────────────────────────────

/**
 * Find images without alt text and generate descriptive alternatives.
 * @param {Document} doc
 * @returns {number} Number of images repaired
 */
export function repairImages(doc) {
  const images = doc.querySelectorAll('img:not([alt]), img[alt=""]');
  let repaired = 0;

  for (const img of images) {
    const altText = inferImageAlt(img);
    if (altText && setAriaIfMissing(img, 'alt', altText)) {
      img.setAttribute('alt', altText);
      repaired++;
    }
  }

  debug(CONTEXT, `Images repaired: ${repaired}/${images.length}`);
  return repaired;
}

/**
 * Infer alt text for an image from available context.
 * @param {HTMLImageElement} img
 * @returns {string|null}
 */
function inferImageAlt(img) {
  const titleAttr = img.getAttribute('title');
  if (titleAttr && titleAttr.trim()) {
    return titleAttr.trim();
  }

  const ariaLabel = img.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  const filenameAlt = extractFilenameDescription(img.src);
  if (filenameAlt) {
    return filenameAlt;
  }

  const figcaption = img.closest('figure')?.querySelector('figcaption');
  if (figcaption?.textContent?.trim()) {
    return figcaption.textContent.trim();
  }

  const parentLink = img.closest('a');
  if (parentLink) {
    const linkText = getVisibleText(parentLink).replace(img.alt || '', '').trim();
    if (linkText) {
      return linkText;
    }
  }

  const surroundingText = getSurroundingText(img);
  if (surroundingText) {
    return `Image: ${surroundingText}`;
  }

  return 'Image (no description available)';
}

/**
 * Extract a human-readable description from an image filename.
 * @param {string} src - Image source URL
 * @returns {string|null}
 */
function extractFilenameDescription(src) {
  if (!src) return null;

  try {
    const url = new URL(src, window.location.href);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

    if (!nameWithoutExt || nameWithoutExt.length < 3) return null;
    if (/^[a-f0-9-]{20,}$/i.test(nameWithoutExt)) return null;
    if (/^(img|image|photo|pic|banner|hero|bg|background|icon)[-_]?\d*$/i.test(nameWithoutExt)) {
      return null;
    }

    const readable = nameWithoutExt
      .replace(/[-_]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\d{5,}\b/g, '')
      .trim();

    if (readable.length < 3) return null;
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  } catch {
    return null;
  }
}

// ─── Button & Icon Repair ──────────────────────────────────

/**
 * Find unlabeled buttons and interactive elements, inject labels.
 * @param {Document} doc
 * @returns {number} Number of buttons repaired
 */
export function repairButtons(doc) {
  const selectors = [
    'button:not([aria-label])',
    '[role="button"]:not([aria-label])',
    'a[href]:not([aria-label])',
    'input[type="button"]:not([aria-label])',
    'input[type="submit"]:not([aria-label])',
    'input[type="reset"]:not([aria-label])',
  ].join(', ');

  const elements = doc.querySelectorAll(selectors);
  let repaired = 0;

  for (const el of elements) {
    if (hasAccessibleName(el)) continue;

    const label = inferButtonLabel(el);
    if (label && setAriaIfMissing(el, 'aria-label', label)) {
      repaired++;
    }
  }

  debug(CONTEXT, `Buttons repaired: ${repaired}`);
  return repaired;
}

/**
 * Check if an element already has an accessible name.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function hasAccessibleName(el) {
  if (el.getAttribute('aria-label')?.trim()) return true;
  if (el.getAttribute('aria-labelledby')?.trim()) return true;
  if (el.getAttribute('title')?.trim()) return true;

  const text = getVisibleText(el);
  if (text.trim()) return true;

  if (el.tagName === 'INPUT') {
    const value = el.getAttribute('value');
    if (value?.trim()) return true;
  }

  return false;
}

/**
 * Infer a label for a button or interactive element.
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function inferButtonLabel(el) {
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim();

  const iconLabel = inferFromIconClasses(el);
  if (iconLabel) return iconLabel;

  const svgTitle = el.querySelector('svg title')?.textContent?.trim();
  if (svgTitle) return svgTitle;

  const imgAlt = el.querySelector('img')?.getAttribute('alt')?.trim();
  if (imgAlt) return imgAlt;

  const siblingText = getSiblingText(el);
  if (siblingText) return siblingText;

  const parentLink = el.closest('a');
  if (parentLink && parentLink !== el) {
    const parentText = getVisibleText(parentLink).trim();
    if (parentText) return parentText;
  }

  return null;
}

/**
 * Infer purpose from CSS class names matching known icon patterns.
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function inferFromIconClasses(el) {
  const classNames = [
    ...el.classList,
    ...(el.querySelector('i, span, svg')?.classList || []),
  ];

  for (const cls of classNames) {
    const lowerClass = cls.toLowerCase();
    for (const [pattern, label] of Object.entries(ICON_CLASS_MAP)) {
      if (lowerClass.includes(pattern)) {
        return label;
      }
    }
  }

  return null;
}

// ─── Form Label Repair ─────────────────────────────────────

/**
 * Find form inputs without labels and inject aria-label.
 * @param {Document} doc
 * @returns {number} Number of inputs repaired
 */
export function repairFormLabels(doc) {
  const inputs = doc.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
  );
  let repaired = 0;

  for (const input of inputs) {
    if (hasInputLabel(input, doc)) continue;

    const label = inferInputLabel(input, doc);
    if (label && setAriaIfMissing(input, 'aria-label', label)) {
      repaired++;
    }
  }

  debug(CONTEXT, `Form labels repaired: ${repaired}`);
  return repaired;
}

/**
 * Check if an input already has an associated label.
 * @param {HTMLElement} input
 * @param {Document} doc
 * @returns {boolean}
 */
function hasInputLabel(input, doc) {
  if (input.getAttribute('aria-label')?.trim()) return true;
  if (input.getAttribute('aria-labelledby')?.trim()) return true;

  const id = input.id;
  if (id) {
    const escapedId = id.replace(/([^\w-])/g, '\\$1');
    const label = doc.querySelector(`label[for="${escapedId}"]`);
    if (label?.textContent?.trim()) return true;
  }

  const parentLabel = input.closest('label');
  if (parentLabel?.textContent?.trim()) return true;

  return false;
}

/**
 * Infer a label for an input from available context.
 * @param {HTMLElement} input
 * @param {Document} doc
 * @returns {string|null}
 */
function inferInputLabel(input, doc) {
  const placeholder = input.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();

  const name = input.getAttribute('name');
  if (name?.trim()) {
    const readable = name
      .replace(/[-_[\]]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    if (readable.length >= 2) {
      return readable.charAt(0).toUpperCase() + readable.slice(1);
    }
  }

  const precedingText = getPrecedingTextNode(input);
  if (precedingText) return precedingText;

  const type = input.getAttribute('type') || 'text';
  return `${type.charAt(0).toUpperCase() + type.slice(1)} input`;
}

// ─── Heading Hierarchy Repair ──────────────────────────────

/**
 * Detect broken heading hierarchy and fix with aria-level.
 * @param {Document} doc
 * @returns {number} Number of headings fixed
 */
export function repairHeadingHierarchy(doc) {
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length === 0) return 0;

  let repaired = 0;
  let expectedLevel = 1;

  for (const heading of headings) {
    const actualLevel = parseInt(heading.tagName.charAt(1), 10);

    if (actualLevel > expectedLevel + 1) {
      const correctedLevel = expectedLevel + 1;
      setHeadingLevel(heading, correctedLevel);
      repaired++;
    }

    expectedLevel = Math.min(actualLevel, expectedLevel + 1);
  }

  debug(CONTEXT, `Headings repaired: ${repaired}`);
  return repaired;
}

// ─── Landmark Repair ───────────────────────────────────────

/**
 * Detect missing ARIA landmark regions and inject roles.
 * @param {Document} doc
 * @returns {number} Number of landmarks added
 */
export function repairLandmarks(doc) {
  let repaired = 0;

  for (const [tag, role] of Object.entries(LANDMARK_TAG_MAP)) {
    const elements = doc.querySelectorAll(tag);
    for (const el of elements) {
      if (setRoleIfMissing(el, role)) {
        repaired++;
      }
    }
  }

  if (!doc.querySelector('[role="main"], main')) {
    const mainCandidate = findMainContent(doc);
    if (mainCandidate && setRoleIfMissing(mainCandidate, 'main')) {
      repaired++;
    }
  }

  if (!doc.querySelector('[role="banner"], header')) {
    const bannerCandidate = findBanner(doc);
    if (bannerCandidate && setRoleIfMissing(bannerCandidate, 'banner')) {
      repaired++;
    }
  }

  if (!doc.querySelector('[role="contentinfo"], footer')) {
    const footerCandidate = findFooter(doc);
    if (footerCandidate && setRoleIfMissing(footerCandidate, 'contentinfo')) {
      repaired++;
    }
  }

  debug(CONTEXT, `Landmarks repaired: ${repaired}`);
  return repaired;
}

/**
 * Heuristically find the main content area.
 * @param {Document} doc
 * @returns {HTMLElement|null}
 */
function findMainContent(doc) {
  const candidates = [
    doc.getElementById('main'),
    doc.getElementById('content'),
    doc.getElementById('main-content'),
    doc.getElementById('page-content'),
    doc.querySelector('#app > div:not(header):not(nav):not(footer)'),
    doc.querySelector('.main-content'),
    doc.querySelector('.content'),
    doc.querySelector('.page-content'),
    doc.querySelector('article'),
  ];

  return candidates.find(el => el !== null) || null;
}

/**
 * Heuristically find the banner/header area.
 * @param {Document} doc
 * @returns {HTMLElement|null}
 */
function findBanner(doc) {
  const candidates = [
    doc.getElementById('header'),
    doc.querySelector('.header'),
    doc.querySelector('.site-header'),
    doc.querySelector('.page-header'),
  ];

  return candidates.find(el => el !== null) || null;
}

/**
 * Heuristically find the footer/contentinfo area.
 * @param {Document} doc
 * @returns {HTMLElement|null}
 */
function findFooter(doc) {
  const candidates = [
    doc.getElementById('footer'),
    doc.querySelector('.footer'),
    doc.querySelector('.site-footer'),
    doc.querySelector('.page-footer'),
  ];

  return candidates.find(el => el !== null) || null;
}

// ─── Focus Trap Repair ─────────────────────────────────────

/**
 * Detect elements that trap keyboard focus and inject escape mechanism.
 * @param {Document} doc
 * @returns {number} Number of focus traps repaired
 */
export function repairFocusTraps(doc) {
  const modals = doc.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], .modal, .dialog, [aria-modal="true"]'
  );
  let repaired = 0;

  for (const modal of modals) {
    const hasCloseButton = modal.querySelector(
      'button[aria-label*="close" i], button[aria-label*="dismiss" i], .close, .modal-close, [data-dismiss]'
    );

    if (!hasCloseButton) {
      const closeButton = doc.createElement('button');
      closeButton.setAttribute('aria-label', 'Close dialog');
      closeButton.setAttribute('data-accessagent', 'focus-escape');
      closeButton.style.cssText = [
        'position: absolute',
        'top: 8px',
        'right: 8px',
        'background: transparent',
        'border: 2px solid currentColor',
        'color: inherit',
        'cursor: pointer',
        'padding: 4px 8px',
        'font-size: 14px',
        'z-index: 999999',
      ].join('; ');
      closeButton.textContent = '✕';
      closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      });

      modal.style.position = modal.style.position || 'relative';
      modal.insertBefore(closeButton, modal.firstChild);
      repaired++;
    }

    if (!modal.querySelector('[tabindex]')) {
      modal.setAttribute('tabindex', '-1');
    }
  }

  debug(CONTEXT, `Focus traps repaired: ${repaired}`);
  return repaired;
}

// ─── Skip Navigation ───────────────────────────────────────

/**
 * Inject skip navigation if missing.
 * @param {Document} doc
 * @returns {number} 1 if injected, 0 if not needed
 */
export function repairSkipNavigation(doc) {
  const mainContent = doc.querySelector(
    'main, [role="main"], #main, #content, #main-content'
  );

  if (!mainContent) return 0;

  if (!mainContent.id) {
    mainContent.id = 'accessagent-main-content';
  }

  return injectSkipLink(doc, mainContent.id) ? 1 : 0;
}

// ─── Text Extraction Helpers ───────────────────────────────

/**
 * Get visible text content of an element, excluding hidden children.
 * @param {HTMLElement} el
 * @returns {string}
 */
function getVisibleText(el) {
  if (!el) return '';

  const hidden = el.getAttribute('aria-hidden');
  if (hidden === 'true') return '';

  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(child);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        text += getVisibleText(child);
      }
    }
  }

  return text.trim();
}

/**
 * Get text from the nearest sibling elements.
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function getSiblingText(el) {
  const prev = el.previousElementSibling;
  if (prev) {
    const text = getVisibleText(prev).trim();
    if (text && text.length < 100) return text;
  }

  const next = el.nextElementSibling;
  if (next) {
    const text = getVisibleText(next).trim();
    if (text && text.length < 100) return text;
  }

  return null;
}

/**
 * Get surrounding text from the parent element.
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function getSurroundingText(el) {
  const parent = el.parentElement;
  if (!parent) return null;

  const parentText = getVisibleText(parent).trim();
  if (parentText && parentText.length > 3 && parentText.length < 150) {
    return parentText;
  }

  return null;
}

/**
 * Get the preceding text node content.
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function getPrecedingTextNode(el) {
  let node = el.previousSibling;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text && text.length > 1 && text.length < 100) {
        return text.replace(/:$/, '').trim();
      }
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent?.trim();
      if (text && text.length > 1 && text.length < 100) {
        return text.replace(/:$/, '').trim();
      }
      break;
    }
    node = node.previousSibling;
  }
  return null;
}

/**
 * @typedef {Object} RepairReport
 * @property {number} images - Images repaired
 * @property {number} buttons - Buttons repaired
 * @property {number} formLabels - Form labels repaired
 * @property {number} headings - Headings fixed
 * @property {number} landmarks - Landmarks added
 * @property {number} focusTraps - Focus traps repaired
 * @property {number} skipLink - Skip links added (0 or 1)
 * @property {number} totalRepairs - Total repairs made
 * @property {number} executionMs - Execution time in milliseconds
 */
