/**
 * Background service worker — central hub for API calls, state management,
 * and message routing between content scripts and popup.
 * @module service-worker
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../utils/constants.js';
import { initializeDefaults } from '../utils/storage.js';
import { analyzeScreenshot } from './api-client.js';
import { processVoiceCommand } from './agent-logic.js';

/** @type {Map<number, object>} Tab ID → repair report */
const tabReports = new Map();

/**
 * Extension install handler — set up defaults.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await initializeDefaults();
    console.info('[AccessAgent] Installed — defaults initialized');
    // Open welcome/tutorial page on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/welcome.html') });
  }
});

/**
 * Message handler — routes messages from content scripts and popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case MESSAGE_TYPES.TIER1_COMPLETE:
      handleTier1Complete(tabId, message.payload);
      sendResponse({ success: true });
      return false;

    case MESSAGE_TYPES.TIER2_COMPLETE:
      handleTier2Complete(tabId, message.payload);
      sendResponse({ success: true });
      return false;

    case MESSAGE_TYPES.TIER3_REQUEST:
      handleTier3Request(tabId, message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case MESSAGE_TYPES.VOICE_COMMAND:
      handleVoiceCommand(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case MESSAGE_TYPES.GET_REPAIR_REPORT:
      sendResponse({
        success: true,
        data: getTabReport(message.payload?.tabId || tabId),
      });
      return false;

    case MESSAGE_TYPES.TOGGLE_EXTENSION:
      handleToggle(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case MESSAGE_TYPES.API_CALL:
      handleApiCall(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case MESSAGE_TYPES.SPEAK:
      handleSpeak(message.payload);
      sendResponse({ success: true });
      return false;

    case MESSAGE_TYPES.STOP_SPEAKING:
      chrome.tts.stop();
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

/**
 * Keyboard shortcut handler.
 */
chrome.commands.onCommand.addListener(async (command) => {
  console.info('[AccessAgent] Command received:', command);

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    console.warn('[AccessAgent] No active tab for command:', command);
    return;
  }

  try {
    switch (command) {
      case 'toggle-voice-agent': {
        const voiceResult = await chrome.tabs.sendMessage(activeTab.id, { type: 'toggle_voice' });
        if (voiceResult?.message) {
          handleSpeak({ text: voiceResult.message, rate: 1.0 });
        }
        break;
      }

      case 'page-summary': {
        const summaryResult = await chrome.tabs.sendMessage(activeTab.id, { type: 'get_page_summary' });
        if (summaryResult?.data) {
          handleSpeak({ text: summaryResult.data, rate: 1.0 });
        }
        break;
      }

      case 'what-am-i-missing': {
        const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'what_am_i_missing' });
        if (result?.data) {
          handleSpeak({ text: result.data, rate: 1.0 });
        }
        break;
      }
    }
  } catch (err) {
    console.error('[AccessAgent] Command failed:', command, err.message);
    // Content script not loaded on this page — speak error via TTS
    handleSpeak({
      text: 'AccessAgent is not available on this page. Try a regular website.',
      rate: 1.0,
    });
  }
});

/**
 * Tab removal — clean up stored reports.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabReports.delete(tabId);
});

// ─── Message Handlers ──────────────────────────────────────

/**
 * Store Tier 1 repair report for a tab.
 * @param {number} tabId
 * @param {object} payload
 */
function handleTier1Complete(tabId, payload) {
  if (!tabId) return;

  const existing = tabReports.get(tabId) || {};
  tabReports.set(tabId, {
    ...existing,
    tier1: payload.report,
    url: payload.url,
    title: payload.title,
    timestamp: payload.timestamp,
  });

  updateBadge(tabId, payload.report?.totalRepairs ?? 0);
}

/**
 * Store Tier 2 report.
 * @param {number} tabId
 * @param {object} payload
 */
function handleTier2Complete(tabId, payload) {
  if (!tabId) return;

  const existing = tabReports.get(tabId) || {};
  tabReports.set(tabId, { ...existing, tier2: payload });
}

