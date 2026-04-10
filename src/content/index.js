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
import { scrapePageStructure } from './page-scraper.js';
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

    // Auto-activate voice mode for fully hands-free experience
    autoActivateVoice();

    // If we arrived here via voice navigation, announce the page
    announceIfNavigated();

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

      case 'get_page_structure':
        sendResponse({ success: true, data: scrapePageStructure(document) });
        return true;

      case 'navigate_to_url': {
        const url = message.payload?.url;
        if (url) window.location.href = url;
        sendResponse({ success: true });
        return true;
      }

      case 'scroll_to_section': {
        const result = scrollToSectionAndRead(message.payload.query);
        sendResponse(result);
        return true;
      }

      case 'fuzzy_match':
        sendResponse({
          success: true,
          data: fuzzyMatch(message.payload.query, message.payload.maxResults),
        });
        return true;

      case 'mute_mic':
        isSpeaking = !!message.payload?.muted;
        // Safety: auto-unmute after 4s max to prevent stuck state. Gesture
        // confirmations are short (~1–3s); a longer window traps the user
        // between "gesture fired TTS" and "I can speak again", which is
        // exactly the bridge bug blind users hit when switching input modes.
        clearTimeout(muteTimeout);
        if (isSpeaking) {
          muteTimeout = setTimeout(() => { isSpeaking = false; }, 4000);
        }
        sendResponse({ success: true });
        return false;

      case 'describe_viewport':
        sendResponse({ success: true, data: describeViewport() });
        return true;

      case 'web_speech_speak':
        webSpeechSpeak(message.payload?.text);
        sendResponse({ success: true });
        return false;

      case 'web_speech_stop':
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        sendResponse({ success: true });
        return false;

      default:
        return false;
    }
  });
}

/** Whether TTS is currently speaking — used to mute mic during playback */
let isSpeaking = false;
let muteTimeout = null;

/**
 * Describe what's visible in the current viewport — reads DOM elements
 * that are on screen right now, like inspecting the page.
 * @returns {string}
 */
function describeViewport() {
  const viewportHeight = window.innerHeight;
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + viewportHeight;

  const parts = [];

  // Find all visible headings
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const visibleHeadings = [];
  for (const h of headings) {
    const rect = h.getBoundingClientRect();
    if (rect.top < viewportHeight && rect.bottom > 0 && h.textContent.trim()) {
      visibleHeadings.push(h.textContent.trim());
    }
  }
  if (visibleHeadings.length > 0) {
    parts.push('Headings on screen: ' + visibleHeadings.join(', '));
  }

  // Find visible links
  const links = document.querySelectorAll('a[href]');
  const visibleLinks = [];
  for (const link of links) {
    const rect = link.getBoundingClientRect();
    const text = link.textContent.trim();
    if (rect.top < viewportHeight && rect.bottom > 0 && text && text.length < 60) {
      visibleLinks.push(text);
    }
    if (visibleLinks.length >= 10) break;
  }
  if (visibleLinks.length > 0) {
    parts.push('Links: ' + visibleLinks.join(', '));
  }

  // Find visible buttons
  const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
  const visibleButtons = [];
  for (const btn of buttons) {
    const rect = btn.getBoundingClientRect();
    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
    if (rect.top < viewportHeight && rect.bottom > 0 && text) {
      visibleButtons.push(text);
    }
  }
  if (visibleButtons.length > 0) {
    parts.push('Buttons: ' + visibleButtons.join(', '));
  }

  // Find visible form fields
  const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
  const visibleInputs = [];
  for (const input of inputs) {
    const rect = input.getBoundingClientRect();
    if (rect.top < viewportHeight && rect.bottom > 0) {
      const label = input.getAttribute('aria-label') || input.placeholder || input.name || input.type;
      visibleInputs.push(label);
    }
  }
  if (visibleInputs.length > 0) {
    parts.push('Form fields: ' + visibleInputs.join(', '));
  }

  // Visible text content summary
  const mainEl = document.querySelector('main') || document.body;
  const textNodes = [];
  const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    const rect = parent.getBoundingClientRect();
    if (rect.top < viewportHeight && rect.bottom > 0) {
      const text = node.textContent.trim();
      if (text.length > 20 && text.length < 200) {
        textNodes.push(text);
      }
    }
    if (textNodes.length >= 3) break;
  }
  if (textNodes.length > 0) {
    parts.push('Text on screen: ' + textNodes.join(' '));
  }

  if (parts.length === 0) {
    return 'I cannot see any readable content on this part of the page.';
  }

  return 'On screen right now: ' + parts.join('. ');
}

/** High-quality voice preferences — British and natural-sounding first */
const VOICE_PREFS = [
  'Google UK English Female',
  'Google UK English Male',
  'Daniel',
  'Serena',
  'Martha',
  'Google US English',
  'Samantha',
  'Karen',
  'Moira',
  'Tessa',
  'Fiona',
];

/** Cached voice object */
let bestVoice = null;
let voiceSearchDone = false;

