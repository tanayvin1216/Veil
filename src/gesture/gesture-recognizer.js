/**
 * MediaPipe hand gesture recognition module.
 * Runs in an offscreen document to access the webcam.
 * Detects gestures and sends them to the service worker.
 * @module gesture-recognizer
 */

import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

/** Minimum confidence to accept a gesture */
const MIN_CONFIDENCE = 0.6;

/** How often to process frames (ms) */
const FRAME_INTERVAL = 100;

/** Debounce — same gesture must hold for N consecutive frames */
const GESTURE_HOLD_FRAMES = 2;

/** Cooldown after a gesture is acted on (ms) */
const GESTURE_COOLDOWN = 800;

/** Map MediaPipe gesture names to AccessAgent commands */
const GESTURE_COMMANDS = {
  'Open_Palm':     { intent: 'stop_speaking', label: 'Stop' },
  'Thumb_Up':      { intent: 'scroll_down', label: 'Scroll down' },
  'Thumb_Down':    { intent: 'go_back', label: 'Go back' },
  'Pointing_Up':   { intent: 'scroll_up', label: 'Scroll up' },
  'Victory':       { intent: 'page_summary', label: 'Page summary' },
  'Closed_Fist':   { intent: 'toggle_voice', label: 'Voice mode' },
  'ILoveYou':      { intent: 'help', label: 'Help' },
};

let recognizer = null;
let videoElement = null;
let stream = null;
let animationId = null;
let isRunning = false;

/** Track consecutive gesture detections for debounce */
let lastGesture = null;
let gestureCount = 0;
let lastActionTime = 0;

/**
 * Initialize the MediaPipe gesture recognizer.
 */
async function initRecognizer() {
  if (recognizer) return; // Already initialized

  console.info('[AccessAgent] Loading MediaPipe model...');
  const vision = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL('wasm')
  );

  console.info('[AccessAgent] MediaPipe WASM loaded, creating recognizer...');
  recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 1,
  });

  console.info('[AccessAgent] Gesture recognizer ready');
}

/**
 * Start webcam capture and gesture detection loop.
 */
async function startCamera() {
  if (isRunning) return;

  videoElement = document.getElementById('gesture-video');
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.id = 'gesture-video';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
  }

  try {
    console.info('[AccessAgent] Requesting camera access...');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
    });
    console.info('[AccessAgent] Camera access granted');
    videoElement.srcObject = stream;
    await videoElement.play();
    isRunning = true;
    console.info('[AccessAgent] Gesture camera started');
  } catch (err) {
    console.error('[AccessAgent] Camera access failed:', err.name, err.message);
    chrome.runtime.sendMessage({
      type: 'GESTURE_ERROR',
      payload: { error: `Camera failed: ${err.name}. Go to chrome://settings/content/camera and allow this extension.` },
    }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    throw err;
  }
}

/**
 * Stop webcam and gesture detection.
 */
function stopCamera() {
  isRunning = false;
  if (animationId) {
    clearInterval(animationId);
    animationId = null;
  }
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    stream = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
  }
  console.info('[AccessAgent] Gesture camera stopped');
}

/**
 * Main detection loop — uses setInterval because requestAnimationFrame
 * does NOT fire in offscreen documents (no visible window).
 */
function detectLoop() {
  if (animationId) clearInterval(animationId);

  animationId = setInterval(() => {
    if (!isRunning || !recognizer || !videoElement) return;
    processFrame(performance.now());
  }, FRAME_INTERVAL);

  console.info('[AccessAgent] Gesture detection loop started');
}

/**
 * Process a single video frame for gesture detection.
 */
function processFrame(timestamp) {
  if (videoElement.readyState < 2) return;

  const results = recognizer.recognizeForVideo(videoElement, timestamp);

  if (!results.gestures || results.gestures.length === 0) {
    lastGesture = null;
    gestureCount = 0;
    return;
  }

  const topGesture = results.gestures[0][0];
  const gestureName = topGesture.categoryName;
  const confidence = topGesture.score;

  if (confidence < MIN_CONFIDENCE) {
    lastGesture = null;
    gestureCount = 0;
    return;
  }

  // Ignore "None" gesture
  if (gestureName === 'None') {
    lastGesture = null;
    gestureCount = 0;
    return;
  }

  // Debounce: same gesture must hold for GESTURE_HOLD_FRAMES consecutive frames
  if (gestureName === lastGesture) {
    gestureCount++;
  } else {
    lastGesture = gestureName;
    gestureCount = 1;
  }

  if (gestureCount === GESTURE_HOLD_FRAMES) {
    const now = Date.now();
    if (now - lastActionTime < GESTURE_COOLDOWN) return;

    lastActionTime = now;
    gestureCount = 0;

    const command = GESTURE_COMMANDS[gestureName];
    if (command) {
      console.info(`[AccessAgent] Gesture detected: ${gestureName} → ${command.label}`);
      chrome.runtime.sendMessage({
        type: 'GESTURE_COMMAND',
        payload: {
          gesture: gestureName,
          intent: command.intent,
          label: command.label,
          confidence,
        },
      });
    }
  }
}

/**
 * Listen for messages from the service worker.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GESTURE_START':
      // Start camera FIRST (triggers permission prompt), then load model
      startCamera()
        .then(() => initRecognizer())
        .then(() => {
          detectLoop();
          sendResponse({ success: true });
        })
        .catch(err => {
          console.error('[AccessAgent] Gesture start failed:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case 'GESTURE_STOP':
      stopCamera();
      sendResponse({ success: true });
      return false;

    case 'GESTURE_STATUS':
      sendResponse({ success: true, running: isRunning });
      return false;

    case 'PLAY_TTS_AUDIO': {
      playTTSAudio(message.audioData)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'STOP_TTS_AUDIO': {
      const audio = document.getElementById('tts-audio');
      if (audio) { audio.pause(); audio.currentTime = 0; }
      sendResponse({ success: true });
      return false;
    }

    default:
      return false;
  }
});

/**
 * Play TTS audio from raw byte array data.
 * @param {number[]} audioData - MP3 audio as plain array
 */
async function playTTSAudio(audioData) {
  const audio = document.getElementById('tts-audio');
  if (!audio) throw new Error('No audio element');

  // Stop any current playback
  audio.pause();
  audio.currentTime = 0;

  // Revoke previous blob URL if any
  if (audio.src && audio.src.startsWith('blob:')) {
    URL.revokeObjectURL(audio.src);
  }

  const blob = new Blob([new Uint8Array(audioData)], { type: 'audio/mp3' });
  audio.src = URL.createObjectURL(blob);
  await audio.play();
}