/**
 * Handle Tier 3 vision analysis request.
 * @param {number} tabId
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function handleTier3Request(tabId, payload) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: 'no_api_key' };
    }

    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 80,
    });

    const base64 = screenshot.replace(/^data:image\/png;base64,/, '');

    const result = await analyzeScreenshot(base64, payload.pageText || '');

    const existing = tabReports.get(tabId) || {};
    tabReports.set(tabId, { ...existing, tier3: result });

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Handle a voice command.
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function handleVoiceCommand(payload) {
  let { transcript, tabId } = payload;

  // If content script didn't know its tab ID, look it up
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = activeTab?.id || null;
  }

  try {
    console.info('[AccessAgent] Voice command:', transcript, 'tabId:', tabId);
    const response = await processVoiceCommand(transcript, tabId);
    console.info('[AccessAgent] Voice response:', response?.confirmation?.substring(0, 80));

    if (response.confirmation && !response.silent) {
      handleSpeak({ text: response.confirmation, rate: 0.9 });
    }

    return { success: true, data: response };
  } catch (err) {
    console.error('[AccessAgent] Voice command failed:', err);
    handleSpeak({ text: 'Sorry, something went wrong. Try again.', rate: 0.9 });
    return { success: false, error: err.message };
  }
}

/**
 * Toggle the extension on/off.
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function handleToggle(payload) {
  const { enabled } = payload;
  await chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enabled });

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, {
      type: MESSAGE_TYPES.TOGGLE_EXTENSION,
      payload: { enabled },
    });
  }

  return { success: true, enabled };
}

/** Cached preferred voice name */
let preferredVoice = null;
let voiceSearchDone = false;

/**
 * Find the best natural-sounding voice available.
 * Prefers: Google UK English Female > Samantha > Karen > any English female > default
 */
function findBestVoice() {
  if (voiceSearchDone) return;
  voiceSearchDone = true;

  chrome.tts.getVoices((voices) => {
    if (!voices || voices.length === 0) return;

    // Ranked preference — warm, natural, calm voices
    const preferred = [
      'Google UK English Female',
      'Google US English',
      'Samantha',
      'Karen',
      'Moira',
      'Tessa',
      'Fiona',
      'Victoria',
      'Microsoft Zira',
    ];

    for (const name of preferred) {
      const match = voices.find(v => v.voiceName === name);
      if (match) {
        preferredVoice = match.voiceName;
        console.info('[AccessAgent] Selected voice:', preferredVoice);
        return;
      }
    }

    // Fallback: any English voice that isn't "Google Chrome"
    const english = voices.find(v =>
      v.lang?.startsWith('en') && !v.voiceName?.includes('Chrome')
    );
    if (english) {
      preferredVoice = english.voiceName;
      console.info('[AccessAgent] Fallback voice:', preferredVoice);
    }
  });
}

// Find the best voice on startup
findBestVoice();

/**
 * Speak text using chrome.tts API with a calm, natural voice.
 * @param {object} payload
 */
function handleSpeak(payload) {
  const { text, rate = 0.9, pitch = 0.95, voiceName } = payload;

  chrome.tts.stop();

  const options = {
    rate: Math.max(0.5, Math.min(2.0, rate)),
    pitch,
    volume: 1.0,
    enqueue: false,
  };

  // Use user-specified voice, or our preferred natural voice
  const voice = voiceName || preferredVoice;
  if (voice) {
    options.voiceName = voice;
  }

  chrome.tts.speak(text, options);
}

/**
 * Handle generic API calls from content scripts.
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function handleApiCall(payload) {
  // Reserved for future API call routing
  return { success: false, error: 'Not implemented' };
}

/**
 * Get the stored API key.
 * @returns {Promise<string|null>}
 */
async function getApiKey() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return result[STORAGE_KEYS.API_KEY] || null;
}

/**
 * Get the repair report for a tab.
 * @param {number} tabId
 * @returns {object|null}
 */
function getTabReport(tabId) {
  return tabReports.get(tabId) || null;
}

/**
 * Update the extension badge with repair count.
 * @param {number} tabId
 * @param {number} count
 */
function updateBadge(tabId, count) {
  if (count === 0) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const text = count > 99 ? '99+' : String(count);
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#2D5A27', tabId });
  chrome.action.setBadgeTextColor({ color: '#FFFFFF', tabId });
}
