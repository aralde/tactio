<div align="center">

![Tactio Banner](https://capsule-render.vercel.app/api?type=waving&color=0:8a2be2,100:4b0082&height=200&section=header&text=Tactio&fontSize=80&fontColor=ffffff)

<img src="assets/tactio-logo-wt.png" width="120" height="auto" alt="Tactio Logo" />

# Tactio

**Copy. Transform. Paste. 🚀**
<br>
*Your AI-driven, invisible productivity companion.*

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-Latest-black.svg?logo=electron)](https://www.electronjs.org/)

</div>

---

## 💡 The Solution: AI Superpowers, Zero Subscription Fees

**Tactio** was built with a clear mission: to bring powerful, integrated AI to your desktop without forcing you into expensive monthly subscriptions like Windows Copilot or ChatGPT Plus. 

By leveraging **Free Tiers** from providers like **Google Gemini**, **Groq**, and **OpenRouter**, Tactio gives you native, keyboard-first AI capabilities across your entire OS—**completely free**. It lives quietly in the background and springs into action with a simple global hotkey (`Ctrl+Shift+G`), allowing you to transform your clipboard content instantly using top-tier Large Language Models.

<div align="center">
  <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Laptop.png" width="200" alt="App Screenshot Placeholder" style="border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);" />
  <br><i>(Imagine your beautiful UI here! You can replace this placeholder with a real screenshot)</i>
</div>

---

## 🔗 Seamless purePrompts Integration

Tactio integrates natively with [purePrompts.vercel.app](https://pureprompts.vercel.app/). Browse our curated catalog of high-quality, community-tested prompts and **install them directly into your Tactio app with a single click**. No manual copying across apps—your new superpower is immediately available from the hotkey menu!

---

## 🔥 Best Use Cases

Unlock your full potential with these powerful built-in transformations:

### 💻 For Developers (Code)

* **🐛 Bug Detection**: Instantly review code snippets for logical errors, edge cases, and performance bottlenecks.
* **♻️ Safe Refactoring**: Rewrite code to improve readability and structure while maintaining the exact same functionality.
* **📖 Step-by-Step Explanation**: Demystify complex code blocks line-by-line using accessible language.
* **⚡ Performance Optimization**: Identify bottlenecks (time/memory complexity) and get a highly optimized version.

### 📝 For Writers & Content (Text)

* **✂️ Professional Rewrite**: Transform raw thoughts into clear, direct, and professional text, eliminating jargon and errors.
* **🌍 Contextual Translation**: Translate text accurately while preserving technical terms and tone.
* **📌 Ultra-short TL;DR**: Generate a 2-sentence summary that captures the absolute core idea of a long text.
* **📋 Text to Checklist**: Turn unstructured emails or meeting notes into actionable checklist items.

### ✉️ For Communication (Emails & Messages)

* **🚀 Fast Replies**: Generate brief, professional email responses including next steps and clear answers.
* **🕊️ Tone Softener**: Make collaborative feedback sound constructive rather than aggressive.
* **🧵 Thread Summarization**: Condense long conversation threads into a 10-line summary of "who said what" and "what's pending".

### 📚 For Documentation & Architecture

* **📄 Generate Tech Docs**: Turn logic/code into Markdown docs with params, outputs, and examples.
* **🎯 Decisions & Risks Extractor**: Pull out key decisions, identified risks, and open questions from meeting notes.
* **⚙️ Snippet Creator**: Convert raw text into a reusable template with `[PLACEHOLDERS]`.

---

## 🚀 Key Features

* **⌨️ Global Hotkey**: Trigger the app instantly from anywhere (`Ctrl+Shift+G` / `Cmd+Shift+G`).
* **🧠 Context-Aware**: Reads your current clipboard content automatically.
* **🖱️ Floating UI**: Appears right next to your mouse cursor for zero context switching.
* **🌐 Multi-Provider Support**: Choose between Google Gemini, OpenRouter, OpenAI, and Groq.
* **⏳ History & Eras**: Track transformations and create versions (eras) of an item by chaining prompts.
* **⚡ One-Click Paste**: Automatically injects the transformed text back into your active application!

---

## 🛠️ Installation & Setup

### Prerequisites

* **Node.js**: v18 or higher.
* **API Keys**: Get one from [Google Gemini](https://aistudio.google.com/app/apikey), [OpenRouter](https://openrouter.ai/keys), [Groq](https://console.groq.com/keys), or [OpenAI](https://platform.openai.com/api-keys).

### Quick Start

1. **Clone & Install**:

   ```bash
   git clone https://github.com/yourusername/tactio.git
   cd tactio
   npm install
   ```

2. **Rebuild Native Modules** (Crucial for `robotjs`):

   ```bash
   npm run rebuild
   ```

3. **Launch Tactio**:

   ```bash
   npm start
   ```

---

## ⚙️ Configuration

Tactio features a sleek built-in **Settings UI**. No `.env` files required!

1. Click the **Gear Icon** in the header.
2. Select your **LLM Provider** and enter your **API Key** (stored securely via Electron's `safeStorage` in `%APPDATA%/tactio/.tactiorc`).
3. Choose your preferred **Model** and manage your **Custom Actions**.

## 📄 License

Released under the **ISC License**.

<div align="center">
  <i>Built with ❤️ by <a href="http://github.com/aralde/">aralde</a> to turbocharge your productivity.</i>
</div>
