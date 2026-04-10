/**
 * Tests for Tier 2 smart contextual repair.
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

window.getComputedStyle = jest.fn().mockReturnValue({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  position: 'static',
  zIndex: 'auto',
});

// Mock requestAnimationFrame for aria-injector
global.requestAnimationFrame = jest.fn(cb => cb());

const { handleCookieBanners, detectCaptchas, runTier2Repairs } = require('../src/content/tier2-smart.js');

describe('Tier 2 Smart Repair', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset getComputedStyle mock
    window.getComputedStyle.mockReturnValue({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      zIndex: 'auto',
    });
  });

  describe('handleCookieBanners', () => {
    test('detects OneTrust banner by ID', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div id="onetrust-banner-sdk">
          <button id="onetrust-reject-all-handler">Reject All</button>
          <button id="onetrust-accept-btn-handler">Accept All</button>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(1);
      expect(result.action).toBe('rejected');
    });

    test('detects CookieBot banner', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div id="CybotCookiebotDialog">
          <button id="CybotCookiebotDialogBodyButtonDecline">Decline</button>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(1);
    });

    test('detects banner by class name', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="cookie-banner">
          <button class="reject-all">Reject</button>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(1);
    });

    test('falls back to text-based reject button', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="cookie-consent">
          <p>We use cookies</p>
          <button>Accept All</button>
          <button>Reject All</button>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(1);
    });

    test('returns 0 when no banner found', () => {
      document.body.innerHTML = '<div>Normal page content</div>';
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(0);
      expect(result.action).toBe('none');
    });

    test('prefers reject over accept', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="cookie-banner">
          <button class="accept-all">Accept</button>
          <button class="reject-all">Reject</button>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.action).not.toBe('accepted');
    });

    test('notifies user when only accept option exists', () => {
      // Use consent-modal class (not cookie-banner) to avoid the
      // ".cookie-banner button:last-child" reject selector
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="consent-modal">
          <p>We use cookies</p>
          <button class="accept-cookies">Accept All Cookies</button>
          <span>more text</span>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(0);
      expect(result.action).toBe('notified');
    });

    test('returns detected-only when banner has no actionable buttons', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="cookie-consent">
          <p>This site uses cookies for analytics.</p>
        </div>
      `;
      const result = handleCookieBanners(document);
      expect(result.handled).toBe(0);
      expect(['detected-only', 'notified']).toContain(result.action);
    });
  });

  describe('runTier2Repairs', () => {
    test('orchestrates cookie and CAPTCHA detection', async () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div id="onetrust-banner-sdk">
          <button id="onetrust-reject-all-handler">Reject All</button>
        </div>
      `;
      const report = await runTier2Repairs(document);
      expect(report.cookieBanners).toBe(1);
      expect(report.captchas).toBe(0);
      expect(report.executionMs).toBeGreaterThanOrEqual(0);
    });

    test('returns zero counts on clean page', async () => {
      document.body.innerHTML = '<div>Clean page</div>';
      const report = await runTier2Repairs(document);
      expect(report.cookieBanners).toBe(0);
      expect(report.captchas).toBe(0);
    });
  });

  describe('detectCaptchas', () => {
    test('detects reCAPTCHA iframe', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <iframe src="https://www.google.com/recaptcha/api/anchor"></iframe>
      `;
      const result = detectCaptchas(document);
      expect(result.found).toBe(1);
      expect(result.type).toBe('reCAPTCHA');
    });

    test('detects hCaptcha by class', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="h-captcha" data-sitekey="abc123"></div>
      `;
      const result = detectCaptchas(document);
      expect(result.found).toBe(1);
      expect(result.type).toBe('hCaptcha');
    });

    test('detects Cloudflare Turnstile', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="cf-turnstile"></div>
      `;
      const result = detectCaptchas(document);
      expect(result.found).toBe(1);
      expect(result.type).toBe('Cloudflare Turnstile');
    });

    test('returns 0 when no CAPTCHA found', () => {
      document.body.innerHTML = '<form><input type="text"><button>Submit</button></form>';
      const result = detectCaptchas(document);
      expect(result.found).toBe(0);
    });

    test('detects audio alternative', () => {
      document.body.innerHTML = `
        <div id="veil-announcements" aria-live="polite"></div>
        <div class="g-recaptcha">
          <button id="recaptcha-audio-button">Audio challenge</button>
        </div>
      `;
      const result = detectCaptchas(document);
      expect(result.hasAudio).toBe(true);
    });
  });
});
