/**
 * Popup script — voice-first interface for blind and low-vision users.
 * Big buttons, speech controls, high contrast.
 */

const MSG = {
  GET_PAGE_SUMMARY: 'get_page_summary',
  WHAT_AM_I_MISSING: 'what_am_i_missing',
  TOGGLE_VOICE: 'toggle_voice',
  SPEAK: 'speak',
  STOP_SPEAKING: 'stop_speaking',
};

let lastSummary = '';
let currentSpeed = 0.9;
let isPaused = false;
let voiceActive = false;

const el = {};

function init() {
  el.status = document.getElementById('status');
  el.btnSummary = document.getElementById('btn-summary');
  el.btnMissing = document.getElementById('btn-missing');
  el.btnVoice = document.getElementById('btn-voice');
  el.btnPause = document.getElementById('btn-pause');
  el.btnStop = document.getElementById('btn-stop');
  el.btnRepeat = document.getElementById('btn-repeat');
  el.btnSlower = document.getElementById('btn-slower');
  el.btnFaster = document.getElementById('btn-faster');
  el.speedDisplay = document.getElementById('speed-display');
  el.summaryText = document.getElementById('summary-text');
  el.settingsLink = document.getElementById('settings-link');

  el.btnSummary.addEventListener('click', handleSummary);
  el.btnMissing.addEventListener('click', handleMissing);
  el.btnVoice.addEventListener('click', handleVoiceToggle);
  el.btnPause.addEventListener('click', handlePause);
  el.btnStop.addEventListener('click', handleStop);
  el.btnRepeat.addEventListener('click', handleRepeat);
  el.btnSlower.addEventListener('click', () => adjustSpeed(-0.1));
  el.btnFaster.addEventListener('click', () => adjustSpeed(0.1));
  el.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function handleSummary() {
  setStatus('Reading page...', 'speaking');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_SUMMARY });

    if (response?.data) {
      lastSummary = response.data;
      showSummary(lastSummary);
      speakText(lastSummary);
    } else {
      setStatus('Could not read this page', '');
    }
  } catch {
    setStatus('Not available on this page', '');
  }
}

async function handleMissing() {
  setStatus('Checking accessibility...', 'speaking');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, { type: MSG.WHAT_AM_I_MISSING });

    if (response?.data) {
      lastSummary = response.data;
      showSummary(lastSummary);
      speakText(lastSummary);
    }
  } catch {
    setStatus('Not available on this page', '');
  }
}

async function handleVoiceToggle() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, { type: MSG.TOGGLE_VOICE });

    voiceActive = !voiceActive;
    el.btnVoice.textContent = voiceActive ? 'Stop Voice Mode' : 'Start Voice Mode';
    el.btnVoice.classList.toggle('active', voiceActive);

    if (response?.message) {
      speakText(response.message);
    }

    setStatus(voiceActive ? 'Listening...' : 'Ready', voiceActive ? 'listening' : '');
  } catch {
    setStatus('Voice not available on this page', '');
  }
}

function handlePause() {
  if (isPaused) {
    chrome.tts.resume();
    el.btnPause.textContent = 'Pause';
    setStatus('Reading...', 'speaking');
  } else {
    chrome.tts.pause();
    el.btnPause.textContent = 'Resume';
    setStatus('Paused', '');
  }
  isPaused = !isPaused;
}

function handleStop() {
  chrome.tts.stop();
  isPaused = false;
  el.btnPause.textContent = 'Pause';
  enablePlaybackControls(false);
  setStatus('Ready', '');
}

function handleRepeat() {
  if (lastSummary) {
    speakText(lastSummary);
  }
}

function adjustSpeed(delta) {
  currentSpeed = Math.max(0.5, Math.min(2.0, currentSpeed + delta));
  currentSpeed = Math.round(currentSpeed * 10) / 10;
  el.speedDisplay.textContent = `Speed: ${currentSpeed}x`;

  // If currently speaking, restart with new speed
  if (lastSummary) {
    chrome.tts.stop();
    speakText(lastSummary);
  }
}

function speakText(text) {
  chrome.tts.stop();
  isPaused = false;
  el.btnPause.textContent = 'Pause';

  chrome.tts.speak(text, {
    rate: currentSpeed,
    pitch: 0.95,
    volume: 1.0,
    onEvent: (event) => {
      if (event.type === 'start') {
        setStatus('Reading...', 'speaking');
        enablePlaybackControls(true);
      }
      if (event.type === 'end' || event.type === 'cancelled') {
        setStatus('Ready', '');
        enablePlaybackControls(false);
      }
      if (event.type === 'error') {
        setStatus('Speech error', '');
        enablePlaybackControls(false);
      }
    },
  });
}

function showSummary(text) {
  el.summaryText.textContent = text;
  el.summaryText.classList.add('visible');
}

function setStatus(text, className) {
  el.status.textContent = text;
  el.status.className = 'status' + (className ? ' ' + className : '');
}

function enablePlaybackControls(enabled) {
  el.btnPause.disabled = !enabled;
  el.btnStop.disabled = !enabled;
  el.btnRepeat.disabled = !lastSummary;
}

document.addEventListener('DOMContentLoaded', init);
