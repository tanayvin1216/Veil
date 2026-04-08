/**
 * Intent classification module — re-exports the rule-based classifier
 * from agent-logic for use in content scripts (without background dependency).
 * Content scripts use this for local quick classification before falling
 * back to the service worker for LLM-powered classification.
 * @module intent-classifier
 */

/** Hoisted to module scope — avoids re-creating on every call */
const INTENT_PATTERNS = [
  { regex: /^(click|press|tap|select|activate)\s+(.+)$/i, intent: 'click', targetGroup: 2 },
  { regex: /^(go to|open|navigate to|visit)\s+(.+)$/i, intent: 'navigate', targetGroup: 2 },
  { regex: /^scroll\s+(down|up)(\s|$)/i, intent: 'scroll', targetGroup: 1 },
  { regex: /^(scroll to|go to)\s+(top|bottom)$/i, intent: 'scroll_position', targetGroup: 2 },
  { regex: /^(go back|back|previous page)$/i, intent: 'go_back' },
  { regex: /^(go forward|forward)$/i, intent: 'go_forward' },
  { regex: /^next\s+(heading|button|link|input|field)$/i, intent: 'next_element', targetGroup: 1 },
  { regex: /^(what('?s| is) on this page|describe( this page)?|summarize( this page)?|page summary)$/i, intent: 'page_summary' },
  { regex: /^what am i missing$/i, intent: 'what_am_i_missing' },
  { regex: /^(help|what can i do|commands)$/i, intent: 'help' },
  { regex: /^(stop|quiet|cancel|shut up|silence)$/i, intent: 'stop_speaking' },
  { regex: /^settings$/i, intent: 'open_settings' },
  { regex: /^(dismiss|close|hide)\s+(this|the)\s+(popup|modal|banner|dialog|overlay)$/i, intent: 'dismiss_popup' },
  { regex: /^read\s+(the\s+)?(main content|article|body|text)$/i, intent: 'read_main_content' },
];

/**
 * Classify a voice command using rule-based patterns.
 * This is a lightweight copy for content-script use — the authoritative
 * classifier lives in background/agent-logic.js.
 * @param {string} text - Normalized transcript text
 * @returns {IntentResult}
 */
export function classifyIntent(text) {
  const normalized = text.toLowerCase().trim();

  for (const pattern of INTENT_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match) {
      return {
        intent: pattern.intent,
        target: pattern.targetGroup ? match[pattern.targetGroup] : null,
        confidence: 0.9,
        isLocal: true,
      };
    }
  }

  return { intent: 'unknown', target: null, confidence: 0.2, isLocal: true };
}

/**
 * Check if a classification is confident enough to act on locally.
 * @param {IntentResult} result
 * @returns {boolean}
 */
export function isConfident(result) {
  return result.confidence >= 0.8;
}

/**
 * @typedef {Object} IntentResult
 * @property {string} intent
 * @property {string|null} target
 * @property {number} confidence
 * @property {boolean} isLocal
 */
