<div align="center">

# Veil
### A Multimodal Accessibility Agent for the Web

<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://www.javascript.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-00B5AD?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![OpenAI](https://img.shields.io/badge/OpenAI_TTS-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com/)
[![Webpack](https://img.shields.io/badge/Webpack-8DD6F9?style=for-the-badge&logo=webpack&logoColor=black)](https://webpack.js.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest_V3-34A853?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)

<br/>

### Built for people who can't use a mouse, a keyboard, or a screen

<br/>

![GitHub stars](https://img.shields.io/github/stars/tanayvin1216/Veil?style=social)
![GitHub forks](https://img.shields.io/github/forks/tanayvin1216/Veil?style=social)
![Open Source](https://img.shields.io/badge/Open_Source-❤️-red?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

</div>

---

## The Story

The web was not built for everyone. Screen readers help, but they assume you can hear well and follow linear speech. Keyboard nav assumes fine motor control. Voice assistants assume you can speak clearly. Veil is a Chrome extension that combines **voice commands**, **hand gestures**, and **high-quality text-to-speech** so that navigating the web doesn't depend on any single ability.

---

## What It Does

- 🎙️ **Voice control** — speak to navigate, click, scroll, read, and search
- ✋ **Hand gesture control** — MediaPipe-powered gesture recognition through your webcam for hands-free navigation
- 🔊 **Natural TTS** — human-quality text-to-speech via OpenAI, not the robotic default browser voice
- ♿ **ARIA injection** — automatically patches accessibility attributes on poorly-built sites
- 👁️ **Mutation observer** — keeps up as pages change, so dynamic content stays reachable
- 🧠 **Multimodal bridge** — voice and gestures work *simultaneously* without stepping on each other

---

## Tech Stack

- **Chrome Extension** (Manifest V3) — service worker + content scripts + offscreen document
- **MediaPipe Hands** — real-time gesture recognition in the browser
- **Web Speech API** — low-latency voice recognition
- **OpenAI TTS** — natural speech synthesis
- **Webpack + Babel** — build pipeline

---

## Roadmap

- 📦 **Publishing to the Chrome Web Store** so anyone can install it in one click
- 🌍 **Open source contributions** — the goal is for Veil to become a community-maintained accessibility tool. If you've ever watched someone struggle to use the web, you know how much room there is to improve
- 🗣️ Expanded language support
- 🤖 Local on-device TTS option for privacy-first users
- 🎯 Per-site gesture profiles

---

## Contributing

This project is open source because accessibility tools should belong to the community that depends on them. PRs, issues, translations, and gesture suggestions are all welcome. If you have a disability and something doesn't work for you — please open an issue. That feedback is the most valuable kind.

```bash
git clone https://github.com/tanayvin1216/Veil.git
cd Veil
npm install
npm run build
# Load the `dist/` folder as an unpacked extension in chrome://extensions
```

---

## Contact

- **GitHub:** [@tanayvin1216](https://github.com/tanayvin1216)
- **Issues:** [Report a bug or request a feature](https://github.com/tanayvin1216/Veil/issues)

---

<div align="center">
  Built so the web works for everyone.
</div>
