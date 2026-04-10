/**
 * Tier 2 — Smart Contextual Repair.
 * Cookie consent handling, CAPTCHA detection, and ambiguous element repair.
 * Target execution: < 500ms.
 * @module tier2-smart
 */

import {
  COOKIE_SELECTORS,
  COOKIE_REJECT_SELECTORS,
  COOKIE_ACCEPT_SELECTORS,
  CAPTCHA_SELECTORS,
  MESSAGE_TYPES,
} from '../utils/constants.js';
import { info, debug, warn } from '../utils/logger.js';
import { announce } from './aria-injector.js';

const CONTEXT = 'Tier2';
const LIVE_REGION_ID = 'veil-announcements';

/**
 * Run all Tier 2 repairs.
 * @param {Document} doc
 * @returns {Promise<Tier2Report>}
 */
export async function runTier2Repairs(doc) {
  const startTime = performance.now();
  const report = {
    cookieBanners: 0,
    captchas: 0,
    ambiguousElements: 0,
    executionMs: 0,
  };

  const cookieResult = handleCookieBanners(doc);
  report.cookieBanners = cookieResult.handled;

  const captchaResult = detectCaptchas(doc);
  report.captchas = captchaResult.found;

  report.executionMs = Math.round(performance.now() - startTime);
  info(CONTEXT, `Completed: cookies=${report.cookieBanners}, captchas=${report.captchas} in ${report.executionMs}ms`);

  return report;
}

// ─── Cookie Consent Handling ───────────────────────────────

/**
 * Detect and handle cookie consent banners.
 * Strategy: reject all > necessary only > dismiss > notify user
 * @param {Document} doc
 * @returns {{ handled: number, action: string }}
 */
export function handleCookieBanners(doc) {
  const banner = findCookieBanner(doc);
  if (!banner) {
    debug(CONTEXT, 'No cookie banner detected');
    return { handled: 0, action: 'none' };
  }

  info(CONTEXT, 'Cookie banner detected, attempting to dismiss');

  const rejectButton = findButtonBySelectors(banner, COOKIE_REJECT_SELECTORS);
  if (rejectButton) {
    rejectButton.click();
    announce(doc, LIVE_REGION_ID, 'Cookie banner dismissed — rejected non-essential cookies.');
    info(CONTEXT, 'Cookie banner: clicked reject/necessary-only');
    return { handled: 1, action: 'rejected' };
  }

  const rejectByText = findButtonByText(banner, [
    'reject all', 'deny all', 'decline all', 'refuse all',
    'only necessary', 'necessary only', 'essential only',
    'only essential', 'manage preferences',
  ]);
  if (rejectByText) {
    rejectByText.click();
    announce(doc, LIVE_REGION_ID, 'Cookie banner dismissed.');
    info(CONTEXT, 'Cookie banner: clicked reject by text match');
    return { handled: 1, action: 'rejected-text' };
  }

  const closeButton = banner.querySelector(
    'button[aria-label*="close" i], button[aria-label*="dismiss" i], .close, [data-dismiss]'
  );
  if (closeButton) {
    closeButton.click();
    announce(doc, LIVE_REGION_ID, 'Cookie banner closed.');
    info(CONTEXT, 'Cookie banner: closed via close button');
    return { handled: 1, action: 'closed' };
  }

  const acceptButton = findButtonBySelectors(banner, COOKIE_ACCEPT_SELECTORS);
  if (acceptButton) {
    announce(doc, LIVE_REGION_ID,
      'Cookie consent popup detected. No reject option found. Would you like me to accept it?'
    );
    info(CONTEXT, 'Cookie banner: no reject option, notifying user');
    return { handled: 0, action: 'notified' };
  }

  announce(doc, LIVE_REGION_ID, 'Cookie consent popup detected. Unable to auto-dismiss.');
  return { handled: 0, action: 'detected-only' };
}

/**
 * Find a cookie banner element in the document.
 * @param {Document} doc
 * @returns {HTMLElement|null}
 */
