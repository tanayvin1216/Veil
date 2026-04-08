/**
 * Voice agent intent parsing and action execution.
 * Classifies user speech into actions and executes them.
 * @module agent-logic
 */

import { MESSAGE_TYPES, MAX_CONVERSATION_HISTORY } from '../utils/constants.js';
import { parseIntent } from './api-client.js';

/** @type {ConversationEntry[]} */
let conversationHistory = [];

/** @type {object|null} */
let lastActionTarget = null;

/**
 * Process a voice command from the user.
 * @param {string} transcript - The speech-to-text transcript
 * @param {number} tabId - The active tab ID
 * @returns {Promise<AgentResponse>}
 */
export async function processVoiceCommand(transcript, tabId) {
  const normalized = transcript.toLowerCase().trim();

  const ruleBasedResult = classifyIntentRuleBased(normalized);

  if (ruleBasedResult.confidence > 0.8) {
    const response = await executeIntent(ruleBasedResult, tabId);
    addToHistory(transcript, response.confirmation);
    return response;
  }

  try {
    const llmResult = await classifyIntentWithLLM(transcript, tabId);
    const response = await executeIntent(llmResult, tabId);
    addToHistory(transcript, response.confirmation);
    return response;
  } catch {
    const response = await executeIntent(ruleBasedResult, tabId);
    addToHistory(transcript, response.confirmation);
    return response;
  }
}

/**
 * Rule-based intent classification for common commands.
 * @param {string} text - Normalized transcript
 * @returns {IntentResult}
 */
