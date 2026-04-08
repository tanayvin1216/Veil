/**
 * Popup script — displays repair stats and controls.
 * @module popup
 */

const MESSAGE_TYPES = {
  GET_REPAIR_REPORT: 'get_repair_report',
  TOGGLE_EXTENSION: 'toggle_extension',
};

const STORAGE_KEYS = {
  ENABLED: 'accessagent_enabled',
};

/** DOM element references */
const elements = {
  toggleBtn: null,
  statusDot: null,
  statusText: null,
  countImages: null,
  countButtons: null,
  countForms: null,
  countHeadings: null,
  countLandmarks: null,
  countFocus: null,
  totalRepairs: null,
  repairTime: null,
  settingsLink: null,
  popup: null,
};

/**
 * Initialize the popup.
 */
async function init() {
  bindElements();
  setupListeners();
  await loadState();
  await loadRepairReport();
}

/**
 * Bind DOM element references.
 */
function bindElements() {
  elements.toggleBtn = document.getElementById('toggle-btn');
  elements.statusDot = document.getElementById('status-indicator');
  elements.statusText = document.getElementById('status-text');
  elements.countImages = document.getElementById('count-images');
  elements.countButtons = document.getElementById('count-buttons');
  elements.countForms = document.getElementById('count-forms');
  elements.countHeadings = document.getElementById('count-headings');
  elements.countLandmarks = document.getElementById('count-landmarks');
  elements.countFocus = document.getElementById('count-focus');
  elements.totalRepairs = document.getElementById('total-repairs');
  elements.repairTime = document.getElementById('repair-time');
  elements.settingsLink = document.getElementById('settings-link');
  elements.popup = document.querySelector('.popup');
}

/**
 * Set up event listeners.
 */
function setupListeners() {
  elements.toggleBtn.addEventListener('click', handleToggle);

  elements.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

/**
 * Handle toggle button click.
 */
async function handleToggle() {
  const isCurrentlyEnabled = elements.toggleBtn.getAttribute('aria-pressed') === 'true';
  const newState = !isCurrentlyEnabled;

  elements.toggleBtn.setAttribute('aria-pressed', String(newState));
  updateStatusDisplay(newState);

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.TOGGLE_EXTENSION,
    payload: { enabled: newState },
  });
}

/**
 * Load the current enabled state.
 */
async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ENABLED);
  const isEnabled = result[STORAGE_KEYS.ENABLED] !== false;

  elements.toggleBtn.setAttribute('aria-pressed', String(isEnabled));
  updateStatusDisplay(isEnabled);
}

/**
 * Update the status indicator display.
 * @param {boolean} isEnabled
 */
function updateStatusDisplay(isEnabled) {
  if (isEnabled) {
    elements.statusDot.className = 'status-dot status-dot--active';
    elements.statusText.textContent = 'Active on this page';
    elements.popup.classList.remove('popup--disabled');
  } else {
    elements.statusDot.className = 'status-dot status-dot--disabled';
    elements.statusText.textContent = 'Disabled';
    elements.popup.classList.add('popup--disabled');
  }
}

/**
 * Load and display the repair report for the active tab.
 */
async function loadRepairReport() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: MESSAGE_TYPES.GET_REPAIR_REPORT,
    });

    if (response?.success && response.data?.tier1) {
      displayReport(response.data.tier1);
    }
  } catch {
    // Content script may not be loaded on this page (e.g., chrome:// pages)
    displayNoData();
  }
}

/**
 * Display repair report data.
 * @param {object} report
 */
function displayReport(report) {
  elements.countImages.textContent = report.images || 0;
  elements.countButtons.textContent = report.buttons || 0;
  elements.countForms.textContent = report.formLabels || 0;
  elements.countHeadings.textContent = report.headings || 0;
  elements.countLandmarks.textContent = report.landmarks || 0;
  elements.countFocus.textContent = report.focusTraps || 0;
  elements.totalRepairs.textContent = report.totalRepairs || 0;

  if (report.executionMs !== undefined) {
    elements.repairTime.textContent = `in ${report.executionMs}ms`;
  }
}

/**
 * Display placeholder when no data is available.
 */
function displayNoData() {
  elements.statusText.textContent = 'Not available on this page';
  elements.statusDot.className = 'status-dot status-dot--disabled';
}

document.addEventListener('DOMContentLoaded', init);
