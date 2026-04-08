/**
 * Speech input module — Web Speech API with optional Whisper fallback.
 * Handles microphone access, speech recognition, and transcript delivery.
 * @module speech-input
 */

import { STORAGE_KEYS, MESSAGE_TYPES } from '../utils/constants.js';
import { info, warn, error as logError } from '../utils/logger.js';

const CONTEXT = 'SpeechInput';

/** @type {SpeechRecognition|null} */
let recognition = null;

/** @type {boolean} */
let isListening = false;

/** @type {function|null} */
let onTranscriptCallback = null;

/** @type {function|null} */
let onStateChangeCallback = null;

/**
 * Initialize speech recognition.
 * @param {object} options
 * @param {function} options.onTranscript - Called with final transcript text
 * @param {function} options.onStateChange - Called with listening state (boolean)
 * @returns {boolean} True if initialization succeeded
 */
export function initSpeechInput({ onTranscript, onStateChange }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    warn(CONTEXT, 'Web Speech API not supported in this browser');
    return false;
  }

  onTranscriptCallback = onTranscript;
  onStateChangeCallback = onStateChange;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    onStateChangeCallback?.(true);
    info(CONTEXT, 'Listening started');
  };

  recognition.onend = () => {
    isListening = false;
    onStateChangeCallback?.(false);
    info(CONTEXT, 'Listening ended');
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech') {
      return;
    }
    if (event.error === 'aborted') {
      return;
    }
    logError(CONTEXT, `Recognition error: ${event.error}`);
    isListening = false;
    onStateChangeCallback?.(false);
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const transcript = result[0].transcript.trim();
        if (transcript.length > 0) {
          info(CONTEXT, `Transcript: "${transcript}" (confidence: ${result[0].confidence.toFixed(2)})`);
          onTranscriptCallback?.(transcript);
        }
      }
    }
  };

  info(CONTEXT, 'Speech recognition initialized');
  return true;
}

/**
 * Start listening for speech.
 */
export function startListening() {
  if (!recognition) {
    warn(CONTEXT, 'Speech recognition not initialized');
    return;
  }

  if (isListening) {
    info(CONTEXT, 'Already listening');
    return;
  }

  try {
    recognition.start();
  } catch (err) {
    logError(CONTEXT, 'Failed to start recognition:', err.message);
  }
}

/**
 * Stop listening for speech.
 */
export function stopListening() {
  if (!recognition) return;

  if (!isListening) return;

  try {
    recognition.stop();
  } catch (err) {
    logError(CONTEXT, 'Failed to stop recognition:', err.message);
  }
}

/**
 * Toggle listening on/off.
 * @returns {boolean} New listening state
 */
export function toggleListening() {
  if (isListening) {
    stopListening();
    return false;
  }
  startListening();
  return true;
}

/**
 * Check if currently listening.
 * @returns {boolean}
 */
export function getIsListening() {
  return isListening;
}

/**
 * Check if Web Speech API is available.
 * @returns {boolean}
 */
export function isSpeechAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
