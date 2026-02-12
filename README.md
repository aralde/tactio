# Tactio

**Tactio** is a powerful, AI-driven productivity tool designed to streamline your workflow through a simple "Copy -> Transform -> Paste" mechanism.  It lives quietly in the background and springs to action with a global hotkey, allowing you to process clipboard content using Large Language Models (LLMs) like Google Gemini or OpenRouter models.

## 🚀 Features

* **Global Hotkey**: Trigger the app from anywhere using `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (macOS).
* **Context-Aware**: Automatically reads your current clipboard content when triggered.
* **Floating UI**: Appears right next to your mouse cursor for minimal context switching.
* **Multi-Provider Support**:
  * **Google Gemini**: Fast and free tier available.
  * **OpenRouter**: Access to top-tier models (GPT-4, Claude 3, Llama 3, etc.).
  * **OpenAI**: Direct integration with GPT models.
  * **Groq**: Incredibly fast inference speeds.
* **Customizable Actions**: Define your own quick actions (e.g., "Summarize", "Fix Grammar", "Translate").
* **History & Eras**: Keep track of your transformations. Create new versions (eras) of a history item by applying new prompts to it.
* **Custom Prompts on History**: Right-click any history item to apply a custom ad-hoc prompt.
* **Export/Import**: Save and load your custom actions for easy sharing.
* **One-Click Paste**: Automatically pastes the transformed text back into your active application.

## 🛠️ Prerequisites

* **Node.js**: (Version 18 or higher recommended)
* **API Key** (one or more):
  * [Google Gemini API Key](https://aistudio.google.com/app/apikey)
  * [OpenRouter API Key](https://openrouter.ai/keys)
  * [Groq API Key](https://console.groq.com/keys)
  * [OpenAI API Key](https://platform.openai.com/api-keys)

## 📥 Installation

1. **Clone the repository**:

    ```bash
    git clone https://github.com/yourusername/tactio.git
    cd tactio
    ```

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Rebuild native modules** (if necessary, for `robotjs`):

    ```bash
    npm run rebuild
    ```

## ⚙️ Configuration

Tactio now features a built-in **Settings UI**.

1. Click the **Gear Icon** in the application header.
2. **LLM Provider**: Select your preferred provider (Gemini, OpenRouter, OpenAI, Groq).
3. **API Key**: Enter your API key for the selected provider. Keys are stored securely using Electron's `safeStorage`.
4. **Model**: Select the model you wish to use (e.g., `gemini-2.0-flash-lite-001`).
5. **Actions**: Manage your quick actions directly in the Settings > Actions tab. You can add, edit, delete, import, and export actions here.

**Note:** The application no longer uses `.env` files for configuration. All settings are stored in `%APPDATA%/tactio/.tactiorc`.

## 🏃 Usage

1. **Start the application**:

    ```bash
    npm start
    ```

2. **Copy some text** from any application (`Ctrl+C`).
3. **Trigger Tactio** by pressing `Ctrl+Shift+G`.
4. **Select an Action** or type a custom prompt.
5. **View the Result** and click it (or the action) to paste it back into your document.

## 🏗️ Development

* **Build**: `npm run build`
* **Rebuild Native Deps**: `npm run rebuild` (Useful if you switch Node versions or OS)

## 📄 License

ISC