/**
 * Find and cache the best available voice.
 */
function findBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  for (const pref of VOICE_PREFS) {
    const match = voices.find(v => v.name === pref);
    if (match) {
      bestVoice = match;
      voiceSearchDone = true;
      info(CONTEXT, `Selected voice: ${match.name} (${match.lang})`);
      return;
    }
  }

  // Fallback: any English voice
  bestVoice = voices.find(v => v.lang?.startsWith('en')) || null;
  voiceSearchDone = true;
  if (bestVoice) info(CONTEXT, `Fallback voice: ${bestVoice.name}`);
}

// Chrome loads voices async — listen for when they're ready
if (window.speechSynthesis) {
  findBestVoice();
  window.speechSynthesis.onvoiceschanged = findBestVoice;
}

/**
 * Speak text using Web Speech API with the best available voice.
 * @param {string} text
 */
function webSpeechSpeak(text) {
  if (!text || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  // Try to find voice if not done yet
  if (!voiceSearchDone) findBestVoice();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  if (bestVoice) {
    utterance.voice = bestVoice;
  }

  // Mute mic while speaking to prevent feedback loop
  isSpeaking = true;
  utterance.onend = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  // Chrome bug: speechSynthesis.speak can silently fail after cancel.
  // Workaround: small delay after cancel.
  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 50);
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

// ─── Auto Page Announcement ────────────────────────────────

/**
 * Automatically speak what this page is about when it loads.
 * The agent acts like a companion narrating where you just arrived.
 */
function announcePageOnLoad() {
  // Don't announce on extension pages
  if (window.location.protocol === 'chrome-extension:') return;

  // Wait for page to settle and any prior TTS to finish, then announce
  setTimeout(() => {
    const summary = buildPageSummaryText();
    if (summary) {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.SPEAK, payload: { text: summary, rate: 0.9 } },
        () => { if (chrome.runtime.lastError) { /* ignore */ } }
      );
    }
  }, 3000);
}

/**
 * If the user navigated here via a voice command, announce the page.
 * The service worker sets a flag before navigating.
 */
function announceIfNavigated() {
  if (window.location.protocol === 'chrome-extension:') return;

  chrome.storage.local.get('veil_pending_announce', (result) => {
    if (chrome.runtime.lastError) return;
    if (!result['veil_pending_announce']) return;

    // Clear the flag
    chrome.storage.local.remove('veil_pending_announce');

    // Wait for page to settle, then announce
    setTimeout(() => {
      const summary = buildPageSummaryText();
      if (summary) {
        chrome.runtime.sendMessage(
          { type: MESSAGE_TYPES.SPEAK, payload: { text: summary } },
          () => { if (chrome.runtime.lastError) { /* ignore */ } }
        );
      }
    }, 2000);
  });
}

// ─── Auto Voice Activation ─────────────────────────────────

/**
 * Inject the voice activation bar on every page.
 * Chrome requires a user gesture to start the mic — no way around it.
 * This bar is announced by screen readers. User presses Enter = voice on.
 */
async function autoActivateVoice() {
  // Check if user has voice mode enabled in settings
  try {
    const result = await chrome.storage.local.get('veil_voice_auto');
    if (result['veil_voice_auto'] === false) return;
  } catch {
    // Default: on
  }

  // Don't inject on extension pages
  if (window.location.protocol === 'chrome-extension:') return;

  // Wait for body to be ready
  await new Promise(r => setTimeout(r, 300));

  if (!document.body) return;

  // Remove any existing prompt
  const existing = document.getElementById('veil-voice-prompt');
  if (existing) existing.remove();

  // Create the bar
  const bar = document.createElement('div');
  bar.id = 'veil-voice-prompt';
  bar.setAttribute('role', 'banner');
  bar.setAttribute('aria-label', 'Veil voice activation');
  bar.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'right: 0',
    'z-index: 2147483647',
    'background: #111111',
    'color: #FFFFFF',
    'font-family: system-ui, -apple-system, sans-serif',
    'font-size: 0',
    'padding: 0',
    'text-align: center',
    'border-bottom: 2px solid #2D5A27',
  ].join(';');

  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Activate Veil voice mode. Press Enter to start talking.');
  btn.style.cssText = [
    'display: block',
    'width: 100%',
    'background: #111111',
    'color: #FFFFFF',
    'font-family: system-ui, -apple-system, sans-serif',
    'font-size: 16px',
    'font-weight: 600',
    'padding: 14px 24px',
    'border: none',
    'cursor: pointer',
    'text-align: center',
  ].join(';');
  btn.textContent = 'Veil — Press Enter to start voice mode';

  btn.addEventListener('click', () => activateVoiceFromBar(bar));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateVoiceFromBar(bar);
    }
  });

  bar.appendChild(btn);
  document.body.insertBefore(bar, document.body.firstChild);

  // Focus the button so screen reader announces it immediately
  setTimeout(() => btn.focus(), 200);
}

