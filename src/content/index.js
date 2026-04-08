/**
 * Content script entry point — orchestrates the three-tier repair system.
 * Runs on every page load. Tier 1 is synchronous, Tiers 2 and 3 are async.
 * @module content/index
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../utils/constants.js';
import { info, warn, error as logError, setLogLevel } from '../utils/logger.js';
import { LOG_LEVELS } from '../utils/constants.js';
import { runTier1Repairs } from './tier1-repair.js';
import { runTier2Repairs } from './tier2-smart.js';
import { runTier3Analysis, buildMissingSummary } from './tier3-vision.js';
import { analyzePage } from './page-analyzer.js';
import { buildElementRegistry, fuzzyMatch, getDOMElement } from './dom-labeler.js';
import { startObserving } from './mutation-observer.js';
import { getRepairCounts, announce } from './aria-injector.js';
import { initSpeechInput, toggleListening, getIsListening } from '../voice/speech-input.js';
// Speech output handled by service worker via chrome.tts (no user gesture needed)

const CONTEXT = 'ContentScript';

/** Stores the current repair report for this page */
let currentReport = null;

/** Stores the Tier 3 vision analysis result */
let visionResult = null;

/**
 * Main initialization — runs on every page load.
 */
async function initialize() {
  try {
    const isEnabled = await checkEnabled();
    if (!isEnabled) {
      info(CONTEXT, 'Extension is disabled, skipping repairs');
      return;
    }

    info(CONTEXT, `Running on ${window.location.href}`);

    const tier1Report = runTier1Repairs(document);
    currentReport = { tier1: tier1Report };

    sendRepairReport(tier1Report);

    buildElementRegistry(document);

    startObserving(document);

    runAsyncRepairs();

    setupMessageListener();

    info(CONTEXT, 'Initialization complete');
  } catch (err) {
    logError(CONTEXT, 'Initialization failed:', err.message);
  }
}

/**
 * Run Tier 2 and Tier 3 repairs asynchronously.
 */
async function runAsyncRepairs() {
  try {
    const tier2Report = await runTier2Repairs(document);
    currentReport.tier2 = tier2Report;

    buildElementRegistry(document);

    visionResult = await runTier3Analysis(document);
    if (visionResult) {
      currentReport.tier3 = visionResult;
    }
  } catch (err) {
    warn(CONTEXT, 'Async repairs encountered error:', err.message);
  }
}

/**
 * Check if the extension is enabled.
 * @returns {Promise<boolean>}
 */
async function checkEnabled() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ENABLED);
    return result[STORAGE_KEYS.ENABLED] !== false;
  } catch {
    return true;
  }
}

/**
 * Send the repair report to the service worker.
 * @param {object} report
 */
