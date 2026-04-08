/**
 * Intelligent page content analyzer.
 * Extracts what a page is ABOUT and builds a natural, conversational summary.
 * Thinks like a kind friend describing a webpage to a blind person.
 * @module page-analyzer
 */

/**
 * Analyze the current page and build a conversational summary.
 * @param {Document} doc
 * @returns {string} Natural language summary (3-6 sentences)
 */
export function analyzePage(doc) {
  const pageType = detectPageType(doc);
  const headline = getMainHeadline(doc);
  const description = getPageDescription(doc);
  const sections = getSectionTopics(doc);
  const keyFacts = extractKeyFacts(doc);
  const forms = describeForms(doc);
  const alerts = describeAlerts(doc);
  const images = describeImages(doc);

  return buildConversationalSummary({
    pageType,
    headline,
    description,
    sections,
    keyFacts,
    forms,
    alerts,
    images,
    title: doc.title || '',
    url: window.location.hostname,
  });
}

/**
 * Detect what kind of page this is.
 * @param {Document} doc
 * @returns {string}
 */
function detectPageType(doc) {
  const url = window.location.href.toLowerCase();
  const body = doc.body?.textContent?.toLowerCase() || '';
  const hasArticle = !!doc.querySelector('article');
  const hasProduct = !!doc.querySelector('[itemtype*="Product"], .product, .pdp, [data-product]');
  const hasVideo = !!doc.querySelector('video, [class*="video-player"], iframe[src*="youtube"], iframe[src*="vimeo"]');
  const formCount = doc.querySelectorAll('form').length;
  const hasSearch = !!doc.querySelector('input[type="search"], [role="search"], input[placeholder*="search" i]');
  const hasLogin = !!doc.querySelector('input[type="password"]');
  const hasList = doc.querySelectorAll('ul li, ol li').length > 10;

  if (hasLogin && formCount > 0) return 'login page';
  if (hasProduct) return 'product page';
  if (hasVideo) return 'video page';
  if (hasArticle && body.length > 3000) return 'article';
  if (url.includes('/search') || url.includes('?q=') || url.includes('?query=')) return 'search results page';
  if (formCount > 0 && doc.querySelectorAll('input, textarea, select').length > 3) return 'form page';
  if (hasList && hasSearch) return 'listing page';
  if (url === '/' || url.endsWith('.com/') || url.endsWith('.org/')) return 'homepage';
  if (body.length < 500) return 'mostly empty page';

  return 'webpage';
}

/**
 * Get the main headline of the page.
 * @param {Document} doc
 * @returns {string}
 */
function getMainHeadline(doc) {
  const h1 = doc.querySelector('h1');
  if (h1?.textContent?.trim()) {
    return h1.textContent.trim().substring(0, 150);
  }

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.content?.trim();
  if (ogTitle) return ogTitle;

  return '';
}

/**
 * Get the page's meta description or first meaningful paragraph.
 * @param {Document} doc
 * @returns {string}
 */
function getPageDescription(doc) {
  const meta = doc.querySelector('meta[name="description"]')?.content?.trim();
  if (meta && meta.length > 20) return meta.substring(0, 200);

  const ogDesc = doc.querySelector('meta[property="og:description"]')?.content?.trim();
  if (ogDesc && ogDesc.length > 20) return ogDesc.substring(0, 200);

  // First real paragraph from main content
  const main = doc.querySelector('main, article, [role="main"], #content');
  const root = main || doc.body;
  const paragraphs = root.querySelectorAll('p');
  for (const p of paragraphs) {
    const text = p.textContent?.trim();
    if (text && text.length > 40 && text.length < 400) {
      return text.substring(0, 200);
    }
  }

  return '';
}

/**
 * Get section topics from h2 headings.
 * @param {Document} doc
 * @returns {string[]}
 */
function getSectionTopics(doc) {
  return Array.from(doc.querySelectorAll('h2'))
    .map(h => h.textContent?.trim())
    .filter(t => t && t.length > 2 && t.length < 80)
    .slice(0, 6);
}

/**
 * Extract key facts: prices, dates, numbers, important data.
 * @param {Document} doc
 * @returns {string[]}
 */
