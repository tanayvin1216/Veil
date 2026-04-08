const isMac = navigator.platform.toUpperCase().includes('MAC');
const modKey = isMac ? 'Control' : 'Alt';

// Update text to show correct modifier key
if (!isMac) {
  document.getElementById('shortcut-a').textContent = 'Alt + Shift + A';
  document.getElementById('shortcut-s').textContent = 'Alt + Shift + P';
  document.getElementById('shortcut-m').textContent = 'Alt + Shift + M';
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = 'Alt'; });
}

const startBtn = document.getElementById('start-btn');
const tutorialContent = document.getElementById('tutorial-content');
const speakingIndicator = document.getElementById('speaking-indicator');
let tutorialStarted = false;

const tutorialSteps = [
  'Welcome to AccessAgent. Your personal accessibility agent is now installed and running.',

  'AccessAgent automatically repairs every website you visit. ' +
  'It fixes missing image descriptions, labels unlabeled buttons, ' +
  'repairs heading structure, dismisses cookie popups, and detects CAPTCHAs. ' +
  'You do not need to do anything. It works automatically.',

  'Here are your three keyboard shortcuts. ' +
  modKey + ' plus Shift plus A. This toggles the voice agent on and off. ' +
  modKey + ' plus Shift plus P. This reads a summary of the current page. ' +
  modKey + ' plus Shift plus M. This gives you the What Am I Missing accessibility gap report.',

  'To use the voice agent, press ' + modKey + ' plus Shift plus A, then speak naturally. ' +
  'You can say things like: click followed by a button name. Scroll down. Next heading. ' +
  'What is on this page. Fill a field with a value. Dismiss this popup. Go back. Or help.',

  'AccessAgent has three repair tiers. ' +
  'Tier 1 runs instantly on every page with no internet needed. ' +
  'Tier 2 handles cookie banners and CAPTCHAs automatically. ' +
  'Tier 3 uses AI to describe visual content, but requires an API key you can add in settings.',

  'About privacy. AccessAgent collects zero data. No analytics. No tracking. ' +
  'Your API key stays on your device and is never shared.',

  'That is everything you need to know. AccessAgent is now active. ' +
  'Close this tab and browse the web normally. All repairs happen automatically. ' +
  'Press ' + modKey + ' plus Shift plus A any time to talk to your voice agent. ' +
  'Say help at any time to hear all available voice commands.',
];

function startTutorial() {
  if (tutorialStarted) return;
  tutorialStarted = true;

  startBtn.classList.add('hidden');
  tutorialContent.classList.add('visible');

  window.speechSynthesis.cancel();
  setTimeout(() => speakStep(0), 200);
}

function speakStep(index) {
  if (index >= tutorialSteps.length) {
    speakingIndicator.classList.remove('active');
    return;
  }

  speakingIndicator.classList.add('active');
  speakingIndicator.textContent = 'Speaking step ' + (index + 1) + ' of ' + tutorialSteps.length;

  const utterance = new SpeechSynthesisUtterance(tutorialSteps[index]);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  utterance.onend = () => {
    setTimeout(() => speakStep(index + 1), 800);
  };

  utterance.onerror = (event) => {
    console.error('Speech error on step', index, event.error);
    setTimeout(() => speakStep(index + 1), 400);
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

startBtn.addEventListener('click', startTutorial);
startBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    startTutorial();
  }
});

document.addEventListener('keydown', (e) => {
  if (!tutorialStarted) {
    startTutorial();
  }
});
