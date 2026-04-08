/**
 * Tests for Tier 1 instant DOM repair engine.
 * Uses jsdom to create DOM fixtures and verify repair behavior.
 */

// Mock chrome APIs before importing modules
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
  },
};

// Mock performance.now for timing
if (!global.performance) {
  global.performance = { now: jest.fn(() => Date.now()) };
}

// We need to test the pure functions, so we'll import them after mocking
const {
  repairImages,
  repairButtons,
  repairFormLabels,
  repairHeadingHierarchy,
  repairLandmarks,
  repairFocusTraps,
  repairSkipNavigation,
  runTier1Repairs,
} = require('../src/content/tier1-repair.js');

describe('Tier 1 DOM Repair', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // ─── Image Repair ────────────────────────────────────

  describe('repairImages', () => {
    test('adds alt text from title attribute', () => {
      document.body.innerHTML = '<img src="test.jpg" title="A red car">';
      const count = repairImages(document);
      const img = document.querySelector('img');
      expect(img.getAttribute('alt')).toBe('A red car');
      expect(count).toBe(1);
    });

    test('adds alt text from filename', () => {
      document.body.innerHTML = '<img src="/images/blue-mountain-sunset.jpg">';
      const count = repairImages(document);
      const img = document.querySelector('img');
      expect(img.getAttribute('alt')).toContain('Blue mountain sunset');
      expect(count).toBe(1);
    });

    test('adds alt from figcaption', () => {
      document.body.innerHTML = `
        <figure>
          <img src="x.jpg">
          <figcaption>A beautiful landscape</figcaption>
        </figure>
      `;
      const count = repairImages(document);
      expect(document.querySelector('img').getAttribute('alt')).toBe('A beautiful landscape');
      expect(count).toBe(1);
    });

    test('skips images that already have alt text', () => {
      document.body.innerHTML = '<img src="test.jpg" alt="Existing alt">';
      const count = repairImages(document);
      expect(count).toBe(0);
      expect(document.querySelector('img').getAttribute('alt')).toBe('Existing alt');
    });

    test('skips hash-like filenames', () => {
      document.body.innerHTML = '<img src="/img/a1b2c3d4e5f6a1b2c3d4e5f6.png">';
      const count = repairImages(document);
      const alt = document.querySelector('img').getAttribute('alt');
      expect(alt).toBe('Image (no description available)');
    });

    test('handles empty alt attribute', () => {
      document.body.innerHTML = '<img src="/photos/cute-puppy.jpg" alt="">';
      const count = repairImages(document);
      expect(count).toBe(1);
    });

    test('adds alt from parent link text', () => {
      document.body.innerHTML = '<a href="/product">Buy Now <img src="icon.svg"></a>';
      const count = repairImages(document);
      const img = document.querySelector('img');
      expect(img.getAttribute('alt')).toBe('Buy Now');
      expect(count).toBe(1);
    });
  });

  // ─── Button Repair ───────────────────────────────────

  describe('repairButtons', () => {
    test('labels button from icon class', () => {
      document.body.innerHTML = '<button><i class="icon-search"></i></button>';
      const count = repairButtons(document);
      const btn = document.querySelector('button');
      expect(btn.getAttribute('aria-label')).toBe('Search');
      expect(count).toBe(1);
    });

    test('skips button with title attribute (already accessible)', () => {
      document.body.innerHTML = '<button title="Submit form"><span class="icon"></span></button>';
      const count = repairButtons(document);
      // Button with title already has accessible name — no repair needed
      expect(count).toBe(0);
    });

    test('skips buttons with existing text content', () => {
      document.body.innerHTML = '<button>Click me</button>';
      const count = repairButtons(document);
      expect(count).toBe(0);
    });

    test('skips buttons with existing aria-label', () => {
      document.body.innerHTML = '<button aria-label="Close dialog"><span class="x-icon"></span></button>';
      const count = repairButtons(document);
      expect(count).toBe(0);
    });

    test('labels icon button from SVG title', () => {
      document.body.innerHTML = '<button><svg><title>Edit</title></svg></button>';
      const count = repairButtons(document);
      expect(document.querySelector('button').getAttribute('aria-label')).toBe('Edit');
    });

    test('infers label from cart icon class', () => {
      document.body.innerHTML = '<button><i class="fa-shopping-cart"></i></button>';
      const count = repairButtons(document);
      expect(document.querySelector('button').getAttribute('aria-label')).toBe('Shopping cart');
    });
  });

  // ─── Form Label Repair ───────────────────────────────

  describe('repairFormLabels', () => {
    test('adds aria-label from placeholder', () => {
      document.body.innerHTML = '<input type="text" placeholder="Enter your email">';
      const count = repairFormLabels(document);
      expect(document.querySelector('input').getAttribute('aria-label')).toBe('Enter your email');
      expect(count).toBe(1);
    });

    test('adds aria-label from name attribute', () => {
      document.body.innerHTML = '<input type="text" name="first_name">';
      const count = repairFormLabels(document);
      expect(document.querySelector('input').getAttribute('aria-label')).toBe('First name');
    });

    test('skips inputs with associated label', () => {
      document.body.innerHTML = `
        <label for="email-input">Email</label>
        <input type="email" id="email-input">
      `;
      const count = repairFormLabels(document);
      expect(count).toBe(0);
    });

    test('skips inputs with aria-label', () => {
      document.body.innerHTML = '<input type="text" aria-label="Search query">';
      const count = repairFormLabels(document);
      expect(count).toBe(0);
    });

    test('skips hidden inputs', () => {
      document.body.innerHTML = '<input type="hidden" name="csrf_token">';
      const count = repairFormLabels(document);
      expect(count).toBe(0);
    });

    test('labels textarea from placeholder', () => {
      document.body.innerHTML = '<textarea placeholder="Write your message"></textarea>';
      const count = repairFormLabels(document);
      expect(document.querySelector('textarea').getAttribute('aria-label')).toBe('Write your message');
    });
  });

  // ─── Heading Hierarchy ───────────────────────────────

  describe('repairHeadingHierarchy', () => {
    test('fixes skipped heading levels', () => {
      document.body.innerHTML = '<h1>Title</h1><h4>Subsection</h4>';
      const count = repairHeadingHierarchy(document);
      const h4 = document.querySelector('h4');
      expect(h4.getAttribute('role')).toBe('heading');
      expect(h4.getAttribute('aria-level')).toBe('2');
      expect(count).toBe(1);
    });

    test('does not modify valid hierarchy', () => {
      document.body.innerHTML = '<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>';
      const count = repairHeadingHierarchy(document);
      expect(count).toBe(0);
    });

    test('handles missing h1 start', () => {
      document.body.innerHTML = '<h2>Section</h2><h3>Subsection</h3>';
      const count = repairHeadingHierarchy(document);
      // h2 is valid at level 2 (expected=1, actual=2, diff=1, ok)
      expect(count).toBe(0);
    });

    test('fixes multiple skipped levels', () => {
      document.body.innerHTML = '<h1>Title</h1><h6>Deep section</h6>';
      const count = repairHeadingHierarchy(document);
      expect(document.querySelector('h6').getAttribute('aria-level')).toBe('2');
    });

    test('returns 0 for no headings', () => {
      document.body.innerHTML = '<p>Just a paragraph</p>';
      const count = repairHeadingHierarchy(document);
      expect(count).toBe(0);
    });
  });

  // ─── Landmark Repair ─────────────────────────────────

  describe('repairLandmarks', () => {
    test('adds role to header element', () => {
      document.body.innerHTML = '<header>Site header</header>';
      const count = repairLandmarks(document);
      expect(document.querySelector('header').getAttribute('role')).toBe('banner');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('adds role to nav element', () => {
      document.body.innerHTML = '<nav>Navigation</nav>';
      const count = repairLandmarks(document);
      expect(document.querySelector('nav').getAttribute('role')).toBe('navigation');
    });

    test('adds role to main element', () => {
      document.body.innerHTML = '<main>Content</main>';
      const count = repairLandmarks(document);
      expect(document.querySelector('main').getAttribute('role')).toBe('main');
    });

    test('adds role to footer element', () => {
      document.body.innerHTML = '<footer>Footer</footer>';
      const count = repairLandmarks(document);
      expect(document.querySelector('footer').getAttribute('role')).toBe('contentinfo');
    });

    test('does not override existing roles', () => {
      document.body.innerHTML = '<nav role="menubar">Menu</nav>';
      const count = repairLandmarks(document);
      expect(document.querySelector('nav').getAttribute('role')).toBe('menubar');
    });

    test('finds main content by ID when no main tag', () => {
      document.body.innerHTML = '<div id="content"><p>Page content</p></div>';
      const count = repairLandmarks(document);
      expect(document.getElementById('content').getAttribute('role')).toBe('main');
    });
  });

  // ─── Focus Trap Repair ───────────────────────────────

  describe('repairFocusTraps', () => {
    test('adds close button to dialog without one', () => {
      document.body.innerHTML = '<div role="dialog"><p>Modal content</p></div>';
      const count = repairFocusTraps(document);
      const closeBtn = document.querySelector('[data-accessagent="focus-escape"]');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.getAttribute('aria-label')).toBe('Close dialog');
      expect(count).toBe(1);
    });

    test('skips dialog with existing close button', () => {
      document.body.innerHTML = `
        <div role="dialog">
          <button aria-label="Close dialog">X</button>
          <p>Content</p>
        </div>
      `;
      const count = repairFocusTraps(document);
      const escapeButtons = document.querySelectorAll('[data-accessagent="focus-escape"]');
      expect(escapeButtons.length).toBe(0);
    });

    test('sets tabindex on dialog', () => {
      document.body.innerHTML = '<div role="dialog"><p>Content</p></div>';
      repairFocusTraps(document);
      expect(document.querySelector('[role="dialog"]').getAttribute('tabindex')).toBe('-1');
    });
  });

  // ─── Skip Navigation ─────────────────────────────────

  describe('repairSkipNavigation', () => {
    test('injects skip link when main content exists', () => {
      document.body.innerHTML = '<main><p>Content</p></main>';
      const count = repairSkipNavigation(document);
      const skipLink = document.querySelector('.accessagent-skip-link');
      expect(skipLink).not.toBeNull();
      expect(skipLink.textContent).toBe('Skip to main content');
      expect(count).toBe(1);
    });

    test('returns 0 when no main content found', () => {
      document.body.innerHTML = '<div><p>No main</p></div>';
      const count = repairSkipNavigation(document);
      expect(count).toBe(0);
    });

    test('uses existing main content ID', () => {
      document.body.innerHTML = '<main id="page-main"><p>Content</p></main>';
      repairSkipNavigation(document);
      const skipLink = document.querySelector('.accessagent-skip-link');
      expect(skipLink.getAttribute('href')).toBe('#page-main');
    });
  });

  // ─── Full Pipeline ───────────────────────────────────

  describe('runTier1Repairs', () => {
    test('runs all repairs and returns report', () => {
      document.body.innerHTML = `
        <header>Header</header>
        <nav>Nav</nav>
        <main>
          <h1>Title</h1>
          <img src="/images/hero-banner.jpg">
          <button><i class="icon-menu"></i></button>
          <input type="text" placeholder="Search">
          <h4>Subsection</h4>
        </main>
        <footer>Footer</footer>
      `;

      const report = runTier1Repairs(document);

      expect(report).toHaveProperty('images');
      expect(report).toHaveProperty('buttons');
      expect(report).toHaveProperty('formLabels');
      expect(report).toHaveProperty('headings');
      expect(report).toHaveProperty('landmarks');
      expect(report).toHaveProperty('totalRepairs');
      expect(report).toHaveProperty('executionMs');
      expect(report.totalRepairs).toBeGreaterThan(0);
      expect(report.executionMs).toBeGreaterThanOrEqual(0);
    });

    test('handles empty document', () => {
      document.body.innerHTML = '';
      const report = runTier1Repairs(document);
      expect(report.totalRepairs).toBe(0);
    });

    test('handles already accessible document', () => {
      document.body.innerHTML = `
        <header role="banner">Header</header>
        <nav role="navigation">
          <a href="/" aria-label="Home">Home</a>
        </nav>
        <main role="main">
          <h1>Title</h1>
          <h2>Section</h2>
          <img src="photo.jpg" alt="A photo">
          <button aria-label="Search">Search</button>
          <label for="q">Query</label>
          <input id="q" type="text">
        </main>
        <footer role="contentinfo">Footer</footer>
      `;
      const report = runTier1Repairs(document);
      // Minimal repairs since most things are accessible
      expect(report.executionMs).toBeLessThan(100);
    });
  });
});
