/**
 * Tests for voice intent classification.
 */

global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
};

const { classifyIntent, isConfident } = require('../src/voice/intent-classifier.js');

describe('Intent Classifier', () => {

  describe('navigation commands', () => {
    test('classifies click commands', () => {
      const result = classifyIntent('click add to cart');
      expect(result.intent).toBe('click');
      expect(result.target).toBe('add to cart');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('classifies press commands', () => {
      const result = classifyIntent('press submit');
      expect(result.intent).toBe('click');
      expect(result.target).toBe('submit');
    });

    test('classifies tap commands', () => {
      const result = classifyIntent('tap the search button');
      expect(result.intent).toBe('click');
      expect(result.target).toBe('the search button');
    });

    test('classifies go to URL', () => {
      const result = classifyIntent('go to google.com');
      expect(result.intent).toBe('navigate');
      expect(result.target).toBe('google.com');
    });

    test('classifies open link', () => {
      const result = classifyIntent('open about us');
      expect(result.intent).toBe('navigate');
      expect(result.target).toBe('about us');
    });
  });

  describe('scroll commands', () => {
    test('classifies scroll down', () => {
      const result = classifyIntent('scroll down');
      expect(result.intent).toBe('scroll');
      expect(result.target).toBe('down');
    });

    test('classifies scroll up', () => {
      const result = classifyIntent('scroll up');
      expect(result.intent).toBe('scroll');
      expect(result.target).toBe('up');
    });
  });

  describe('navigation history', () => {
    test('classifies go back', () => {
      expect(classifyIntent('go back').intent).toBe('go_back');
      expect(classifyIntent('back').intent).toBe('go_back');
    });

    test('classifies go forward', () => {
      expect(classifyIntent('go forward').intent).toBe('go_forward');
      expect(classifyIntent('forward').intent).toBe('go_forward');
    });
  });

  describe('element navigation', () => {
    test('classifies next heading', () => {
      const result = classifyIntent('next heading');
      expect(result.intent).toBe('next_element');
      expect(result.target).toBe('heading');
    });

    test('classifies next button', () => {
      const result = classifyIntent('next button');
      expect(result.intent).toBe('next_element');
    });

    test('classifies next link', () => {
      const result = classifyIntent('next link');
      expect(result.intent).toBe('next_element');
    });

    test('classifies next input', () => {
      const result = classifyIntent('next input');
      expect(result.intent).toBe('next_element');
    });
  });

  describe('page queries', () => {
    test('classifies page summary request', () => {
      expect(classifyIntent("what's on this page").intent).toBe('page_summary');
      expect(classifyIntent('describe this page').intent).toBe('page_summary');
      expect(classifyIntent('summarize').intent).toBe('page_summary');
    });

    test('classifies what am I missing', () => {
      expect(classifyIntent('what am i missing').intent).toBe('what_am_i_missing');
    });

    test('classifies read main content', () => {
      expect(classifyIntent('read the main content').intent).toBe('read_main_content');
    });
  });

  describe('utility commands', () => {
    test('classifies dismiss popup', () => {
      expect(classifyIntent('dismiss this popup').intent).toBe('dismiss_popup');
      expect(classifyIntent('close the modal').intent).toBe('dismiss_popup');
    });

    test('classifies help', () => {
      expect(classifyIntent('help').intent).toBe('help');
      expect(classifyIntent('what can i do').intent).toBe('help');
    });

    test('classifies stop speaking', () => {
      expect(classifyIntent('stop').intent).toBe('stop_speaking');
      expect(classifyIntent('quiet').intent).toBe('stop_speaking');
    });

    test('classifies settings', () => {
      expect(classifyIntent('settings').intent).toBe('open_settings');
    });
  });

  describe('unknown commands', () => {
    test('returns low confidence for unknown input', () => {
      const result = classifyIntent('the weather is nice today');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('isConfident', () => {
    test('returns true for high confidence', () => {
      expect(isConfident({ confidence: 0.9 })).toBe(true);
      expect(isConfident({ confidence: 0.8 })).toBe(true);
    });

    test('returns false for low confidence', () => {
      expect(isConfident({ confidence: 0.3 })).toBe(false);
      expect(isConfident({ confidence: 0.7 })).toBe(false);
    });
  });
});
