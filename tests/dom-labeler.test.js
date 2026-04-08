/**
 * Tests for DOM element registry and fuzzy matching.
 */

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

// Mock getComputedStyle
window.getComputedStyle = jest.fn().mockReturnValue({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
});

// Mock getBoundingClientRect for jsdom (always returns 0x0)
Element.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
  width: 100,
  height: 40,
  top: 0,
  left: 0,
  right: 100,
  bottom: 40,
  x: 0,
  y: 0,
});

const {
  buildElementRegistry,
  getRegistryArray,
  fuzzyMatch,
  getElementById,
  getDOMElement,
} = require('../src/content/dom-labeler.js');

describe('DOM Labeler', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('buildElementRegistry', () => {
    test('registers buttons', () => {
      document.body.innerHTML = '<button aria-label="Add to Cart">Add to Cart</button>';
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(1);
      expect(registry[0].tag).toBe('button');
      expect(registry[0].ariaLabel).toBe('Add to Cart');
    });

    test('registers links', () => {
      document.body.innerHTML = '<a href="/about">About Us</a>';
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(1);
      expect(registry[0].tag).toBe('a');
      expect(registry[0].visibleText).toContain('About Us');
    });

    test('registers form inputs', () => {
      document.body.innerHTML = `
        <input type="text" aria-label="Search">
        <textarea aria-label="Message"></textarea>
        <select aria-label="Country"><option>US</option></select>
      `;
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(3);
    });

    test('assigns sequential IDs', () => {
      document.body.innerHTML = `
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      `;
      const registry = buildElementRegistry(document);
      expect(registry[0].id).toMatch(/^el-\d+$/);
      expect(registry[1].id).toMatch(/^el-\d+$/);
      expect(registry[2].id).toMatch(/^el-\d+$/);
    });

    test('skips hidden elements', () => {
      document.body.innerHTML = '<button hidden>Hidden</button>';
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(0);
    });

    test('skips hidden inputs', () => {
      document.body.innerHTML = '<input type="hidden" name="csrf">';
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(0);
    });

    test('includes aria-hidden=false elements', () => {
      document.body.innerHTML = '<button aria-hidden="false">Visible</button>';
      const registry = buildElementRegistry(document);
      expect(registry.length).toBe(1);
    });

    test('adds data-accessagent-id to elements', () => {
      document.body.innerHTML = '<button>Click me</button>';
      buildElementRegistry(document);
      const btn = document.querySelector('button');
      expect(btn.getAttribute('data-accessagent-id')).toMatch(/^el-\d+$/);
    });

    test('captures nearby text for context', () => {
      document.body.innerHTML = `
        <div>
          <span>Blue Jacket - $89.00</span>
          <button>Add to Cart</button>
        </div>
      `;
      const registry = buildElementRegistry(document);
      const button = registry.find(e => e.tag === 'button');
      expect(button.nearbyText).toContain('Blue Jacket');
    });
  });

  describe('fuzzyMatch', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button aria-label="Add to Cart">Add to Cart</button>
        <button aria-label="Search">Search</button>
        <a href="/about" aria-label="About Us">About Us</a>
        <input type="text" aria-label="Email address">
      `;
      buildElementRegistry(document);
    });

    test('exact match returns high confidence', () => {
      const results = fuzzyMatch('Add to Cart');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].element.ariaLabel).toBe('Add to Cart');
      expect(results[0].confidence).toBeGreaterThan(0.5);
    });

    test('partial match works', () => {
      const results = fuzzyMatch('cart');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].element.ariaLabel).toBe('Add to Cart');
    });

    test('search matches search button', () => {
      const results = fuzzyMatch('search');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].element.ariaLabel).toBe('Search');
    });

    test('returns low confidence for no match', () => {
      const results = fuzzyMatch('nonexistent element xyz');
      if (results.length > 0) {
        expect(results[0].confidence).toBeLessThan(0.3);
      } else {
        expect(results).toEqual([]);
      }
    });

    test('returns empty for empty query', () => {
      const results = fuzzyMatch('');
      expect(results).toEqual([]);
    });

    test('respects maxResults', () => {
      const results = fuzzyMatch('a', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getElementById', () => {
    test('returns entry for valid ID', () => {
      document.body.innerHTML = '<button>Test</button>';
      const registry = buildElementRegistry(document);
      const id = registry[0].id;
      const entry = getElementById(id);
      expect(entry).not.toBeNull();
      expect(entry.tag).toBe('button');
    });

    test('returns null for invalid ID', () => {
      const entry = getElementById('el-99999');
      expect(entry).toBeNull();
    });
  });

  describe('getDOMElement', () => {
    test('returns the actual HTMLElement for a registered ID', () => {
      document.body.innerHTML = '<button>Real Button</button>';
      const registry = buildElementRegistry(document);
      const id = registry[0].id;
      const el = getDOMElement(id);
      expect(el).not.toBeNull();
      expect(el.tagName).toBe('BUTTON');
      expect(el.textContent).toBe('Real Button');
    });

    test('returns null for an unregistered ID', () => {
      document.body.innerHTML = '<button>Test</button>';
      buildElementRegistry(document);
      const el = getDOMElement('el-99999');
      expect(el).toBeNull();
    });
  });
});
