# AccessAgent — User Guide

## What is AccessAgent?

AccessAgent is a Chrome browser extension that automatically makes websites more accessible for blind and low-vision users. Install it once, and it works on every website you visit.

It is a personal tool — like a screen reader. It does not require website owners to do anything. It simply fixes what it can and tells you what it can't.

## Installation

### From Source (Development)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `dist/` folder inside the project directory
6. AccessAgent is now active

### Building from Source

If you have the source code and want to build it:

```bash
npm install
npm run build
```

Then load the `dist/` folder as described above.

## How It Works

When you visit any website, AccessAgent automatically:

1. **Scans the page** for accessibility problems
2. **Repairs what it can** — adds missing image descriptions, labels unlabeled buttons, fixes heading structure, adds keyboard navigation landmarks
3. **Handles cookie popups** — automatically dismisses cookie consent banners with the most privacy-preserving option
4. **Detects CAPTCHAs** — tells you if there's a CAPTCHA and whether it has an audio alternative
5. **Shows you the count** — the extension badge shows how many repairs were made

All of this happens in under a second, before your screen reader processes the page.

## The Popup

Click the AccessAgent icon in the Chrome toolbar to see:

- Whether AccessAgent is active on the current page
- How many repairs were made, broken down by category
- How long the repairs took
- Keyboard shortcut reference

You can also toggle AccessAgent on/off from the popup.

## Voice Agent

AccessAgent includes a voice-controlled assistant. Activate it with **Alt+Shift+A**.

### What You Can Say

**Navigation:**
- "Click [button or link name]"
- "Go to [URL]"
- "Scroll down" / "Scroll up"
- "Next heading" / "Next button" / "Next link"
- "Go back" / "Go forward"
- "Fill [field name] with [value]"

**Page Understanding:**
- "What's on this page?" — hear a page summary
- "What am I missing?" — accessibility gap report
- "Describe this image"
- "Read the main content"

**Utility:**
- "Dismiss this popup" — close modals and banners
- "Handle this CAPTCHA" — activate audio CAPTCHA
- "Stop" — stop speaking
- "Help" — list all commands
- "Settings" — open settings page

### How It Handles Ambiguity

If you say "click add to cart" and there are multiple "Add to Cart" buttons on the page, AccessAgent will ask:

> "I found 2 'Add to Cart' buttons. The first is near 'Blue Jacket - $89' and the second is near 'Red Shirt - $45'. Which one?"

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+Shift+A** | Toggle voice agent on/off |
| **Alt+Shift+S** | Hear page summary |
| **Alt+Shift+M** | "What Am I Missing?" report |

Customize these at `chrome://extensions/shortcuts`.

## Settings

Open settings from the popup or by saying "settings".

### API Key (Optional)

To enable advanced features (page summaries, image descriptions, complex voice commands), you need an API key from OpenAI or Anthropic:

1. Go to Settings
2. Select your provider (OpenAI or Anthropic)
3. Paste your API key
4. Click Save

Your API key is stored only on your device. It is never sent anywhere except the API provider you selected.

**Without an API key**, AccessAgent still works — Tier 1 and Tier 2 repairs run fully locally with no internet connection needed.

### Tier Controls

You can enable or disable each repair tier:

- **Tier 1** (Instant DOM Repair) — always recommended
- **Tier 2** (Cookie/CAPTCHA handling) — recommended
- **Tier 3** (Vision AI analysis) — requires API key

### Voice Settings

- **Speech recognition engine**: Web Speech API (fast, cloud-based) or Whisper (slower, fully on-device for maximum privacy)
- **Voice**: Choose from available system voices
- **Rate**: Speaking speed (0.5x to 3.0x)
- **Pitch**: Voice pitch (0.5x to 2.0x)

## Privacy

- **No data collected**: AccessAgent does not track you, collect analytics, or phone home
- **API calls**: If you provide an API key, page content (not personal information) is sent to your chosen API provider for analysis. No API calls are made without your key.
- **On-device option**: The Whisper speech engine processes all audio on your device — nothing leaves the browser
- **Local storage only**: All settings and API keys are stored in Chrome's local storage on your device

## Troubleshooting

**AccessAgent badge shows no count:**
The page may already be accessible, or the content script may not have loaded (this happens on `chrome://` pages and some restricted sites).

**Voice agent not responding:**
Make sure you've activated it with Alt+Shift+A. Check that your browser has microphone permission. Try refreshing the page.

**"No API key" message:**
Tier 3 features require an API key. Go to Settings to add one. Tier 1 and 2 work without it.

**Page looks different after installing:**
AccessAgent only adds invisible ARIA attributes and a hidden skip link. It should not change the visual appearance of any page. If something looks different, please report the issue.
