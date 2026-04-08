# AccessAgent — Personal Accessibility Agent

> A Chrome extension that automatically repairs web accessibility and provides voice-controlled navigation for blind and low-vision users.

## Competition Context

**NCTSA State Conference 2025-2026** — Design Challenge: "Develop a software program that removes barriers and increases accessibility for people with vision or hearing disabilities."

## Philosophy

This is a **PERSONAL ACCESSIBILITY AGENT**, not an overlay.

accessiBe, UserWay, and similar overlays require the *website owner* to install them. The blind community actively opposes them — the NFB banned accessiBe, the FTC fined them $1M, and 700+ accessibility professionals signed a public statement against overlays.

AccessAgent is different. It's a personal tool — like a screen reader is personal. A blind or low-vision user installs it once. From that point on, every website they visit gets scanned, repaired, and made navigable — automatically, in real-time, before their screen reader ever touches the DOM.

It makes **no compliance claims** about any website. It simply fixes what it can and tells the user what it can't.

**"30 years of waiting for websites to fix themselves hasn't worked — we put the power in the user's hands."**

## Architecture — Three-Tier Repair System

### Tier 1 — Instant DOM Repair (< 50ms, no AI)
Pure rule-based DOM analysis and repair on every page load:
- Images without alt text → infer from filename, surrounding text, parent context
- Unlabeled buttons/icons → infer from aria-label, inner text, CSS class names, title
- Missing form labels → match by proximity and `for` attributes, inject aria-label
- Broken heading hierarchy → inject `role="heading"` with correct `aria-level`
- Missing ARIA landmarks → detect sections, inject banner/nav/main/contentinfo roles
- Keyboard focus traps → detect and inject skip mechanism
- Missing skip navigation → inject "Skip to main content" link

### Tier 2 — Smart Contextual Repair (< 500ms)
Context-aware fixes using DOM analysis + lightweight AI:
- Descriptive labels for ambiguous elements
- Cookie consent & modal trap detection and auto-dismiss
- CAPTCHA interception with audio alternative surfacing
- SPA mutation announcements via MutationObserver + aria-live

### Tier 3 — Vision AI Analysis (1-3s, background, non-blocking)
Asynchronous visual analysis:
- Screenshot capture via `chrome.tabs.captureVisibleTab()`
- Vision-language model analysis (GPT-4o / Claude)
- Spatial layout summaries and visual content descriptions
- "What Am I Missing?" transparency report on demand

## Voice Agent

- **Input**: Web Speech API (primary) + Whisper WebGPU fallback (on-device privacy)
- **Output**: Speech Synthesis API with configurable voice/rate/pitch
- **Intent Classification**: Navigation, page questions, accessibility queries, utility, meta
- **DOM Grounding**: Element registry with fuzzy matching for voice commands
- **Context**: Rolling 10-interaction history with page awareness

## Key Differentiators

| Feature | AccessAgent | Overlays (accessiBe) | Screen Reader AI | WebNav |
|---------|-------------|---------------------|-----------------|--------|
| User-side install | ✓ | ✗ (site-owner) | ✓ | ✓ |
| DOM repair | ✓ | ✓ | ✗ | ✗ |
| Voice navigation | ✓ | ✗ | ✗ | ✓ |
| CAPTCHA interception | ✓ | ✗ | ✗ | ✗ |
| Cookie modal busting | ✓ | ✗ | ✗ | ✗ |
| Gap transparency | ✓ | ✗ | Partial | ✗ |
| No compliance claims | ✓ | ✗ (false claims) | ✓ | ✓ |

## Tech Stack

- **Platform**: Chrome Extension Manifest V3
- **Content Scripts**: Vanilla JS — no framework (performance critical)
- **Bundling**: Webpack
- **Speech**: Web Speech API, Speech Synthesis API
- **AI**: OpenAI API (GPT-4o) / Anthropic API (Claude) for vision + agent logic
- **Testing**: Jest with jsdom for DOM fixture testing

## Code Conventions

- ES modules throughout
- JSDoc comments on all public functions
- No `var` — use `const` (default) and `let` (when reassignment needed)
- Descriptive variable names, no abbreviations
- All ARIA injections are **non-destructive**: never remove existing valid attributes, only add or enhance
- Functions max 20 lines, single responsibility
- Immutable data patterns preferred
- Group imports: external → internal → relative

## Performance Targets

| Metric | Target |
|--------|--------|
| Tier 1 execution | < 50ms |
| Tier 2 execution | < 500ms |
| Tier 3 execution | < 3s (background) |
| Content script footprint | < 500KB |
| Page load impact | None visible |

## Privacy

- No user data collected
- API calls contain page content only (no PII)
- Whisper fallback keeps all audio on-device
- API keys stored in `chrome.storage.local` only — user provides their own
- No analytics, no telemetry, no tracking

## Testing

- Jest for unit tests with jsdom environment
- All Tier 1 heuristics tested against sample DOM fixtures
- Integration tests for message passing between content script and service worker
- Test files co-located in `tests/` directory

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build extension with webpack
npm run dev          # Build in watch mode
npm test             # Run Jest tests
npm run lint         # ESLint check
```