function sendRepairReport(report) {
  try {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TIER1_COMPLETE,
      payload: {
        url: window.location.href,
        title: document.title,
        report,
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    warn(CONTEXT, 'Failed to send repair report:', err.message);
  }
}

/**
 * Set up message listener for commands from the service worker.
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case MESSAGE_TYPES.GET_REPAIR_REPORT:
        sendResponse({
          success: true,
          data: {
            ...currentReport,
            repairCounts: getRepairCounts(document),
          },
        });
        return true;

      case MESSAGE_TYPES.GET_PAGE_CONTEXT:
        sendResponse({
          success: true,
          data: {
            url: window.location.href,
            title: document.title,
            headings: getPageHeadings(),
            landmarks: getPageLandmarks(),
          },
        });
        return true;

      case MESSAGE_TYPES.GET_ELEMENT_REGISTRY:
        sendResponse({
          success: true,
          data: buildElementRegistry(document),
        });
        return true;

      case MESSAGE_TYPES.EXECUTE_ACTION:
        handleAction(message.payload)
          .then(result => sendResponse(result))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'what_am_i_missing': {
        const summary = buildMissingSummary(document, visionResult);
        sendResponse({ success: true, data: summary });
        return true;
      }

      case 'toggle_voice': {
        const voiceMsg = handleToggleVoice();
        sendResponse({ success: true, message: voiceMsg });
        return true;
      }

      case 'get_page_summary':
        sendResponse({ success: true, data: buildPageSummaryText() });
        return true;

      case 'fuzzy_match':
        sendResponse({
          success: true,
          data: fuzzyMatch(message.payload.query, message.payload.maxResults),
        });
        return true;

      default:
        return false;
    }
  });
}

/**
 * Execute a DOM action from the voice agent.
 * @param {ActionPayload} payload
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleAction(payload) {
  const { action, target, value } = payload;

  switch (action) {
    case 'click': {
      const el = getDOMElement(target);
      if (!el) return { success: false, message: `Element ${target} not found` };
      el.click();
      el.focus();
      return { success: true, message: `Clicked ${getElementDescription(el)}` };
    }

    case 'focus': {
      const el = getDOMElement(target);
      if (!el) return { success: false, message: `Element ${target} not found` };
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { success: true, message: `Focused on ${getElementDescription(el)}` };
    }

    case 'fill': {
      const el = getDOMElement(target);
      if (!el) return { success: false, message: `Element ${target} not found` };
      el.focus();
      el.value = value || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, message: `Filled ${getElementDescription(el)} with "${value}"` };
    }

    case 'scroll_down':
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      return { success: true, message: 'Scrolled down' };

    case 'scroll_up':
      window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
      return { success: true, message: 'Scrolled up' };

    case 'scroll_to_top':
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { success: true, message: 'Scrolled to top' };

    case 'scroll_to_bottom':
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return { success: true, message: 'Scrolled to bottom' };

    case 'go_back':
      window.history.back();
      return { success: true, message: 'Going back' };

    case 'go_forward':
      window.history.forward();
      return { success: true, message: 'Going forward' };

    case 'next_heading': {
      const result = navigateToNext('h1, h2, h3, h4, h5, h6');
      return result;
    }

    case 'next_button': {
      const result = navigateToNext('button, [role="button"]');
      return result;
    }

    case 'next_link': {
      const result = navigateToNext('a[href]');
      return result;
    }

    case 'next_input': {
      const result = navigateToNext('input:not([type="hidden"]), textarea, select');
      return result;
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

/**
 * Navigate to the next element matching a selector.
 * @param {string} selector
 * @returns {{ success: boolean, message: string }}
 */
function navigateToNext(selector) {
  const elements = Array.from(document.querySelectorAll(selector))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  if (elements.length === 0) {
    return { success: false, message: 'No matching elements found' };
  }

  const activeElement = document.activeElement;
  const currentIndex = elements.indexOf(activeElement);
  const nextIndex = currentIndex + 1 < elements.length ? currentIndex + 1 : 0;
  const nextElement = elements[nextIndex];

  nextElement.focus();
  nextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return {
    success: true,
    message: getElementDescription(nextElement),
  };
}

/**
 * Get a human-readable description of an element.
 * @param {HTMLElement} el
 * @returns {string}
 */
function getElementDescription(el) {
  const label = el.getAttribute('aria-label') ||
    el.textContent?.trim().substring(0, 50) ||
    el.getAttribute('title') ||
    el.tagName.toLowerCase();
  return label;
}

/**
 * Get all headings on the page.
 * @returns {Array<{level: number, text: string}>}
 */
function getPageHeadings() {
  return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map(h => ({
      level: parseInt(h.tagName.charAt(1), 10),
      text: (h.textContent || '').trim().substring(0, 100),
    }));
}

/**
 * Get all ARIA landmarks on the page.
 * @returns {Array<{role: string, label: string}>}
 */
function getPageLandmarks() {
  const landmarks = document.querySelectorAll(
    '[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], ' +
    '[role="complementary"], [role="search"], [role="form"], ' +
    'header, nav, main, footer, aside'
  );

  return Array.from(landmarks).map(el => ({
    role: el.getAttribute('role') || el.tagName.toLowerCase(),
    label: el.getAttribute('aria-label') || '',
  }));
}

// ─── Voice & Summary Handlers ──────────────────────────────

/** Whether voice input has been initialized */
let voiceInitialized = false;

/**
 * Toggle voice agent listening on/off.
 * @returns {string} Status message for TTS
 */
function handleToggleVoice() {
  if (!voiceInitialized) {
    const success = initSpeechInput({
      onTranscript: (transcript) => {
        if (transcript.startsWith('__error:')) {
          const errorType = transcript.replace('__error:', '');
          const messages = {
            mic_permission_denied: 'Microphone permission was denied. Please allow microphone access in your browser settings.',
            no_microphone: 'No microphone found. Please connect a microphone.',
            network_error: 'Speech recognition network error. Check your internet connection.',
          };
          // Speak errors through service worker TTS
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.SPEAK,
            payload: { text: messages[errorType] || 'Speech recognition error.', rate: 1.0 },
          });
          return;
        }
        info(CONTEXT, `Voice command: "${transcript}"`);
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.VOICE_COMMAND,
          payload: { transcript, tabId: null },
        });
      },
      onStateChange: (listening) => {
        // Don't announce every pause/restart — only deliberate toggles
        // The toggle function handles its own announcement
      },
    });

    if (!success) {
      return 'Speech recognition is not available in this browser.';
    }
    voiceInitialized = true;
  }

  const nowListening = toggleListening();
  info(CONTEXT, `Voice agent: ${nowListening ? 'ON' : 'OFF'}`);
  return nowListening ? 'Voice agent listening.' : 'Voice agent stopped.';
}

/**
 * Build a conversational page summary using the page analyzer.
 * @returns {string}
 */
function buildPageSummaryText() {
  return analyzePage(document);
}

// ─── Bootstrap ─────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
