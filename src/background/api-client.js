/**
 * API client for OpenAI and Anthropic vision-language model calls.
 * Handles structured requests and responses for Tier 3 analysis
 * and complex voice agent intent parsing.
 * @module api-client
 */

import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * Send a vision analysis request to the configured API provider.
 * @param {string} screenshotBase64 - Base64 encoded screenshot
 * @param {string} pageContext - Text context about the page
 * @returns {Promise<VisionAnalysisResult>}
 */
export async function analyzeScreenshot(screenshotBase64, pageContext) {
  const { apiKey, provider } = await getApiConfig();

  if (!apiKey) {
    throw new Error('no_api_key');
  }

  const prompt = buildVisionPrompt(pageContext);

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, prompt, screenshotBase64);
  }

  return callOpenAI(apiKey, prompt, screenshotBase64);
}

/**
 * Send a text completion request for complex intent parsing.
 * @param {string} systemPrompt - System instructions
 * @param {string} userMessage - User's spoken text + context
 * @returns {Promise<string>} The model's response text
 */
export async function parseIntent(systemPrompt, userMessage) {
  const { apiKey, provider } = await getApiConfig();

  if (!apiKey) {
    throw new Error('no_api_key');
  }

  if (provider === 'anthropic') {
    return callAnthropicText(apiKey, systemPrompt, userMessage);
  }

  return callOpenAIText(apiKey, systemPrompt, userMessage);
}

/**
 * Get API configuration from storage.
 * @returns {Promise<{apiKey: string|null, provider: string}>}
 */
async function getApiConfig() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.API_PROVIDER,
  ]);

  return {
    apiKey: result[STORAGE_KEYS.API_KEY] || null,
    provider: result[STORAGE_KEYS.API_PROVIDER] || 'openai',
  };
}

/**
 * Call OpenAI GPT-4o with vision.
 * @param {string} apiKey
 * @param {string} prompt
 * @param {string} imageBase64
 * @returns {Promise<VisionAnalysisResult>}
 */
async function callOpenAI(apiKey, prompt, imageBase64) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[Veil] OpenAI API error body:', errorBody);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  return parseVisionResponse(text);
}

/**
 * Call Anthropic Claude with vision.
 * @param {string} apiKey
 * @param {string} prompt
 * @param {string} imageBase64
 * @returns {Promise<VisionAnalysisResult>}
 */
async function callAnthropic(apiKey, prompt, imageBase64) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  return parseVisionResponse(text);
}

/**
 * Call OpenAI for text completion.
 * @param {string} apiKey
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function callOpenAIText(apiKey, systemPrompt, userMessage) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Anthropic for text completion.
 * @param {string} apiKey
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function callAnthropicText(apiKey, systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Build the vision analysis prompt.
 * @param {string} pageContext
 * @returns {string}
 */
function buildVisionPrompt(pageContext) {
  return `You are an accessibility analysis tool. Analyze this screenshot of a web page and provide:

1. LAYOUT SUMMARY: Describe the spatial layout in 2-3 sentences. What type of page is this? What are the main visual sections?

2. VISUAL CONTENT: Describe any visual-only content that has no text alternative:
   - Charts, graphs, infographics
   - Image carousels or galleries
   - Color pickers or visual selectors
   - Drag-and-drop interfaces
   - Any content that relies purely on visual presentation

3. MISSING DESCRIPTIONS: For any images visible in the screenshot that appear to lack alt text, provide a brief description of what they show.

Keep descriptions concise and factual. Focus on information a blind user would need.

Page context:
${pageContext}

Respond in JSON format:
{
  "layoutSummary": "...",
  "visualDescription": "...",
  "missingAlts": ["description 1", "description 2"]
}`;
}

/**
 * Parse the vision model response into structured data.
 * @param {string} text
 * @returns {VisionAnalysisResult}
 */
function parseVisionResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through to manual parsing
  }

  return {
    layoutSummary: text.substring(0, 500),
    visualDescription: '',
    missingAlts: [],
  };
}

/**
 * Vision-enhanced page understanding for navigation.
 * Captures a screenshot and combines it with DOM structure to build
 * a rich model of the page — used when DOM-only matching fails.
 * @param {string} screenshotBase64 - Current viewport screenshot
 * @param {object} pageStructure - DOM-scraped page structure
 * @param {string} userCommand - What the user asked for
 * @returns {Promise<VisionNavResult>}
 */
export async function analyzePageForNavigation(screenshotBase64, pageStructure, userCommand) {
  const { apiKey, provider } = await getApiConfig();
  if (!apiKey) throw new Error('no_api_key');

  const pageMap = [];
  if (pageStructure.navItems?.length > 0) {
    pageMap.push('NAV: ' + pageStructure.navItems.map(n => `${n.text} → ${n.href}`).join(' | '));
  }
  if (pageStructure.links?.length > 0) {
    pageMap.push('LINKS: ' + pageStructure.links.slice(0, 30).map(l => `${l.text} → ${l.href}`).join(' | '));
  }

  const prompt = `You are a navigation assistant for a blind user. The user said: "${userCommand}"

Look at this screenshot and the page structure below. Find what the user is looking for.

PAGE STRUCTURE:
${pageMap.join('\n')}

Respond with ONLY a JSON object:
{
  "found": true/false,
  "action": "navigate" | "scroll" | "answer",
  "url": "<URL to navigate to, from the page structure>",
  "element_description": "<what you found>",
  "spoken_response": "<conversational response to speak to the user>"
}

Rules:
- Only use URLs from the page structure above. Never invent URLs.
- If the user asks about visual content (images, layout), describe what you see.
- Keep spoken_response under 2 sentences.`;

  let text;
  if (provider === 'anthropic') {
    text = await callAnthropicVisionText(apiKey, prompt, screenshotBase64);
  } else {
    text = await callOpenAIVisionText(apiKey, prompt, screenshotBase64);
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fall through */ }

  return { found: false, spoken_response: text.substring(0, 200) };
}

/**
 * OpenAI vision call that returns raw text (not parsed as VisionAnalysisResult).
 */
async function callOpenAIVisionText(apiKey, prompt, imageBase64) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      }],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Anthropic vision call that returns raw text.
 */
async function callAnthropicVisionText(apiKey, prompt, imageBase64) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * @typedef {Object} VisionAnalysisResult
 * @property {string} layoutSummary
 * @property {string} visualDescription
 * @property {string[]} missingAlts
 */

/**
 * @typedef {Object} VisionNavResult
 * @property {boolean} found
 * @property {string} action
 * @property {string} [url]
 * @property {string} [element_description]
 * @property {string} spoken_response
 */
