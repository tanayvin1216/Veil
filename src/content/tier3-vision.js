/**
 * Tier 3 — Vision AI Analysis.
 * Asynchronous screenshot-based page analysis using vision-language models.
 * Runs in background after Tiers 1 and 2 complete. Never blocks navigation.
 * @module tier3-vision
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../utils/constants.js';
import { info, warn, error as logError } from '../utils/logger.js';
import { announce, getRepairCounts } from './aria-injector.js';

const CONTEXT = 'Tier3';
const LIVE_REGION_ID = 'veil-announcements';

/**
 * Run Tier 3 vision analysis asynchronously.
 * Sends a screenshot to the background service worker for AI analysis.
 * @param {Document} doc
 * @returns {Promise<Tier3Report|null>}
 */
export async function runTier3Analysis(doc) {
  try {
    info(CONTEXT, 'Requesting screenshot capture from service worker');

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TIER3_REQUEST,
      payload: {
        url: window.location.href,
        title: doc.title,
        repairCounts: getRepairCounts(doc),
        pageText: extractPageSummary(doc),
      },
    });

    if (response?.success) {
      info(CONTEXT, 'Vision analysis complete');
      announce(doc, LIVE_REGION_ID,
        'Page analysis ready. Press Alt+Shift+S to hear the summary.'
      );
      return response.data;
    }

    if (response?.error === 'no_api_key') {
      info(CONTEXT, 'Tier 3 skipped — no API key configured');
      return null;
    }

    warn(CONTEXT, 'Vision analysis failed:', response?.error);
    return null;
  } catch (err) {
    logError(CONTEXT, 'Failed to run vision analysis:', err.message);
    return null;
  }
}

/**
 * Generate the "What Am I Missing?" transparency report.
 * @param {Document} doc
 * @returns {WhatAmIMissingReport}
 */
export function generateMissingReport(doc) {
  const report = {
    imagesWithoutAlt: 0,
    visualOnlyContent: 0,
    inaccessibleInteractive: 0,
    missingLabels: 0,
    details: [],
  };

  const images = doc.querySelectorAll('img');
  for (const img of images) {
    const alt = img.getAttribute('alt');
    if (!alt || alt.trim() === '' || alt === 'Image (no description available)') {
      report.imagesWithoutAlt++;
    }
  }

  const canvases = doc.querySelectorAll('canvas');
  const svgCharts = doc.querySelectorAll('svg[class*="chart"], svg[class*="graph"], svg[role="img"]');
  report.visualOnlyContent = canvases.length + svgCharts.length;

  const interactiveElements = doc.querySelectorAll(
    'button, [role="button"], a[href], input:not([type="hidden"]), textarea, select'
  );
  for (const el of interactiveElements) {
    const hasLabel = el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.textContent?.trim() ||
      el.getAttribute('title') ||
      el.getAttribute('value');

    if (!hasLabel) {
      report.inaccessibleInteractive++;
    }

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const hasFormLabel = el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        doc.querySelector(`label[for="${el.id}"]`) ||
        el.closest('label');

      if (!hasFormLabel) {
        report.missingLabels++;
      }
    }
  }

  if (report.imagesWithoutAlt > 0) {
    report.details.push(
      `${report.imagesWithoutAlt} image${report.imagesWithoutAlt === 1 ? '' : 's'} with no description`
    );
  }
  if (report.visualOnlyContent > 0) {
    report.details.push(
      `${report.visualOnlyContent} visual element${report.visualOnlyContent === 1 ? '' : 's'} (charts, canvases) with no text alternative`
    );
  }
  if (report.inaccessibleInteractive > 0) {
    report.details.push(
      `${report.inaccessibleInteractive} interactive element${report.inaccessibleInteractive === 1 ? '' : 's'} that may not be keyboard accessible`
    );
  }

  return report;
}

/**
 * Build a spoken "What Am I Missing?" summary.
 * @param {Document} doc
 * @param {object|null} visionSummary - Optional vision AI analysis result
 * @returns {string}
 */
export function buildMissingSummary(doc, visionSummary = null) {
  const report = generateMissingReport(doc);

  if (report.details.length === 0 && !visionSummary) {
    return 'This page appears to have good accessibility coverage. No major gaps detected.';
  }

  let summary = 'Accessibility gap report for this page. ';

  if (report.details.length > 0) {
    summary += 'This page has ' + report.details.join(', ') + '. ';
  }

  if (visionSummary?.visualDescription) {
    summary += visionSummary.visualDescription;
  }

  return summary;
}

/**
 * Extract a brief text summary of the page for context.
 * @param {Document} doc
 * @returns {string}
 */
function extractPageSummary(doc) {
  const parts = [];

  const title = doc.title;
  if (title) parts.push(`Title: ${title}`);

  const headings = doc.querySelectorAll('h1, h2, h3');
  const headingTexts = Array.from(headings)
    .slice(0, 5)
    .map(h => h.textContent?.trim())
    .filter(Boolean);
  if (headingTexts.length > 0) {
    parts.push(`Headings: ${headingTexts.join(', ')}`);
  }

  const meta = doc.querySelector('meta[name="description"]');
  if (meta?.content) {
    parts.push(`Description: ${meta.content}`);
  }

  return parts.join('\n').substring(0, 1000);
}

/**
 * @typedef {Object} Tier3Report
 * @property {string} layoutSummary - Spatial layout description
 * @property {string} visualDescription - Description of visual-only content
 * @property {string[]} missingAlts - Descriptions for images without alt text
 * @property {number} executionMs - Execution time in ms
 */

/**
 * @typedef {Object} WhatAmIMissingReport
 * @property {number} imagesWithoutAlt
 * @property {number} visualOnlyContent
 * @property {number} inaccessibleInteractive
 * @property {number} missingLabels
 * @property {string[]} details
 */
