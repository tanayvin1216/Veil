/**
 * Scrapes the page structure for LLM-powered navigation.
 * Extracts links, headings, and content sections so the LLM can
 * understand what's on the page and decide where to navigate.
 * @module page-scraper
 */

/**
 * Extract the full navigable structure of the page.
 * Sent to the LLM so it can answer questions and find content.
 * @param {Document} doc
 * @returns {PageStructure}
 */
export function scrapePageStructure(doc) {
  return {
    url: window.location.href,
    title: doc.title || '',
    links: scrapeLinks(doc),
    headings: scrapeHeadings(doc),
    sections: scrapeSections(doc),
    navItems: scrapeNavigation(doc),
  };
}

/**
 * Scrape all meaningful links on the page.
 * @param {Document} doc
 * @returns {Array<{text: string, href: string, context: string}>}
 */
function scrapeLinks(doc) {
  const links = [];
  const seen = new Set();

  for (const a of doc.querySelectorAll('a[href]')) {
    const text = a.textContent?.trim();
    const href = a.href;

    if (!text || text.length < 2 || text.length > 100) continue;
    if (!href || href.startsWith('javascript:') || href === '#') continue;
    if (seen.has(href)) continue;
    seen.add(href);

    // Get nearby context
    const parent = a.closest('li, p, div, td');
    const context = parent ? parent.textContent?.trim().substring(0, 120) : '';

    links.push({ text, href, context });

    if (links.length >= 80) break;
  }

  return links;
}

/**
 * Scrape all headings with their content.
 * @param {Document} doc
 * @returns {Array<{level: number, text: string, content: string}>}
 */
function scrapeHeadings(doc) {
  const headings = [];

  for (const h of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const text = h.textContent?.trim();
    if (!text || text.length < 2) continue;

    // Get the content after this heading until the next heading
    const content = getContentAfterHeading(h);

    headings.push({
      level: parseInt(h.tagName.charAt(1), 10),
      text,
      content: content.substring(0, 300),
    });

    if (headings.length >= 30) break;
  }

  return headings;
}

/**
 * Get text content between this heading and the next one.
 * @param {HTMLElement} heading
 * @returns {string}
 */
function getContentAfterHeading(heading) {
  const parts = [];
  let node = heading.nextElementSibling;
  let charCount = 0;

  while (node && charCount < 300) {
    if (/^H[1-6]$/i.test(node.tagName)) break;

    const text = node.textContent?.trim();
    if (text && text.length > 10) {
      parts.push(text);
      charCount += text.length;
    }

    node = node.nextElementSibling;
  }

  return parts.join(' ').substring(0, 300);
}

/**
 * Scrape main content sections.
 * @param {Document} doc
 * @returns {Array<{heading: string, text: string}>}
 */
function scrapeSections(doc) {
  const sections = [];
  const containers = doc.querySelectorAll('section, article, [role="region"], .section');

  for (const section of containers) {
    const heading = section.querySelector('h1, h2, h3, h4');
    const headingText = heading?.textContent?.trim() || '';
    const text = section.textContent?.trim().substring(0, 400) || '';

    if (text.length > 20) {
      sections.push({ heading: headingText, text });
    }

    if (sections.length >= 15) break;
  }

  return sections;
}

/**
 * Scrape navigation menus.
 * @param {Document} doc
 * @returns {Array<{text: string, href: string}>}
 */
function scrapeNavigation(doc) {
  const navItems = [];
  const navs = doc.querySelectorAll('nav, [role="navigation"]');

  for (const nav of navs) {
    for (const link of nav.querySelectorAll('a[href]')) {
      const text = link.textContent?.trim();
      if (text && text.length > 1 && text.length < 50) {
        navItems.push({ text, href: link.href });
      }
      if (navItems.length >= 30) break;
    }
  }

  return navItems;
}

/**
 * @typedef {Object} PageStructure
 * @property {string} url
 * @property {string} title
 * @property {Array} links
 * @property {Array} headings
 * @property {Array} sections
 * @property {Array} navItems
 */
