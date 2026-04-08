/**
 * Voice agent intent parsing and action execution.
 * Classifies user speech into actions and executes them.
 * @module agent-logic
 */

import { MESSAGE_TYPES, MAX_CONVERSATION_HISTORY } from '../utils/constants.js';
import { parseIntent } from './api-client.js';

/** @type {ConversationEntry[]} */
let conversationHistory = [];


/**
 * Process a voice command from the user.
 * @param {string} transcript - The speech-to-text transcript
 * @param {number} tabId - The active tab ID
 * @returns {Promise<AgentResponse>}
 */
export async function processVoiceCommand(transcript, tabId) {
  if (!transcript?.trim()) {
    return { confirmation: "I didn't hear anything. Try again.", action: null };
  }

  if (!tabId) {
    return { confirmation: 'No active tab found.', action: null };
  }

  const normalized = transcript.toLowerCase().trim();

  const ruleBasedResult = classifyIntentRuleBased(normalized);

  if (ruleBasedResult.confidence > 0.8) {
    const response = await executeIntent(ruleBasedResult, tabId);
    addToHistory(transcript, response.confirmation);
    return response;
  }

  // For anything the rules can't handle, use the LLM with full page context
  try {
    const response = await handleWithLLM(transcript, tabId);
    addToHistory(transcript, response.confirmation);
    return response;
  } catch (err) {
    console.error('[AccessAgent] LLM fallback failed:', err.message);
    // Last resort — try rule-based even with low confidence
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

  if (/^(take me to|bring me to|go to section|read the section|read section)\s+/i.test(text)) {
    const target = text.replace(/^(take me to|bring me to|go to section|read the section|read section)\s+/i, '').trim();
    return { intent: 'scroll_to_section', target, confidence: 0.95 };
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
 * Handle a user query using the LLM with full page structure.
 * The LLM sees all links, headings, and content on the page
 * and decides what action to take.
 * @param {string} transcript
 * @param {number} tabId
 * @returns {Promise<AgentResponse>}
 */
async function handleWithLLM(transcript, tabId) {
  console.info('[AccessAgent] Handling with LLM/search:', transcript);

  // Get the full page structure
  const pageStructure = await sendMessageToTab(tabId, { type: 'get_page_structure' });
  const structure = pageStructure?.data;

  if (!structure) {
    return { confirmation: 'I could not read this page.', action: null };
  }

  // Build a compact page map for the LLM
  const pageMap = buildPageMap(structure);

  const systemPrompt = `You are a voice navigation assistant for a blind user browsing the web.
The user asks you something about the current webpage. You have access to the page's full structure: all links, headings, and content sections.

Your job:
1. If the user says "take me to [section]" or asks about a section ON this page, scroll to that section and read it.
2. If the user asks about a topic that has a LINK to another page, navigate to that link.
3. If the user asks a question that can be answered from visible content, answer it directly.

Respond with ONLY a JSON object:
{
  "action": "scroll_to_section" | "navigate" | "answer" | "not_found",
  "section_query": "<heading text to scroll to, or null>",
  "url": "<full URL to navigate to, or null>",
  "answer": "<direct answer to speak to the user, or null>",
  "link_text": "<text of the link or section>"
}

Rules:
- Use "scroll_to_section" when the content is ON the current page (same-page section, heading, anchor).
- Use "navigate" only when clicking a link to a DIFFERENT page. Include the full URL from the page structure.
- Do NOT make up URLs. Only use URLs from the provided page structure.
- If answering, keep it under 3 sentences. Be conversational and warm.
- If the user says "take me there" or "go to that section", use scroll_to_section with the section name from context.`;

  const userMessage = `User said: "${transcript}"

Current page: ${structure.title} (${structure.url})

${pageMap}`;

  try {
    const llmResponse = await parseIntent(systemPrompt, userMessage);
    return parseLLMNavigationResponse(llmResponse, tabId);
  } catch (err) {
    // No API key or API error — try simple text matching as fallback
    return simpleTextMatch(transcript, structure, tabId);
  }
}

/**
 * Build a compact text representation of the page for the LLM.
 * @param {object} structure
 * @returns {string}
 */
function buildPageMap(structure) {
  const parts = [];

  if (structure.navItems?.length > 0) {
    parts.push('NAVIGATION MENU:');
    for (const item of structure.navItems) {
      parts.push(`- "${item.text}" → ${item.href}`);
    }
  }

  if (structure.headings?.length > 0) {
    parts.push('\nPAGE SECTIONS:');
    for (const h of structure.headings) {
      const preview = h.content ? `: ${h.content.substring(0, 100)}` : '';
      parts.push(`- ${'#'.repeat(h.level)} ${h.text}${preview}`);
    }
  }

  if (structure.links?.length > 0) {
    parts.push('\nLINKS ON PAGE:');
    for (const link of structure.links.slice(0, 50)) {
      const ctx = link.context && link.context !== link.text
        ? ` (near: ${link.context.substring(0, 60)})`
        : '';
      parts.push(`- "${link.text}" → ${link.href}${ctx}`);
    }
  }

  return parts.join('\n');
}

/**
 * Parse the LLM's navigation response.
 * @param {string} text
 * @param {number} tabId
 * @returns {Promise<AgentResponse>}
 */
async function parseLLMNavigationResponse(text, tabId) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { confirmation: text.substring(0, 300), action: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Scroll to a section on the current page and read it
    if (parsed.action === 'scroll_to_section' && parsed.section_query) {
      const result = await sendMessageToTab(tabId, {
        type: 'scroll_to_section',
        payload: { query: parsed.section_query },
      });
      if (result?.success && result.data) {
        return { confirmation: result.data, action: null };
      }
      return {
        confirmation: `I couldn't find the section "${parsed.section_query}" on this page.`,
        action: null,
      };
    }

    // Navigate to a different page
    if (parsed.action === 'navigate' && parsed.url) {
      await chrome.tabs.update(tabId, { url: parsed.url });
      const linkDesc = parsed.link_text || 'that page';
      return {
        confirmation: `Navigating to ${linkDesc}. I'll tell you what's on the page when it loads.`,
        action: { action: 'navigate', url: parsed.url },
      };
    }

    // Direct answer from page content
    if (parsed.action === 'answer' && parsed.answer) {
      return { confirmation: parsed.answer, action: null };
    }

    return {
      confirmation: 'I couldn\'t find anything about that on this page. Try asking differently.',
      action: null,
    };
  } catch {
    return {
      confirmation: text.substring(0, 300) || 'I couldn\'t understand the response. Try again.',
      action: null,
    };
  }
}

/**
 * Simple text matching fallback when no API key is available.
 * Searches links and headings for the user's query terms.
 * @param {string} query
 * @param {object} structure
 * @param {number} tabId
 * @returns {Promise<AgentResponse>}
 */
/** Common words to ignore when searching */
const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on',
  'and', 'or', 'is', 'are', 'was', 'were', 'what', 'where', 'how', 'when',
  'who', 'which', 'that', 'this', 'with', 'from', 'can', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'have', 'has', 'had', 'be', 'been',
  'go', 'get', 'find', 'show', 'take', 'give', 'make', 'know', 'think',
  'want', 'need', 'like', 'see', 'look', 'read', 'open', 'i', 'my', 'it',
  'some', 'any', 'more', 'there', 'here', 'their', 'please', 'just',
]);

