<div align="center">

# Veil

A multimodal accessibility agent for the web.

<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://www.javascript.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-00B5AD?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![OpenAI](https://img.shields.io/badge/OpenAI_TTS-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com/)
[![Webpack](https://img.shields.io/badge/Webpack-8DD6F9?style=for-the-badge&logo=webpack&logoColor=black)](https://webpack.js.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest_V3-34A853?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)

<br/>

![GitHub stars](https://img.shields.io/github/stars/tanayvin1216/Veil?style=social)
![GitHub forks](https://img.shields.io/github/forks/tanayvin1216/Veil?style=social)

</div>

---

## The Story

The web wasn't built for everyone. Screen readers assume you can follow linear speech. Keyboard navigation assumes fine motor control. Voice assistants assume you can speak clearly.

Veil is a Chrome extension that combines voice commands, hand gestures, and high-quality text-to-speech so navigating the web doesn't depend on any single ability.

---

## Features

| Feature | Description |
| --- | --- |
| **Voice Control** | Speak to navigate, click, scroll, read, and search across any page. |
| **Hand Gestures** | MediaPipe-powered gesture recognition through your webcam for fully hands-free navigation. |
| **Natural TTS** | Human-quality text-to-speech via OpenAI, not the robotic default browser voice. |
| **ARIA Injection** | Automatically patches accessibility attributes on poorly-built sites. |
| **Mutation Observer** | Tracks DOM changes so dynamic content stays reachable. |
| **Multimodal Bridge** | Voice and gestures operate simultaneously without stepping on each other. |

---

## How Veil Is Different

Plenty of accessibility tools exist. None combine what Veil does in a single extension.

| Tool | Voice | Hand Gestures | High-Quality TTS | Runtime ARIA Repair |
| --- | :---: | :---: | :---: | :---: |
| **Veil** | ✓ | ✓ | ✓ | ✓ |
| LipSurf | ✓ | — | — | — |
| Talon + Rango | ✓ | face only | — | — |
| Handsfree for Web | ✓ | — | — | — |
| CommandPlus | — | ✓ | — | — |
| Helperbird | — | — | partial | reading aids only |
| macOS Voice Control / Dragon | ✓ | — | — | — |

The space is **underserved, not uncontested**. Voice-only tools are moderately crowded. Webcam gesture tools exist mostly as prototypes. The intersection — simultaneous voice + webcam gestures + natural TTS + runtime ARIA patching, built for people who can't rely on any single input — has no shipped product.

Two things set Veil apart:

- **Simultaneous multimodal bridge.** Voice and gestures run at the same time without interrupting each other. Most tools force you to pick one input modality.
- **Runtime ARIA injection.** Existing ARIA tools are developer audit tools (WAVE, ARIA DevTools) or overlay vendors. Veil patches accessibility attributes live, for end users, on broken sites.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Extension Platform | Chrome Manifest V3 — service worker, content scripts, offscreen document |
| Gesture Recognition | MediaPipe Hands |
| Voice Recognition | Web Speech API |
| Speech Synthesis | OpenAI TTS |
| Build Pipeline | Webpack + Babel |

---

## Roadmap

- [ ] Publish to the Chrome Web Store for one-click installation
- [ ] Fully open source the project so the community can maintain it
- [ ] Expanded language support
- [ ] Local on-device TTS option for privacy-first users
- [ ] Per-site gesture profiles
- [ ] Accessibility telemetry (opt-in) to find the sites that break most often

---

## Getting Started

```bash
git clone https://github.com/tanayvin1216/Veil.git
cd Veil
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension at `chrome://extensions`.

---

## Contributing

Accessibility tools should belong to the community that depends on them. PRs, issues, translations, and gesture suggestions are all welcome.

If you have a disability and something doesn't work for you, please open an issue — that feedback is the most valuable kind.

---

## Contact

| | |
| --- | --- |
| GitHub | [@tanayvin1216](https://github.com/tanayvin1216) |
| Issues | [Report a bug or request a feature](https://github.com/tanayvin1216/Veil/issues) |