function extractKeyFacts(doc) {
  const facts = [];

  // Prices
  const priceEl = doc.querySelector('[class*="price"], [itemprop="price"], .cost, .amount');
  if (priceEl?.textContent?.trim()) {
    const priceText = priceEl.textContent.trim();
    if (priceText.length < 30) facts.push(`Price: ${priceText}`);
  }

  // Dates
  const timeEl = doc.querySelector('time[datetime], [class*="date"], [class*="published"]');
  if (timeEl?.textContent?.trim()) {
    const dateText = timeEl.textContent.trim();
    if (dateText.length < 40) facts.push(dateText);
  }

  // Author
  const authorEl = doc.querySelector('[class*="author"], [rel="author"], [itemprop="author"]');
  if (authorEl?.textContent?.trim()) {
    const authorText = authorEl.textContent.trim();
    if (authorText.length < 50) facts.push(`By ${authorText}`);
  }

  return facts.slice(0, 3);
}

/**
 * Describe any forms on the page.
 * @param {Document} doc
 * @returns {string}
 */
function describeForms(doc) {
  const forms = doc.querySelectorAll('form');
  if (forms.length === 0) return '';

  const inputs = doc.querySelectorAll('input:not([type="hidden"]), textarea, select');
  const hasPassword = !!doc.querySelector('input[type="password"]');
  const hasSearch = !!doc.querySelector('input[type="search"], input[placeholder*="search" i]');
  const hasEmail = !!doc.querySelector('input[type="email"]');

  if (hasSearch && inputs.length <= 2) return 'There\'s a search bar.';
  if (hasPassword && hasEmail) return 'There\'s a login form asking for email and password.';
  if (hasPassword) return 'There\'s a login form.';
  if (inputs.length <= 3) return `There's a short form with ${inputs.length} fields.`;

  return `There's a form with ${inputs.length} fields.`;
}

/**
 * Describe any alerts, banners, or popups.
 * @param {Document} doc
 * @returns {string}
 */
function describeAlerts(doc) {
  const alerts = doc.querySelectorAll('[role="alert"], [role="alertdialog"], .alert, .notification, .banner');
  for (const alert of alerts) {
    const text = alert.textContent?.trim();
    if (text && text.length > 5 && text.length < 150) {
      return `There's a notice: ${text}`;
    }
  }
  return '';
}

/**
 * Briefly describe notable images.
 * @param {Document} doc
 * @returns {string}
 */
function describeImages(doc) {
  const images = doc.querySelectorAll('img[alt]:not([alt=""])');
  const described = [];
  for (const img of images) {
    const alt = img.alt?.trim();
    if (alt && alt.length > 5 && alt.length < 100 && alt !== 'Image (no description available)') {
      described.push(alt);
    }
    if (described.length >= 2) break;
  }

  const noAlt = doc.querySelectorAll('img:not([alt]), img[alt=""]').length;

  let result = '';
  if (described.length > 0) {
    result = `There are images showing ${described.join(' and ')}.`;
  }
  if (noAlt > 0) {
    result += ` ${noAlt} images have no description.`;
  }
  return result;
}

/**
 * Build the final conversational summary.
 * Sounds like a kind friend, not a robot.
 * @param {object} data - All extracted page data
 * @returns {string}
 */
function buildConversationalSummary(data) {
  const parts = [];

  // Opening — what page and what type
  if (data.pageType === 'homepage') {
    parts.push(`You're on the ${data.url} homepage.`);
  } else if (data.pageType === 'article') {
    parts.push(`This is an article on ${data.url}.`);
  } else if (data.pageType === 'product page') {
    parts.push(`This is a product page on ${data.url}.`);
  } else if (data.pageType === 'login page') {
    parts.push(`This is a login page on ${data.url}.`);
  } else if (data.pageType === 'search results page') {
    parts.push(`These are search results on ${data.url}.`);
  } else {
    parts.push(`You're on ${data.url}.`);
  }

  // Headline — what is it about
  if (data.headline) {
    parts.push(data.headline + '.');
  }

  // Description — one more sentence of context
  if (data.description && data.description !== data.headline) {
    parts.push(data.description);
  }

  // Key facts
  if (data.keyFacts.length > 0) {
    parts.push(data.keyFacts.join('. ') + '.');
  }

  // Sections — only if there are a few
  if (data.sections.length >= 2) {
    parts.push(`Main sections include ${data.sections.slice(0, 4).join(', ')}.`);
  }

  // Forms
  if (data.forms) {
    parts.push(data.forms);
  }

  // Alerts
  if (data.alerts) {
    parts.push(data.alerts);
  }

  // Keep it under ~6 sentences
  return parts.slice(0, 6).join(' ');
}
