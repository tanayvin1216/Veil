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

  'To activate the voice agent, just click the AccessAgent icon in your browser toolbar. ' +
  'Your screen reader will announce it. Click it once to start listening, click again to stop. ' +
  'That is the only thing you need to remember.',

  'Once voice mode is on, just talk naturally. ' +
  'You can say things like: what is on this page. Tell me about admissions. ' +
  'Take me to the section about financial aid. Click sign in. Scroll down. ' +
  'Next heading. Go back. Or say help to hear all commands.',

  'You can also right-click the AccessAgent icon for more options: ' +
  'Read page summary, What am I missing report, and Settings.',

  'About privacy. AccessAgent collects zero data. No analytics. No tracking. ' +
  'If you add an API key in settings, it makes the voice agent smarter, ' +
  'but everything works without one too.',

  'That is everything. Close this tab and go to any website. ' +
  'Click the AccessAgent icon in your toolbar to start talking. ' +
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