function findCookieBanner(doc) {
  for (const selector of COOKIE_SELECTORS) {
    try {
      const el = doc.querySelector(selector);
      if (el && isElementVisible(el)) {
        return el;
      }
    } catch {
      continue;
    }
  }

  const fixedElements = doc.querySelectorAll('*');
  for (const el of fixedElements) {
    const style = window.getComputedStyle(el);
    const isFixed = style.position === 'fixed' || style.position === 'sticky';
    const hasHighZ = parseInt(style.zIndex, 10) > 1000;

    if (!isFixed || !hasHighZ) continue;

    const text = (el.textContent || '').toLowerCase();
    const hasCookieText = text.includes('cookie') ||
      text.includes('consent') ||
      text.includes('privacy') ||
      text.includes('gdpr');

    if (hasCookieText && text.length < 5000) {
      return el;
    }
  }

  return null;
}

/**
 * Find a button matching an array of selectors.
 * @param {HTMLElement} container
 * @param {string[]} selectors
 * @returns {HTMLElement|null}
 */
function findButtonBySelectors(container, selectors) {
  for (const selector of selectors) {
    try {
      const button = container.querySelector(selector);
      if (button && isElementVisible(button)) {
        return button;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Find a button by matching its text content.
 * @param {HTMLElement} container
 * @param {string[]} textPatterns - Lowercase text patterns to match
 * @returns {HTMLElement|null}
 */
function findButtonByText(container, textPatterns) {
  const buttons = container.querySelectorAll('button, a, [role="button"]');

  for (const button of buttons) {
    const text = (button.textContent || '').toLowerCase().trim();
    for (const pattern of textPatterns) {
      if (text.includes(pattern)) {
        return button;
      }
    }
  }

  return null;
}

// ─── CAPTCHA Detection ─────────────────────────────────────

/**
 * Detect CAPTCHA elements and surface audio alternatives.
 * @param {Document} doc
 * @returns {{ found: number, type: string|null, hasAudio: boolean }}
 */
export function detectCaptchas(doc) {
  for (const selector of CAPTCHA_SELECTORS) {
    try {
      const element = doc.querySelector(selector);
      if (!element) continue;

      const captchaType = identifyCaptchaType(element);
      const hasAudioAlt = checkAudioAlternative(element, doc);

      info(CONTEXT, `CAPTCHA detected: ${captchaType}, audio=${hasAudioAlt}`);

      if (hasAudioAlt) {
        announce(doc, LIVE_REGION_ID,
          `This page has a ${captchaType}. There is an audio alternative available. ` +
          'Say "handle this CAPTCHA" or press Alt+Shift+A to activate it.'
        );
      } else {
        announce(doc, LIVE_REGION_ID,
          `This page has a ${captchaType} with no audio alternative. ` +
          'You may need sighted assistance to complete it.'
        );
      }

      return { found: 1, type: captchaType, hasAudio: hasAudioAlt };
    } catch {
      continue;
    }
  }

  return { found: 0, type: null, hasAudio: false };
}

/**
 * Identify the type of CAPTCHA.
 * @param {HTMLElement} element
 * @returns {string}
 */
function identifyCaptchaType(element) {
  const src = element.getAttribute('src') || '';
  const className = element.className || '';
  const id = element.id || '';

  if (src.includes('recaptcha') || className.includes('recaptcha') || id.includes('recaptcha')) {
    return 'reCAPTCHA';
  }
  if (src.includes('hcaptcha') || className.includes('hcaptcha') || className.includes('h-captcha') || id.includes('hcaptcha') || id.includes('h-captcha')) {
    return 'hCaptcha';
  }
  if (src.includes('cloudflare') || className.includes('turnstile') || id.includes('turnstile')) {
    return 'Cloudflare Turnstile';
  }

  return 'CAPTCHA';
}

/**
 * Check if a CAPTCHA has an audio alternative.
 * @param {HTMLElement} element
 * @param {Document} doc
 * @returns {boolean}
 */
function checkAudioAlternative(element, doc) {
  const audioButton = doc.querySelector(
    '#recaptcha-audio-button, .rc-audiochallenge, ' +
    'button[title*="audio" i], a[title*="audio" i], ' +
    '[aria-label*="audio" i]'
  );

  return audioButton !== null;
}

/**
 * Check if an element is visible.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isElementVisible(el) {
  if (!el) return false;
  if (el.hidden) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  return true;
}

/**
 * @typedef {Object} Tier2Report
 * @property {number} cookieBanners - Cookie banners handled
 * @property {number} captchas - CAPTCHAs detected
 * @property {number} ambiguousElements - Ambiguous elements repaired
 * @property {number} executionMs - Execution time in ms
 */
