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

/** Whether the gesture offscreen document is created */
let gestureOffscreenCreated = false;

/**
 * Extension install handler — set up defaults.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await initializeDefaults();
    console.info('[AccessAgent] Installed — defaults initialized');
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/welcome.html') });
  }

  // Create right-click context menu
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'aa-summary',
      title: 'Read Page Summary',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'aa-missing',
      title: 'What Am I Missing?',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'aa-settings',
      title: 'Settings',
      contexts: ['action'],
    });
  });
});

// Auto-start gesture recognition if enabled in settings
chrome.storage.local.get('accessagent_gestures_enabled', (result) => {
  if (result['accessagent_gestures_enabled']) {
    ensureOffscreen()
      .then(() => {
        chrome.runtime.sendMessage({ type: 'GESTURE_START' }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[AccessAgent] Gesture start msg failed:', chrome.runtime.lastError.message);
          }
        });
      })
      .catch(err => console.warn('[AccessAgent] Gesture auto-start failed:', err.message));
  }
});

/**
 * Extension icon click — toggle voice mode. This is the primary activation.
 * No keyboard shortcuts needed. Click the icon, start talking.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'toggle_voice' });
    if (result?.message) {
      handleSpeak({ text: result.message });
    } else {
      handleSpeak({ text: 'Start talking, I\'m listening.' });
    }
  } catch {
    handleSpeak({
      text: 'AccessAgent cannot run on this page. Go to a regular website first.',
    });
  }
});

/**
 * Context menu click handler — right-click the extension icon for more options.
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    switch (info.menuItemId) {
      case 'aa-summary': {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'get_page_summary' });
        if (result?.data) {
          handleSpeak({ text: result.data });
        }
        break;
      }
      case 'aa-missing': {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'what_am_i_missing' });
        if (result?.data) {
          handleSpeak({ text: result.data });
        }
        break;
      }
      case 'aa-settings':
        chrome.runtime.openOptionsPage();
        break;
    }
  } catch {
    handleSpeak({ text: 'Not available on this page.' });
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

    case 'GESTURE_COMMAND':
      handleGestureCommand(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TTS_AUDIO_ENDED':
      // Unmute mic after ElevenLabs audio finishes
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'mute_mic', payload: { muted: false } }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
      });
      sendResponse({ success: true });
      return false;

    case 'GESTURE_ERROR':
      handleSpeak({ text: message.payload?.error || 'Gesture control error.' });
      sendResponse({ success: true });
      return false;

    case 'TOGGLE_GESTURES':
      toggleGestureMode(message.payload?.enabled)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

/**
 * Keyboard shortcut handler — kept as backup, but icon click is primary.
 */
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  try {
    if (command === 'toggle-voice-agent') {
      const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'toggle_voice' });
      handleSpeak({ text: result?.message || 'Voice toggled.' });
    } else if (command === 'page-summary') {
      const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'get_page_summary' });
      handleSpeak({ text: result?.data || 'Could not read page.' });
    } else if (command === 'what-am-i-missing') {
      const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'what_am_i_missing' });
      handleSpeak({ text: result?.data || 'Could not analyze page.' });
    }
  } catch {
    handleSpeak({ text: 'Not available on this page.' });
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

    // Handle stop command — actually stop TTS
    if (response.action?.action === 'stop_speaking') {
      chrome.tts.stop();
      return { success: true, data: response };
    }

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

/**
 * Speak text. ElevenLabs (human British voice) → chrome.tts fallback.
 */
function handleSpeak(payload) {
  const text = typeof payload === 'string' ? payload : payload?.text;
  if (!text) return;
  console.info('[AccessAgent] SPEAK:', text.substring(0, 80));

  // Stop any current speech
  try { chrome.tts.stop(); } catch (e) { /* ignore */ }

  // Tell content script to mute mic while we speak
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs?.[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'mute_mic', payload: { muted: true } }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    }
  });

  // Try ElevenLabs, fall back to chrome.tts
  speakWithElevenLabs(text).catch((err) => {
    console.warn('[AccessAgent] ElevenLabs failed, using chrome.tts:', err.message);
    chrome.tts.speak(text, { rate: 0.9, pitch: 0.95 }, () => {
      // Unmute mic when chrome.tts finishes
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'mute_mic', payload: { muted: false } }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
      });
    });
  });
}

/**
 * Speak using ElevenLabs TTS API — British Daniel voice.
 * Audio played via the offscreen document.
 */