/**
 * Called when user presses Enter on the voice bar.
 * @param {HTMLElement} bar - The prompt bar to remove
 */
function activateVoiceFromBar(bar) {
  bar.remove();

  if (!voiceInitialized) {
    const success = initVoiceSystem();
    if (!success) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SPEAK,
        payload: { text: 'Speech recognition is not available in this browser. Try using Chrome.' },
      }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
      return;
    }
  }

  toggleListening();

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SPEAK,
    payload: { text: 'Start talking, I\'m listening.' },
  }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
}

// ─── Voice & Summary Handlers ──────────────────────────────

/** Whether voice input has been initialized */
let voiceInitialized = false;

/**
 * Initialize the voice system (only once).
 */
function initVoiceSystem() {
  if (voiceInitialized) return true;

  const success = initSpeechInput({
    onTranscript: (transcript) => {
      if (transcript.startsWith('__error:')) {
        const errorType = transcript.replace('__error:', '');
        const messages = {
          mic_permission_denied: 'Microphone permission was denied. Please allow microphone access in your browser settings.',
          no_microphone: 'No microphone found. Please connect a microphone.',
          network_error: 'Speech recognition network error. Check your internet connection.',
        };
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SPEAK,
          payload: { text: messages[errorType] || 'Speech recognition error.', rate: 0.9 },
        });
        return;
      }
      // Ignore transcripts while TTS is speaking (prevents feedback loop)
      if (isSpeaking) {
        info(CONTEXT, `Ignoring transcript during TTS: "${transcript}"`);
        return;
      }
      info(CONTEXT, `Voice command: "${transcript}"`);
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.VOICE_COMMAND, payload: { transcript, tabId: null } },
        (response) => {
          if (chrome.runtime.lastError) {
            warn(CONTEXT, 'Voice command failed:', chrome.runtime.lastError.message);
          }
        }
      );
    },
    onStateChange: () => {
      // Auto-restart handles state — don't announce every pause/restart
    },
  });

  if (success) {
    voiceInitialized = true;
  }
  return success;
}

/**
 * Toggle voice agent listening on/off.
 * @returns {string} Status message for TTS
 */
function handleToggleVoice() {
  if (!voiceInitialized) {
    if (!initVoiceSystem()) {
      return 'Speech recognition is not available in this browser.';
    }
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

// ─── Section Navigation ────────────────────────────────────

/**
 * Find a section by query, scroll to it, and return the content underneath.
 * @param {string} query - What the user said (heading text or keywords)
 * @returns {{success: boolean, data: string|null}}
 */
function scrollToSectionAndRead(query) {
  const queryLower = query.toLowerCase().trim();
  const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

  let bestMatch = null;
  let bestScore = 0;

  for (const heading of allHeadings) {
    const text = heading.textContent?.trim() || '';
    if (!text) continue;

    const textLower = text.toLowerCase();

    // Exact match
    if (textLower === queryLower) {
      bestMatch = heading;
      bestScore = 100;
      break;
    }

    // Query is contained in heading or heading in query
    if (textLower.includes(queryLower) || queryLower.includes(textLower)) {
      const score = 80;
      if (score > bestScore) {
        bestMatch = heading;
        bestScore = score;
      }
      continue;
    }

    // Keyword matching
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const matchCount = keywords.filter(k => textLower.includes(k)).length;
    if (matchCount > 0) {
      const score = (matchCount / keywords.length) * 60;
      if (score > bestScore) {
        bestMatch = heading;
        bestScore = score;
      }
    }
  }

  if (!bestMatch || bestScore < 20) {
    return { success: false, data: null };
  }

  // Scroll to it
  bestMatch.scrollIntoView({ behavior: 'smooth', block: 'start' });
  bestMatch.focus();

  // Read the content underneath this heading
  const content = readContentUnderHeading(bestMatch);
  const headingText = bestMatch.textContent.trim();

  return {
    success: true,
    data: `${headingText}. ${content}`,
  };
}

/**
 * Read all text content between a heading and the next same-or-higher-level heading.
 * @param {HTMLElement} heading
 * @returns {string}
 */
function readContentUnderHeading(heading) {
  const headingLevel = parseInt(heading.tagName.charAt(1), 10);
  const parts = [];
  let charCount = 0;
  let node = heading.nextElementSibling;

  while (node && charCount < 1000) {
    // Stop at the next heading of same or higher level
    if (/^H[1-6]$/i.test(node.tagName)) {
      const nextLevel = parseInt(node.tagName.charAt(1), 10);
      if (nextLevel <= headingLevel) break;
      // Include subheading text
      parts.push(node.textContent.trim() + '.');
      charCount += node.textContent.length;
      node = node.nextElementSibling;
      continue;
    }

    const text = node.textContent?.trim();
    if (text && text.length > 5) {
      parts.push(text);
      charCount += text.length;
    }

    node = node.nextElementSibling;
  }

  return parts.join(' ').substring(0, 1000) || 'No additional content found under this section.';
}

// ─── Bootstrap ─────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
