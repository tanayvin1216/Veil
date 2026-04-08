# AccessAgent — Technical Architecture

## System Overview

AccessAgent is a Chrome Extension (Manifest V3) that operates as a personal accessibility repair layer. It scans, repairs, and enhances web pages in real-time for blind and low-vision users.

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Browser                         │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────────┐ │
│  │  Service     │    │  Content Script (per tab)        │ │
│  │  Worker      │    │                                  │ │
│  │             │◄──►│  Tier 1: Instant DOM Repair      │ │
│  │  - API calls│    │  Tier 2: Smart Contextual Repair │ │
│  │  - Agent    │    │  Tier 3: Vision AI (async)       │ │
│  │    logic    │    │                                  │ │
│  │  - TTS      │    │  DOM Labeler (element registry)  │ │
│  │  - State    │    │  Mutation Observer (SPA support)  │ │
│  └──────┬──────┘    └──────────────────────────────────┘ │
│         │                                                │
│  ┌──────┴──────┐    ┌──────────────────────────────────┐ │
│  │  Popup UI   │    │  Settings Page                   │ │
│  │  (status)   │    │  (API key, voice, tiers)         │ │
│  └─────────────┘    └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Vision API      │
│  (OpenAI/Claude) │
│  Optional, async │
└──────────────────┘
```

## Three-Tier Repair Pipeline

### Execution Model

```
Page Load
    │
    ▼
[Tier 1] ──── Synchronous, < 50ms ──── DOM is repaired
    │
    ▼
[Element Registry Build] ──── Index all interactive elements
    │
    ▼
[Mutation Observer Start] ──── Watch for SPA changes
    │
    ├──── Async ────┐
    ▼               ▼
[Tier 2]        [Tier 3]
< 500ms         1-3 seconds
Cookie/CAPTCHA  Screenshot → AI
    │               │
    ▼               ▼
[Re-index]    [Summary ready]
```

### Tier 1: Instant DOM Repair

**Execution**: Synchronous on DOMContentLoaded
**Target**: < 50ms
**Dependencies**: None (pure rule-based)

| Repair Type | Detection Method | Fix Applied |
|------------|-----------------|-------------|
| Missing alt text | `img:not([alt]), img[alt=""]` | Infer from filename, figcaption, parent link, title |
| Unlabeled buttons | Button/[role=button] without accessible name | Infer from icon CSS classes, SVG title, title attr |
| Missing form labels | Input without label, aria-label, or aria-labelledby | Inject aria-label from placeholder, name attr, preceding text |
| Heading hierarchy | Heading level skips (h1 → h4) | Inject role=heading + aria-level |
| Missing landmarks | Semantic elements without ARIA roles | Inject banner, navigation, main, contentinfo |
| Focus traps | Dialogs without close/escape mechanism | Inject close button with aria-label |
| Skip navigation | No skip link present | Inject "Skip to main content" link |

### Tier 2: Smart Contextual Repair

**Execution**: Asynchronous after Tier 1
**Target**: < 500ms

- **Cookie banners**: Detects OneTrust, CookieBot, Quantcast, and generic cookie consent patterns. Dismisses with most privacy-preserving option (reject > necessary > close). Announces action to screen reader.
- **CAPTCHA detection**: Identifies reCAPTCHA, hCaptcha, Cloudflare Turnstile. Checks for audio alternatives. Announces to user.
- **SPA mutations**: MutationObserver with debouncing announces significant DOM changes via aria-live region.

### Tier 3: Vision AI Analysis

**Execution**: Background, non-blocking
**Target**: 1-3 seconds
**Requires**: API key (user-provided)

1. Capture viewport screenshot via `chrome.tabs.captureVisibleTab()`
2. Send to vision-language model (GPT-4o or Claude)
3. Receive structured analysis: layout summary, visual content descriptions, missing alt text suggestions
4. Store result for on-demand "What Am I Missing?" report

## Voice Agent Architecture

```
User Speech ──► Web Speech API ──► Transcript
                                      │
                            ┌─────────┴──────────┐
                            ▼                    ▼
                    Rule-based              LLM Fallback
                    Classifier              (via API)
                            │                    │
                            └─────────┬──────────┘
                                      ▼
                               Intent + Target
                                      │
                                      ▼
                              DOM Element Registry
                              (fuzzy matching)
                                      │
                                      ▼
                              Action Execution
                              (click, fill, scroll...)
                                      │
                                      ▼
                              Spoken Confirmation
                              (Speech Synthesis)
```

### DOM Grounding System

Every interactive element on the page is indexed with:
- Sequential ID (el-1, el-2, ...)
- ARIA label (may be generated by Tier 1)
- Visible text content
- Nearby text for context
- Inferred role
- Viewport position
- Focusability state

Voice commands are fuzzy-matched against this registry using token-based scoring.

## Security Model

- **No data collection**: No analytics, telemetry, or tracking
- **API keys**: Stored in `chrome.storage.local`, user-provided, never transmitted except to the configured API provider
- **Content isolation**: Content scripts run in the page context but communicate with the service worker only via `chrome.runtime` message passing
- **Permissions**: `activeTab` + `tabs` for screenshot capture, `storage` for settings, `tts` for speech, `<all_urls>` for content script injection

## File Structure

```
src/
├── content/           # Content scripts (run in page context)
│   ├── index.js       # Orchestrator — runs tier pipeline
│   ├── tier1-repair.js    # Rule-based DOM repair
│   ├── tier2-smart.js     # Cookie/CAPTCHA/SPA repair
│   ├── tier3-vision.js    # Vision AI analysis
│   ├── dom-labeler.js     # Element registry for voice grounding
│   ├── mutation-observer.js   # SPA change detection
│   ├── aria-injector.js   # Safe ARIA attribute injection
│   └── content.css        # Minimal injected styles
├── background/        # Service worker (extension context)
│   ├── service-worker.js  # Message hub, state management
│   ├── api-client.js      # OpenAI/Anthropic API wrapper
│   └── agent-logic.js     # Voice agent intent/action logic
├── voice/             # Speech I/O modules
│   ├── speech-input.js    # Web Speech API recognition
│   ├── speech-output.js   # Speech Synthesis with queue
│   └── intent-classifier.js  # Lightweight intent classification
├── ui/                # Extension UI
│   ├── popup.html/js/css  # Status popup
│   └── settings.html/js/css   # Configuration page
└── utils/             # Shared utilities
    ├── constants.js       # Selectors, patterns, config keys
    ├── storage.js         # chrome.storage wrapper
    └── logger.js          # Debug logging
```