async function speakWithElevenLabs(text) {
  const result = await chrome.storage.local.get('accessagent_elevenlabs_key');
  const apiKey = result['accessagent_elevenlabs_key'];

  if (!apiKey) throw new Error('no_elevenlabs_key');

  // Daniel — British male, natural-sounding
  const voiceId = 'onwK4e9ZLuTAKqWW03F9';

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.0,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}: ${body.substring(0, 100)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioData = Array.from(new Uint8Array(arrayBuffer));

  // Play via offscreen document
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ type: 'PLAY_TTS_AUDIO', audioData });
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
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: '#FFFFFF', tabId });
  }
}

// ─── Gesture Control ──────────────────────────────────────

/**
 * Create or ensure the offscreen document exists.
 * Handles both gesture recognition (USER_MEDIA) and TTS audio playback (AUDIO_PLAYBACK).
 */
async function ensureOffscreen() {
  if (gestureOffscreenCreated) return;

  try {
    await chrome.offscreen.createDocument({
      url: 'gesture/offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Hand gesture recognition and neural TTS audio playback for accessibility',
    });
    gestureOffscreenCreated = true;
  } catch (err) {
    if (err.message?.includes('Only a single offscreen')) {
      gestureOffscreenCreated = true;
    } else {
      throw err;
    }
  }
}

/**
 * Toggle gesture recognition on/off.
 * @param {boolean} enabled
 */
async function toggleGestureMode(enabled) {
  if (enabled) {
    try {
      await ensureOffscreen();
      // Small delay to let offscreen document initialize
      await new Promise(r => setTimeout(r, 500));
      const response = await chrome.runtime.sendMessage({ type: 'GESTURE_START' });
      if (response?.success) {
        handleSpeak({ text: 'Gesture control on. I can see your hand.' });
      } else {
        handleSpeak({ text: response?.error || 'Could not start gesture control.' });
      }
    } catch (err) {
      console.warn('[AccessAgent] Gesture toggle failed:', err.message);
      handleSpeak({ text: 'Gesture control could not start. Try again.' });
    }
    await chrome.storage.local.set({ 'accessagent_gestures_enabled': true });
    return { success: true, enabled: true };
  } else {
    try {
      await chrome.runtime.sendMessage({ type: 'GESTURE_STOP' });
    } catch { /* offscreen might not exist */ }
    handleSpeak({ text: 'Gesture control off.' });
    await chrome.storage.local.set({ 'accessagent_gestures_enabled': false });
    return { success: true, enabled: false };
  }
}

/**
 * Handle a gesture command from the offscreen document.
 * Routes gestures through the same pipeline as voice commands.
 * @param {object} payload
 */
async function handleGestureCommand(payload) {
  const { intent, label, gesture } = payload;
  console.info(`[AccessAgent] Gesture: ${gesture} → ${label}`);

  // STOP — must be instant, no routing
  if (intent === 'stop_speaking') {
    try { chrome.tts.stop(); } catch (e) { /* ignore */ }
    try {
      chrome.runtime.sendMessage({ type: 'STOP_TTS_AUDIO' }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
    // Unmute mic
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'web_speech_stop' }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
      chrome.tabs.sendMessage(tab.id, { type: 'mute_mic', payload: { muted: false } }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    }
    return { success: true };
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = activeTab?.id;
  if (!tabId) return { success: false, error: 'No active tab' };

  // DESCRIBE SCREEN — what's visible in the current viewport
  if (intent === 'describe_screen') {
    try {
      const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      if (screenshot) {
        const base64 = screenshot.replace(/^data:image\/png;base64,/, '');
        const { analyzePageForNavigation } = await import('./api-client.js');
        const pageStructure = await chrome.tabs.sendMessage(tabId, { type: 'get_page_structure' });
        const result = await analyzePageForNavigation(
          base64,
          pageStructure?.data || {},
          'Describe exactly what is visible on screen right now. Be specific and concise.'
        );
        if (result.spoken_response) {
          handleSpeak({ text: result.spoken_response });
          return { success: true };
        }
      }
    } catch (err) {
      console.warn('[AccessAgent] Vision describe failed:', err.message);
    }
    // Fallback to DOM summary if vision fails
    const summaryResult = await chrome.tabs.sendMessage(tabId, { type: 'get_page_summary' });
    handleSpeak({ text: summaryResult?.data || 'I could not read this screen.' });
    return { success: true };
  }

  // TOGGLE VOICE
  if (intent === 'toggle_voice') {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'toggle_voice' });
      handleSpeak({ text: result?.message || 'Voice toggled.' });
    } catch {
      handleSpeak({ text: 'Could not toggle voice on this page.' });
    }
    return { success: true };
  }

  // Everything else — route through voice command pipeline
  const response = await processVoiceCommand(label, tabId);
  if (response.confirmation && !response.silent) {
    handleSpeak({ text: response.confirmation });
  }

  return { success: true, data: response };
}
