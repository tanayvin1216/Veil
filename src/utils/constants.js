/**
 * Veil constants — hotkeys, selectors, patterns, and defaults.
 * @module constants
 */

/** Default keyboard shortcuts */
export const HOTKEYS = {
  TOGGLE_VOICE: 'Alt+Shift+A',
  PAGE_SUMMARY: 'Alt+Shift+S',
  WHAT_AM_I_MISSING: 'Alt+Shift+M',
};

/** Extension storage keys */
export const STORAGE_KEYS = {
  API_KEY: 'veil_api_key',
  API_PROVIDER: 'veil_api_provider',
  ENABLED: 'veil_enabled',
  TIER1_ENABLED: 'veil_tier1_enabled',
  TIER2_ENABLED: 'veil_tier2_enabled',
  TIER3_ENABLED: 'veil_tier3_enabled',
  VOICE_RATE: 'veil_voice_rate',
  VOICE_PITCH: 'veil_voice_pitch',
  VOICE_NAME: 'veil_voice_name',
  SPEECH_ENGINE: 'veil_speech_engine',
  REPAIR_REPORT: 'veil_repair_report',
  CONVERSATION_HISTORY: 'veil_conversation_history',
};

/** Default settings applied on first install */
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.ENABLED]: true,
  [STORAGE_KEYS.TIER1_ENABLED]: true,
  [STORAGE_KEYS.TIER2_ENABLED]: true,
  [STORAGE_KEYS.TIER3_ENABLED]: true,
  [STORAGE_KEYS.API_PROVIDER]: 'openai',
  [STORAGE_KEYS.VOICE_RATE]: 1.0,
  [STORAGE_KEYS.VOICE_PITCH]: 1.0,
  [STORAGE_KEYS.SPEECH_ENGINE]: 'web-speech-api',
};

/** Known cookie consent SDK selectors and class patterns */
export const COOKIE_SELECTORS = [
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '.onetrust-pc-dark-filter',
  '#CybotCookiebotDialog',
  '#CybotCookiebotDialogBody',
  '.cookiebot-widget',
  '#qc-cmp2-container',
  '#qc-cmp2-main',
  '.qc-cmp2-summary-buttons',
  '#cookie-banner',
  '.cookie-banner',
  '.cookie-consent',
  '.cookie-notice',
  '.cookie-popup',
  '.cc-banner',
  '.cc-window',
  '.cc-dialog',
  '#gdpr-banner',
  '.gdpr-banner',
  '.gdpr-consent',
  '.consent-banner',
  '.consent-modal',
  '.privacy-banner',
  '.privacy-notice',
  '[data-testid="cookie-policy-manage-dialog"]',
  '[aria-label="Cookie consent"]',
  '[aria-label="Cookie banner"]',
  '[role="dialog"][class*="cookie"]',
  '[role="dialog"][class*="consent"]',
];

/** Cookie reject/dismiss button selectors (ordered by preference — most privacy-preserving first) */
export const COOKIE_REJECT_SELECTORS = [
  '[data-testid="reject-all"]',
  'button[class*="reject"]',
  'button[class*="deny"]',
  'button[class*="decline"]',
  'button[class*="refuse"]',
  '#onetrust-reject-all-handler',
  '.onetrust-reject-all-handler',
  '#CybotCookiebotDialogBodyButtonDecline',
  '.cc-deny',
  '.cc-reject',
  'button[class*="necessary"]',
  'button[class*="essential"]',
  'button[class*="dismiss"]',
  'button[class*="close"]',
  '.cookie-banner button:last-child',
];

/** Cookie accept button selectors (fallback if no reject option exists) */
export const COOKIE_ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.cc-accept',
  '.cc-allow',
  'button[class*="accept"]',
  'button[class*="agree"]',
  'button[class*="allow"]',
  'button[class*="got-it"]',
];

/** Known CAPTCHA element patterns */
export const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  '.g-recaptcha',
  '.h-captcha',
  '#g-recaptcha',
  '#h-captcha',
  '[data-sitekey]',
  '.cf-turnstile',
  '#cf-turnstile',
  'iframe[title*="reCAPTCHA"]',
  'iframe[title*="hCaptcha"]',
  'iframe[title*="Cloudflare"]',
];

