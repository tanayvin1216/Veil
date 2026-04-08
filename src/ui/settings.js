/**
 * Settings page script — API configuration, voice settings, tier toggles.
 * @module settings
 */

const STORAGE_KEYS = {
  API_KEY: 'accessagent_api_key',
  API_PROVIDER: 'accessagent_api_provider',
  TIER1_ENABLED: 'accessagent_tier1_enabled',
  TIER2_ENABLED: 'accessagent_tier2_enabled',
  TIER3_ENABLED: 'accessagent_tier3_enabled',
  VOICE_AUTO: 'accessagent_voice_auto',
  VOICE_RATE: 'accessagent_voice_rate',
  VOICE_PITCH: 'accessagent_voice_pitch',
  VOICE_NAME: 'accessagent_voice_name',
  SPEECH_ENGINE: 'accessagent_speech_engine',
};

const elements = {};

async function init() {
  bindElements();
  setupListeners();
  await loadSettings();
  populateVoices();
}

function bindElements() {
  elements.form = document.getElementById('settings-form');
  elements.apiProvider = document.getElementById('api-provider');
  elements.apiKey = document.getElementById('api-key');
  elements.toggleKeyVisibility = document.getElementById('toggle-key-visibility');
  elements.elevenlabsKey = document.getElementById('elevenlabs-key');
  elements.toggleElevenlabsVisibility = document.getElementById('toggle-elevenlabs-visibility');
  elements.tier1 = document.getElementById('tier1-enabled');
  elements.tier2 = document.getElementById('tier2-enabled');
  elements.tier3 = document.getElementById('tier3-enabled');
  elements.voiceAuto = document.getElementById('voice-auto');
  elements.gesturesEnabled = document.getElementById('gestures-enabled');
  elements.speechEngine = document.getElementById('speech-engine');
  elements.voiceName = document.getElementById('voice-name');
  elements.voiceRate = document.getElementById('voice-rate');
  elements.voicePitch = document.getElementById('voice-pitch');
  elements.rateValue = document.getElementById('rate-value');
  elements.pitchValue = document.getElementById('pitch-value');
  elements.testVoice = document.getElementById('test-voice');
  elements.saveStatus = document.getElementById('save-status');
}

function setupListeners() {
  elements.form.addEventListener('submit', handleSave);

  elements.toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.apiKey.type === 'password';
    elements.apiKey.type = isPassword ? 'text' : 'password';
    elements.toggleKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
    elements.toggleKeyVisibility.setAttribute(
      'aria-label',
      isPassword ? 'Hide API key' : 'Show API key'
    );
  });

  elements.toggleElevenlabsVisibility.addEventListener('click', () => {
    const isPassword = elements.elevenlabsKey.type === 'password';
    elements.elevenlabsKey.type = isPassword ? 'text' : 'password';
    elements.toggleElevenlabsVisibility.textContent = isPassword ? 'Hide' : 'Show';
  });

  document.getElementById('grant-camera').addEventListener('click', async () => {
    const status = document.getElementById('camera-status');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Got permission — stop the stream immediately
      for (const track of stream.getTracks()) track.stop();
      status.textContent = '✓ Camera access granted';
      status.style.color = '#2D5A27';
    } catch (err) {
      status.textContent = 'Camera denied: ' + err.message;
      status.style.color = '#cc0000';
    }
  });

  elements.voiceRate.addEventListener('input', () => {
    elements.rateValue.textContent = elements.voiceRate.value;
  });

  elements.voicePitch.addEventListener('input', () => {
    elements.pitchValue.textContent = elements.voicePitch.value;
  });

  elements.testVoice.addEventListener('click', testVoiceOutput);
}

async function loadSettings() {
  const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  elements.apiProvider.value = result[STORAGE_KEYS.API_PROVIDER] || 'openai';
  elements.apiKey.value = result[STORAGE_KEYS.API_KEY] || '';
  elements.elevenlabsKey.value = result['accessagent_elevenlabs_key'] || '';

  elements.tier1.checked = result[STORAGE_KEYS.TIER1_ENABLED] !== false;
  elements.tier2.checked = result[STORAGE_KEYS.TIER2_ENABLED] !== false;
  elements.tier3.checked = result[STORAGE_KEYS.TIER3_ENABLED] !== false;
  elements.voiceAuto.checked = result[STORAGE_KEYS.VOICE_AUTO] !== false;
  elements.gesturesEnabled.checked = result['accessagent_gestures_enabled'] === true;

  elements.speechEngine.value = result[STORAGE_KEYS.SPEECH_ENGINE] || 'web-speech-api';

  const rate = result[STORAGE_KEYS.VOICE_RATE] || 1.05;
  const pitch = result[STORAGE_KEYS.VOICE_PITCH] || 1.1;

  elements.voiceRate.value = rate;
  elements.rateValue.textContent = rate;
  elements.voicePitch.value = pitch;
  elements.pitchValue.textContent = pitch;
}

function populateVoices() {
  const loadVoices = () => {
    const voices = window.speechSynthesis?.getVoices() || [];

    while (elements.voiceName.options.length > 1) {
      elements.voiceName.remove(1);
    }

    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    for (const voice of englishVoices) {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.voiceName.appendChild(option);
    }

    chrome.storage.local.get(STORAGE_KEYS.VOICE_NAME).then(result => {
      if (result[STORAGE_KEYS.VOICE_NAME]) {
        elements.voiceName.value = result[STORAGE_KEYS.VOICE_NAME];
      }
    });
  };

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

async function handleSave(event) {
  event.preventDefault();

  const settings = {
    [STORAGE_KEYS.API_PROVIDER]: elements.apiProvider.value,
    [STORAGE_KEYS.API_KEY]: elements.apiKey.value,
    'accessagent_elevenlabs_key': elements.elevenlabsKey.value,
    [STORAGE_KEYS.TIER1_ENABLED]: elements.tier1.checked,
    [STORAGE_KEYS.TIER2_ENABLED]: elements.tier2.checked,
    [STORAGE_KEYS.TIER3_ENABLED]: elements.tier3.checked,
    [STORAGE_KEYS.VOICE_AUTO]: elements.voiceAuto.checked,
    'accessagent_gestures_enabled': elements.gesturesEnabled.checked,
    [STORAGE_KEYS.SPEECH_ENGINE]: elements.speechEngine.value,
    [STORAGE_KEYS.VOICE_NAME]: elements.voiceName.value,
    [STORAGE_KEYS.VOICE_RATE]: parseFloat(elements.voiceRate.value),
    [STORAGE_KEYS.VOICE_PITCH]: parseFloat(elements.voicePitch.value),
  };

  await chrome.storage.local.set(settings);

  elements.saveStatus.textContent = 'Saved';
  setTimeout(() => {
    elements.saveStatus.textContent = '';
  }, 2000);
}

function testVoiceOutput() {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(
    'AccessAgent is ready. This is how I will sound when describing pages to you.'
  );
  utterance.rate = parseFloat(elements.voiceRate.value);
  utterance.pitch = parseFloat(elements.voicePitch.value);

  const voiceName = elements.voiceName.value;
  if (voiceName) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

document.addEventListener('DOMContentLoaded', init);
