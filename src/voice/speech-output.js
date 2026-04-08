/**
 * Speech output module — Speech Synthesis API wrapper with queue management.
 * Handles speaking text aloud with configurable voice, rate, and pitch.
 * @module speech-output
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { info, debug, warn } from '../utils/logger.js';

const CONTEXT = 'SpeechOutput';

/** @type {Array<{utterance: SpeechSynthesisUtterance, resolve: function}>} */
let utteranceQueue = [];

/** @type {boolean} */
let isSpeaking = false;

/** @type {object} */
let voiceConfig = {
  rate: 1.0,
  pitch: 1.0,
  voiceName: null,
};

/**
 * Initialize speech output with stored configuration.
 */
export async function initSpeechOutput() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.VOICE_RATE,
      STORAGE_KEYS.VOICE_PITCH,
      STORAGE_KEYS.VOICE_NAME,
    ]);

    voiceConfig.rate = result[STORAGE_KEYS.VOICE_RATE] || 1.0;
    voiceConfig.pitch = result[STORAGE_KEYS.VOICE_PITCH] || 1.0;
    voiceConfig.voiceName = result[STORAGE_KEYS.VOICE_NAME] || null;

    info(CONTEXT, `Initialized: rate=${voiceConfig.rate}, pitch=${voiceConfig.pitch}`);
  } catch {
    info(CONTEXT, 'Using default voice config');
  }
}

/**
 * Speak text aloud.
 * @param {string} text - Text to speak
 * @param {object} [options] - Override options
 * @param {number} [options.rate] - Speech rate
 * @param {number} [options.pitch] - Speech pitch
 * @param {boolean} [options.interrupt] - Interrupt current speech
 * @returns {Promise<void>} Resolves when speech ends
 */
export function speak(text, options = {}) {
  if (!text || text.trim().length === 0) return Promise.resolve();

  if (!window.speechSynthesis) {
    warn(CONTEXT, 'Speech Synthesis API not available');
    return Promise.resolve();
  }

  if (options.interrupt) {
    stopSpeaking();
  }

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate || voiceConfig.rate;
    utterance.pitch = options.pitch || voiceConfig.pitch;

    // Resolve voice lazily to handle Chrome's async voice loading
    const voice = getVoice(voiceConfig.voiceName);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      isSpeaking = false;
      processQueue();
      resolve();
    };

    utterance.onerror = (event) => {
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        warn(CONTEXT, `Speech error: ${event.error}`);
      }
      isSpeaking = false;
      processQueue();
      resolve();
    };

    if (isSpeaking && !options.interrupt) {
      // Store resolve alongside utterance so queued promises don't hang
      utteranceQueue.push({ utterance, resolve });
      const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
      debug(CONTEXT, `Queued: "${preview}"`);
    } else {
      isSpeaking = true;
      window.speechSynthesis.speak(utterance);
      const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
      debug(CONTEXT, `Speaking: "${preview}"`);
    }
  });
}

/**
 * Stop all speech immediately.
 */
export function stopSpeaking() {
  // Resolve all pending queue promises before clearing
  for (const item of utteranceQueue) {
    item.resolve();
  }
  utteranceQueue = [];
  isSpeaking = false;

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  debug(CONTEXT, 'Speech stopped');
}

/**
 * Check if currently speaking.
 * @returns {boolean}
 */
export function getIsSpeaking() {
  // Sync module state with browser state to prevent drift
  if (!window.speechSynthesis?.speaking && isSpeaking) {
    isSpeaking = false;
  }
  return isSpeaking || (window.speechSynthesis?.speaking ?? false);
}

/**
 * Get available voices.
 * @returns {SpeechSynthesisVoice[]}
 */
export function getAvailableVoices() {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Update voice configuration.
 * @param {object} config
 * @param {number} [config.rate]
 * @param {number} [config.pitch]
 * @param {string} [config.voiceName]
 */
export function updateVoiceConfig(config) {
  if (config.rate !== undefined) voiceConfig.rate = config.rate;
  if (config.pitch !== undefined) voiceConfig.pitch = config.pitch;
  if (config.voiceName !== undefined) voiceConfig.voiceName = config.voiceName;
}

/**
 * Process the next utterance in the queue.
 */
function processQueue() {
  if (utteranceQueue.length === 0) return;

  // Sync isSpeaking with browser state to prevent deadlock
  if (!window.speechSynthesis?.speaking) {
    isSpeaking = false;
  }

  if (isSpeaking) return;

  const next = utteranceQueue.shift();
  if (next) {
    const { utterance, resolve } = next;

    // Wire up resolve for queued utterances
    const originalOnEnd = utterance.onend;
    utterance.onend = () => {
      isSpeaking = false;
      processQueue();
      resolve();
    };
    utterance.onerror = (event) => {
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        warn(CONTEXT, `Speech error: ${event.error}`);
      }
      isSpeaking = false;
      processQueue();
      resolve();
    };

    isSpeaking = true;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Get a voice by name — resolves lazily to handle Chrome's async voice loading.
 * @param {string|null} name
 * @returns {SpeechSynthesisVoice|null}
 */
function getVoice(name) {
  if (!name) return null;

  const voices = getAvailableVoices();
  return voices.find(v => v.name === name) || null;
}