/** CSS class name patterns that suggest icon purpose */
export const ICON_CLASS_MAP = {
  search: 'Search',
  menu: 'Menu',
  hamburger: 'Menu',
  close: 'Close',
  cancel: 'Cancel',
  delete: 'Delete',
  remove: 'Remove',
  edit: 'Edit',
  pencil: 'Edit',
  settings: 'Settings',
  gear: 'Settings',
  cog: 'Settings',
  home: 'Home',
  user: 'User profile',
  account: 'Account',
  profile: 'Profile',
  cart: 'Shopping cart',
  basket: 'Shopping cart',
  bag: 'Shopping bag',
  heart: 'Favorite',
  like: 'Like',
  star: 'Star',
  share: 'Share',
  download: 'Download',
  upload: 'Upload',
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  volume: 'Volume',
  mute: 'Mute',
  arrow: 'Arrow',
  chevron: 'Expand',
  expand: 'Expand',
  collapse: 'Collapse',
  dropdown: 'Dropdown',
  filter: 'Filter',
  sort: 'Sort',
  refresh: 'Refresh',
  reload: 'Refresh',
  mail: 'Email',
  email: 'Email',
  envelope: 'Email',
  phone: 'Phone',
  call: 'Call',
  chat: 'Chat',
  message: 'Message',
  notification: 'Notifications',
  bell: 'Notifications',
  alert: 'Alert',
  warning: 'Warning',
  info: 'Information',
  help: 'Help',
  question: 'Help',
  lock: 'Locked',
  unlock: 'Unlocked',
  eye: 'Show',
  visible: 'Show',
  hidden: 'Hide',
  copy: 'Copy',
  paste: 'Paste',
  print: 'Print',
  save: 'Save',
  check: 'Checkmark',
  tick: 'Checkmark',
  plus: 'Add',
  add: 'Add',
  minus: 'Remove',
  subtract: 'Remove',
  calendar: 'Calendar',
  date: 'Date',
  time: 'Time',
  clock: 'Clock',
  location: 'Location',
  map: 'Map',
  pin: 'Pin',
  link: 'Link',
  external: 'External link',
  attach: 'Attach',
  paperclip: 'Attach',
  image: 'Image',
  photo: 'Photo',
  camera: 'Camera',
  video: 'Video',
  file: 'File',
  document: 'Document',
  folder: 'Folder',
  trash: 'Delete',
  bin: 'Delete',
  undo: 'Undo',
  redo: 'Redo',
  prev: 'Previous',
  previous: 'Previous',
  next: 'Next',
  forward: 'Forward',
  back: 'Back',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  logout: 'Log out',
  signout: 'Sign out',
  login: 'Log in',
  signin: 'Sign in',
  signup: 'Sign up',
  register: 'Register',
};

/** Landmark detection heuristics — tag patterns to ARIA role mapping */
export const LANDMARK_TAG_MAP = {
  header: 'banner',
  nav: 'navigation',
  main: 'main',
  footer: 'contentinfo',
  aside: 'complementary',
  form: 'form',
  section: 'region',
};

/** Maximum conversation history entries to keep */
export const MAX_CONVERSATION_HISTORY = 10;

/** Debounce interval for MutationObserver announcements (ms) */
export const MUTATION_DEBOUNCE_MS = 800;

/** Minimum DOM changes to trigger an announcement */
export const MUTATION_THRESHOLD = 5;

/** Message types for chrome.runtime messaging */
export const MESSAGE_TYPES = {
  TIER1_COMPLETE: 'tier1_complete',
  TIER2_COMPLETE: 'tier2_complete',
  TIER3_REQUEST: 'tier3_request',
  TIER3_COMPLETE: 'tier3_complete',
  VOICE_COMMAND: 'voice_command',
  AGENT_RESPONSE: 'agent_response',
  GET_REPAIR_REPORT: 'get_repair_report',
  GET_PAGE_CONTEXT: 'get_page_context',
  GET_ELEMENT_REGISTRY: 'get_element_registry',
  EXECUTE_ACTION: 'execute_action',
  TOGGLE_EXTENSION: 'toggle_extension',
  CAPTURE_SCREENSHOT: 'capture_screenshot',
  API_CALL: 'api_call',
  SPEAK: 'speak',
  STOP_SPEAKING: 'stop_speaking',
};

/** Log levels */
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};
