<div align="center">

![Tactio Banner](https://capsule-render.vercel.app/api?type=waving&color=0:8a2be2,100:4b0082&height=200&section=header&text=Tactio&fontSize=80&fontColor=ffffff)

<img src="assets/tactio-logo-wt.png" width="120" height="auto" alt="Tactio Logo" />

# Tactio

**Copy. Transform. Paste. 🚀**
<br>
*Your AI-driven, invisible productivity companion.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-Latest-black.svg?logo=electron)](https://www.electronjs.org/)

</div>

---

## 🎯 The Mission: AI Superpowers, Zero Subscription Fees

**Tactio** brings powerful, integrated AI to your desktop without the expensive monthly subscriptions. By leveraging **Free Tiers** from providers like **Google Gemini**, **Groq**, and **OpenRouter**, Tactio gives you native, keyboard-first AI capabilities across your entire OS—**completely free**.

<div align="center">
  <img src="assets/Tactio_7VBFgIL9V6.gif" width="600" alt="Tactio Demo" style="border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);" />
  <br>
  <i>See Tactio in action: Copy text, trigger with Ctrl+Shift+G, select an AI action, and watch it paste!</i>
</div>

---

## 📸 Visual Walkthrough

### 🚀 Powerful & Flexible UI
Our sleek, dark-themed interface is designed for speed and clarity.

| Core Features | Customization |
| :--- | :--- |
| ![Settings](assets/Tactio_6zE5Tf6EWF.png) <br> **Smart Settings**: Choose your favorite LLM (Gemini, OpenRouter, Groq, OpenAI), manage your API keys securely, and set up your preferred output directories. | ![Manage Prompts](assets/Tactio_vBG0rbV54r.png) <br> **Action Catalog**: Browse and manage your library of AI transformations. Add new ones or refine existing prompts to fit your workflow. |
| ![Custom Prompt](assets/Tactio_X1j1bHAwza.png) <br> **On-the-fly Magic**: Need a quick, one-off transformation? Use the Custom Prompt tool to talk to the AI without creating a permanent action. | ![File Output](assets/explorer_EFRskGdeD6.png) <br> **Knowledge Base Ready**: Automatically save your AI results as clean, formatted Markdown files—perfect for Obsidian, Notion, or your project docs. |

### 🌐 ecosystem Integration
Tactio doesn't just live in your tray; it connects to the wider prompt ecosystem.

<div align="center">
  <img src="assets/chrome_bwgscxf6f0.png" width="700" alt="Pure Prompts Integration" style="border-radius: 8px; border: 1px solid #333;" />
  <br>
  <b>One-Click Install from Pure Prompts</b>: Browse high-quality, community-tested prompts on <a href="https://pureprompts.vercel.app/">purePrompts</a> and install them directly into Tactio with a single click.
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

## 📦 Download & Install

### Windows (Recommended)

The easiest way to get started is to download the latest version from our **[Releases page](https://github.com/aralde/tactio/releases)**.

*   **[Tactio-Setup.exe](https://github.com/aralde/tactio/releases)**: The standard installer (NSIS). Recommended for most users.
*   **[Tactio-Portable.exe](https://github.com/aralde/tactio/releases)**: No installation required. Just download and run! 🚀

---

## 🛠️ Installation & Setup (For Developers)

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

Released under the **MIT License**.

<div align="center">
  <i>Built with ❤️ by <a href="http://github.com/aralde/">aralde</a> to turbocharge your productivity.</i>
</div>