/**
 * Simple text matching fallback when no API key is available.
 * Strips stop words, then searches links, nav, and headings.
 * @param {string} query
 * @param {object} structure
 * @param {number} tabId
 * @returns {Promise<AgentResponse>}
 */
async function simpleTextMatch(query, structure, tabId) {
  // Extract only meaningful keywords
  const keywords = query.toLowerCase().split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  console.info('[AccessAgent] Text match keywords:', keywords);

  if (keywords.length === 0) {
    return {
      confirmation: `I'm not sure what to look for. Try being more specific, like "admissions" or "contact".`,
      action: null,
    };
  }

  // Search nav items FIRST — most likely what the user wants
  for (const item of structure.navItems || []) {
    const navText = item.text.toLowerCase();
    if (keywords.some(k => navText.includes(k))) {
      await chrome.tabs.update(tabId, { url: item.href });
      return {
        confirmation: `Found "${item.text}" in the navigation. Taking you there now. I'll tell you what's on the page when it loads.`,
        action: { action: 'navigate', url: item.href },
      };
    }
  }

  // Search all links
  for (const link of structure.links || []) {
    const linkText = (link.text + ' ' + (link.context || '')).toLowerCase();
    if (keywords.some(k => linkText.includes(k))) {
      await chrome.tabs.update(tabId, { url: link.href });
      return {
        confirmation: `Found "${link.text}". Taking you there now. I'll tell you what's on the page when it loads.`,
        action: { action: 'navigate', url: link.href },
      };
    }
  }

  // Search headings — scroll to the section and read content under it
  for (const heading of structure.headings || []) {
    const text = (heading.text + ' ' + (heading.content || '')).toLowerCase();
    if (keywords.some(k => text.includes(k))) {
      // Scroll to the section and read content underneath
      const scrollResult = await sendMessageToTab(tabId, {
        type: 'scroll_to_section',
        payload: { query: heading.text },
      });
      if (scrollResult?.success && scrollResult.data) {
        return { confirmation: scrollResult.data, action: null };
      }
      return {
        confirmation: `I found a section called "${heading.text}". ${heading.content?.substring(0, 200) || ''}`,
        action: null,
      };
    }
  }

  return {
    confirmation: `I couldn't find anything about "${keywords.join(' ')}" on this page. Try different words.`,
    action: null,
  };
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
  try {
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
        // Store for disambiguation follow-up (future feature)
        await executeActionInTab(tabId, { action: 'click', target: target.id });
        const desc = target.ariaLabel || target.visibleText || target.tag;
        return {
          confirmation: `Clicking ${desc}. If this opens a new page, I'll tell you what's there.`,
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
      // Validate URL scheme — only allow http/https
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { confirmation: `I can only navigate to web URLs, not ${parsed.protocol} addresses.`, action: null };
        }
      } catch {
        return { confirmation: `"${intent.target}" doesn't look like a valid web address.`, action: null };
      }
      await chrome.tabs.update(tabId, { url });
      return { confirmation: `Navigating to ${intent.target}. I'll tell you what's on the page when it loads.`, action: { action: 'navigate', url } };
    }

    case 'scroll_to_section': {
      const scrollResult = await sendMessageToTab(tabId, {
        type: 'scroll_to_section',
        payload: { query: intent.target },
      });
      if (scrollResult?.success && scrollResult.data) {
        return { confirmation: scrollResult.data, action: null };
      }
      return {
        confirmation: `I couldn't find a section called "${intent.target}" on this page.`,
        action: null,
      };
    }

    case 'page_summary': {
      const summaryResult = await sendMessageToTab(tabId, { type: 'get_page_summary' });
      return { confirmation: summaryResult?.data || 'I could not read this page.', action: null };
    }

    case 'what_am_i_missing': {
      const result = await sendMessageToTab(tabId, { type: 'what_am_i_missing' });
      return { confirmation: result?.data || 'Unable to generate report.', action: null };
    }

    case 'read_main_content': {
      const summaryResult = await sendMessageToTab(tabId, { type: 'get_page_summary' });
      return { confirmation: summaryResult?.data || 'I could not read this page.', action: null };
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
  } catch (err) {
    console.error('[AccessAgent] Action failed:', err.message);
    return {
      confirmation: `Sorry, that didn't work. ${err.message || ''}`,
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