export function classifyIntentRuleBased(text) {
  if (/^(click|press|tap|select|activate)\s+/i.test(text)) {
    const target = text.replace(/^(click|press|tap|select|activate)\s+/i, '').trim();
    return { intent: 'click', target, confidence: 0.9 };
  }

  if (/^(go to|open|navigate to|visit)\s+/i.test(text)) {
    const target = text.replace(/^(go to|open|navigate to|visit)\s+/i, '').trim();
    if (target.includes('.') || target.includes('http')) {
      return { intent: 'navigate_url', target, confidence: 0.95 };
    }
    return { intent: 'click', target, confidence: 0.85 };
  }

  if (/^(fill|type|enter|input)\s+(.+?)\s+(with|as|to)\s+(.+)$/i.test(text)) {
    const match = text.match(/^(fill|type|enter|input)\s+(.+?)\s+(with|as|to)\s+(.+)$/i);
    return { intent: 'fill', target: match[2], value: match[4], confidence: 0.9 };
  }

  if (/^scroll\s+(down|up)$/i.test(text)) {
    const direction = text.includes('down') ? 'scroll_down' : 'scroll_up';
    return { intent: direction, confidence: 0.95 };
  }

  if (/^(scroll to|go to)\s+(top|bottom)$/i.test(text)) {
    const position = text.includes('top') ? 'scroll_to_top' : 'scroll_to_bottom';
    return { intent: position, confidence: 0.95 };
  }

  if (/^(go back|back|previous page)$/i.test(text)) {
    return { intent: 'go_back', confidence: 0.95 };
  }

  if (/^(go forward|forward|next page)$/i.test(text)) {
    return { intent: 'go_forward', confidence: 0.95 };
  }

  if (/^next\s+(heading|button|link|input|field|form)$/i.test(text)) {
    const match = text.match(/^next\s+(heading|button|link|input|field|form)$/i);
    const type = match[1].toLowerCase();
    const intentMap = { heading: 'next_heading', button: 'next_button', link: 'next_link', input: 'next_input', field: 'next_input', form: 'next_input' };
    return { intent: intentMap[type] || 'next_heading', confidence: 0.95 };
  }

  if (/^(what('?s| is) on this page|describe this page|read (this|the) page|page summary|summarize)$/i.test(text)) {
    return { intent: 'page_summary', confidence: 0.95 };
  }

  if (/^what am i missing|accessibility report|gap report$/i.test(text)) {
    return { intent: 'what_am_i_missing', confidence: 0.95 };
  }

  if (/^(describe this|what('?s| is) this) image$/i.test(text)) {
    return { intent: 'describe_image', confidence: 0.9 };
  }

  if (/^(handle|solve|do) (this|the) captcha$/i.test(text)) {
    return { intent: 'handle_captcha', confidence: 0.9 };
  }

  if (/^(dismiss|close|hide) (this|the) (popup|modal|banner|dialog|overlay)$/i.test(text)) {
    return { intent: 'dismiss_popup', confidence: 0.9 };
  }

  if (/^(what('?s| is) the price|how much|price)$/i.test(text)) {
    return { intent: 'page_question', question: 'What is the price?', confidence: 0.9 };
  }

  if (/^(how many|count|number of)\s+/i.test(text)) {
    return { intent: 'page_question', question: text, confidence: 0.85 };
  }

  if (/^read (the )?(main content|article|body|text)$/i.test(text)) {
    return { intent: 'read_main_content', confidence: 0.9 };
  }

  if (/^(help|what can (i|you) do|commands|options)$/i.test(text)) {
    return { intent: 'help', confidence: 0.95 };
  }

  if (/^settings$/i.test(text)) {
    return { intent: 'open_settings', confidence: 0.95 };
  }

  if (/^(stop|quiet|shut up|silence|cancel)$/i.test(text)) {
    return { intent: 'stop_speaking', confidence: 0.95 };
  }

  return { intent: 'unknown', rawText: text, confidence: 0.3 };
}

/**
 * Classify intent using LLM for complex or ambiguous commands.
 * @param {string} transcript
 * @param {number} tabId
 * @returns {Promise<IntentResult>}
 */
async function classifyIntentWithLLM(transcript, tabId) {
  const pageContext = await getPageContext(tabId);
  const historyContext = conversationHistory
    .slice(-5)
    .map(e => `User: ${e.userText}\nAgent: ${e.agentResponse}`)
    .join('\n');

  const systemPrompt = `You are an accessibility voice agent intent classifier.
Given a user's spoken command and page context, determine the intent.

Respond ONLY with a JSON object:
{
  "intent": "<one of: click, fill, scroll_down, scroll_up, go_back, go_forward, navigate_url, next_heading, next_button, next_link, next_input, page_summary, what_am_i_missing, page_question, describe_image, handle_captcha, dismiss_popup, read_main_content, help, stop_speaking, unknown>",
  "target": "<element description or null>",
  "value": "<fill value or null>",
  "question": "<question text or null>",
  "confidence": <0-1>
}`;

  const userMessage = `User said: "${transcript}"

Page: ${pageContext?.title || 'Unknown'} (${pageContext?.url || ''})
Recent conversation:
${historyContext || 'None'}`;

  const response = await parseIntent(systemPrompt, userMessage);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }

  return { intent: 'unknown', rawText: transcript, confidence: 0.3 };
}

/**
 * Execute a classified intent.
 * @param {IntentResult} intent
 * @param {number} tabId
 * @returns {Promise<AgentResponse>}
 */
async function executeIntent(intent, tabId) {
  switch (intent.intent) {
    case 'click': {
      const matches = await fuzzyMatchInTab(tabId, intent.target);
      if (matches.length === 0) {
        return {
          confirmation: `I couldn't find "${intent.target}" on this page.`,
          action: null,
        };
      }
      if (matches.length === 1 || matches[0].confidence > 0.8) {
        const target = matches[0].element;
        lastActionTarget = target;
        await executeActionInTab(tabId, { action: 'click', target: target.id });
        return {
          confirmation: `Clicking ${target.ariaLabel || target.visibleText || target.tag}.`,
          action: { action: 'click', target: target.id },
        };
      }
      const descriptions = matches.slice(0, 3).map((m, i) =>
        `${i + 1}. "${m.element.ariaLabel || m.element.visibleText}" near "${m.element.nearbyText?.substring(0, 40)}"`
      );
      return {
        confirmation: `I found ${matches.length} matches for "${intent.target}". ${descriptions.join('. ')}. Which one?`,
        action: null,
        disambiguation: matches.slice(0, 3),
      };
    }

    case 'fill': {
      const matches = await fuzzyMatchInTab(tabId, intent.target);
      if (matches.length === 0) {
        return { confirmation: `I couldn't find the field "${intent.target}".`, action: null };
      }
      const target = matches[0].element;
      await executeActionInTab(tabId, { action: 'fill', target: target.id, value: intent.value });
      return {
        confirmation: `Filled "${target.ariaLabel || target.visibleText}" with "${intent.value}".`,
        action: { action: 'fill', target: target.id, value: intent.value },
      };
    }

    case 'scroll_down':
    case 'scroll_up':
    case 'scroll_to_top':
    case 'scroll_to_bottom':
    case 'go_back':
    case 'go_forward':
      await executeActionInTab(tabId, { action: intent.intent });
      return { confirmation: formatActionConfirmation(intent.intent), action: { action: intent.intent } };

    case 'next_heading':
    case 'next_button':
    case 'next_link':
    case 'next_input': {
      const result = await executeActionInTab(tabId, { action: intent.intent });
      return {
        confirmation: result?.message || `Moving to next ${intent.intent.replace('next_', '')}.`,
        action: { action: intent.intent },
      };
    }

    case 'navigate_url': {
      let url = intent.target;
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }
      await chrome.tabs.update(tabId, { url });
      return { confirmation: `Navigating to ${intent.target}.`, action: { action: 'navigate', url } };
    }

    case 'page_summary':
      return { confirmation: 'Getting page summary...', action: { action: 'page_summary' }, followUp: 'speak_summary' };

    case 'what_am_i_missing': {
      const result = await sendMessageToTab(tabId, { type: 'what_am_i_missing' });
      return { confirmation: result?.data || 'Unable to generate report.', action: null };
    }

    case 'read_main_content': {
      const context = await getPageContext(tabId);
      return {
        confirmation: `Reading main content of ${context?.title || 'this page'}.`,
        action: { action: 'read_main_content' },
        followUp: 'read_content',
      };
    }

    case 'help':
      return {
        confirmation: getHelpText(),
        action: null,
      };

    case 'stop_speaking':
      return { confirmation: '', action: { action: 'stop_speaking' }, silent: true };

    case 'open_settings':
      await chrome.runtime.openOptionsPage();
      return { confirmation: 'Opening settings.', action: null };

    case 'dismiss_popup': {
      await executeActionInTab(tabId, { action: 'click', target: 'dismiss-modal' });
      return { confirmation: 'Attempting to dismiss the popup.', action: null };
    }

    default:
      return {
        confirmation: `I'm not sure what you mean by "${intent.rawText || ''}". Say "help" for available commands.`,
        action: null,
      };
  }
}

/**
 * Format a simple action confirmation.
 * @param {string} action
 * @returns {string}
 */
function formatActionConfirmation(action) {
  const map = {
    scroll_down: 'Scrolling down.',
    scroll_up: 'Scrolling up.',
    scroll_to_top: 'Scrolled to top.',
    scroll_to_bottom: 'Scrolled to bottom.',
    go_back: 'Going back.',
    go_forward: 'Going forward.',
  };
  return map[action] || `Executed ${action}.`;
}

/**
 * Get help text listing available commands.
 * @returns {string}
 */
function getHelpText() {
  return [
    'Here are some things you can say:',
    'Click [element name] — click a button, link, or control.',
    'Fill [field name] with [value] — type into a form field.',
    'Scroll down or scroll up — move through the page.',
    'Next heading, next button, next link — jump between elements.',
    'What\'s on this page — hear a page summary.',
    'What am I missing — accessibility gap report.',
    'Describe this image — get image description.',
    'Dismiss this popup — close modals and banners.',
    'Go back or go forward — browser navigation.',
    'Go to [URL] — navigate to a website.',
    'Stop — stop speaking.',
    'Settings — open extension settings.',
  ].join(' ');
}

/**
 * Add an exchange to conversation history.
 * @param {string} userText
 * @param {string} agentResponse
 */
function addToHistory(userText, agentResponse) {
  conversationHistory.push({
    userText,
    agentResponse,
    timestamp: Date.now(),
  });

  if (conversationHistory.length > MAX_CONVERSATION_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
  }
}

/**
 * Send a message to the content script in a tab.
 * @param {number} tabId
 * @param {object} message
 * @returns {Promise<object>}
 */
async function sendMessageToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Execute a DOM action in a tab.
 * @param {number} tabId
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function executeActionInTab(tabId, payload) {
  return sendMessageToTab(tabId, {
    type: MESSAGE_TYPES.EXECUTE_ACTION,
    payload,
  });
}

/**
 * Fuzzy match a query in a tab's element registry.
 * @param {number} tabId
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function fuzzyMatchInTab(tabId, query) {
  const result = await sendMessageToTab(tabId, {
    type: 'fuzzy_match',
    payload: { query, maxResults: 5 },
  });
  return result?.data || [];
}

/**
 * Get page context from a tab.
 * @param {number} tabId
 * @returns {Promise<object>}
 */
async function getPageContext(tabId) {
  try {
    const result = await sendMessageToTab(tabId, {
      type: MESSAGE_TYPES.GET_PAGE_CONTEXT,
    });
    return result?.data || null;
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} IntentResult
 * @property {string} intent
 * @property {string} [target]
 * @property {string} [value]
 * @property {string} [question]
 * @property {string} [rawText]
 * @property {number} confidence
 */

/**
 * @typedef {Object} AgentResponse
 * @property {string} confirmation - Spoken response
 * @property {object|null} action - Action to execute
 * @property {string} [followUp] - Follow-up action
 * @property {boolean} [silent] - Don't speak the confirmation
 * @property {Array} [disambiguation] - Multiple matches
 */

/**
 * @typedef {Object} ConversationEntry
 * @property {string} userText
 * @property {string} agentResponse
 * @property {number} timestamp
 */
