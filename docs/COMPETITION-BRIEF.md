# AccessAgent — NCTSA Design Challenge Brief

**Competition**: NCTSA State Conference 2025-2026
**Challenge**: "Develop a software program that removes barriers and increases accessibility for people with vision or hearing disabilities."

---

## The Problem

The web is broken for blind and low-vision users.

- **96.3%** of the top 1 million websites have detectable accessibility errors (WebAIM Million, 2024)
- The average page has **56.8 accessibility errors**
- **22%** of images lack alt text
- **16%** of form inputs lack labels

Blind users rely on screen readers (JAWS, NVDA, VoiceOver) to navigate the web. But screen readers can only read what's there. When a button has no label, the screen reader says "button." When an image has no alt text, the screen reader says nothing. When headings are missing, there's no way to skim.

**The accessibility overlay industry** (accessiBe, UserWay) claimed to solve this. They didn't. The National Federation of the Blind banned accessiBe from their events. The FTC fined them $1 million. Over 700 accessibility professionals signed a public letter declaring overlays harmful. Overlays require the website owner to install them — and most never do.

**30 years of waiting for websites to fix themselves hasn't worked.**

## The Solution

**AccessAgent** puts the power in the user's hands.

It's a Chrome extension that a blind or low-vision person installs once. From that point on, every website they visit is automatically scanned, repaired, and made navigable — before their screen reader ever touches the page.

It also includes a voice-controlled agent that lets users navigate any page with natural speech.

### How It's Different

| | Website Overlays | Screen Readers | AccessAgent |
|--|-----------------|----------------|-------------|
| **Who installs it?** | Website owner | User | User |
| **Repairs the DOM?** | Yes | No | Yes |
| **Voice navigation?** | No | Limited | Full conversational |
| **CAPTCHA handling?** | No | No | Yes |
| **Cookie banner handling?** | No | No | Yes |
| **Tells you what it can't fix?** | No (claims 100%) | No | Yes ("What Am I Missing?") |
| **Makes compliance claims?** | Yes (falsely) | No | No |

## Technical Architecture

### Three-Tier Repair System

**Tier 1 — Instant DOM Repair (< 50ms)**
Runs on every page load with zero network calls:
- Adds descriptions to images without alt text
- Labels unlabeled buttons and icons from CSS class names and context
- Connects form inputs to labels
- Fixes heading hierarchy for screen reader navigation
- Adds ARIA landmark regions for page structure
- Detects and fixes keyboard focus traps
- Injects "Skip to main content" links

**Tier 2 — Smart Contextual Repair (< 500ms)**
- Auto-dismisses cookie consent banners (privacy-preserving: rejects tracking by default)
- Detects CAPTCHAs and surfaces audio alternatives
- Announces dynamic page updates for single-page applications

**Tier 3 — Vision AI Analysis (background, optional)**
- Captures a screenshot and sends it to a vision AI model
- Returns a spatial layout description of the page
- Generates a "What Am I Missing?" report: exactly how many images, charts, and interactive elements lack accessible alternatives

### Voice Agent

Activated by keyboard shortcut (Alt+Shift+A):
- Natural language commands: "Click add to cart," "Fill email with john@example.com," "What's on this page?"
- Fuzzy matches spoken words to actual page elements
- Handles ambiguity: "I found 2 buttons matching that — which one?"
- Maintains conversation context for follow-up commands

## Technology

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks — performance critical)
- Web Speech API for voice recognition
- Speech Synthesis API for spoken responses
- OpenAI GPT-4o / Anthropic Claude for vision analysis (optional, user-provided key)
- Jest test suite with 90 passing tests

## Privacy and Ethics

1. **No data collection** — zero analytics, zero telemetry
2. **No compliance claims** — we never say a website is "accessible" or "compliant"
3. **User controls everything** — API keys are optional and user-provided, stored locally
4. **On-device option** — Whisper speech recognition runs entirely in the browser
5. **Privacy-first cookie handling** — always chooses "reject all" over "accept all"
6. **Transparent about limitations** — the "What Am I Missing?" report tells users exactly what couldn't be fixed

## Impact

If AccessAgent were installed by blind users:
- Every page would have labeled buttons and images — not just the 3.7% that are currently accessible
- Cookie consent banners would stop being an inaccessible barrier
- CAPTCHAs would surface their audio alternatives automatically
- Users would know, for the first time, exactly what they're missing on every page

**We can't make the web accessible. But we can make one user's experience of the web accessible — and that's enough.**
