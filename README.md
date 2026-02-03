# Tactio

**Tactio** is a powerful, AI-driven productivity tool designed to streamline your workflow through a simple "Copy -> Transform -> Paste" mechanism.  It lives quietly in the background and springs to action with a global hotkey, allowing you to process clipboard content using Large Language Models (LLMs) like Google Gemini or OpenRouter models.

## 🚀 Features

* **Global Hotkey**: Trigger the app from anywhere using `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (macOS).
* **Context-Aware**: Automatically reads your current clipboard content when triggered.
* **Floating UI**: Appears right next to your mouse cursor for minimal context switching.
* **AI Integrations**:
  * **Google Gemini**: fast and free tier available.
  * **OpenRouter**: access to top-tier models (GPT-4, Claude 3, Llama 3, etc.).
  * **Groq**: incredibly fast inference speeds.
* **Customizable Actions**: Define your own quick actions (e.g., "Summarize", "Fix Grammar", "Translate") in `config.json`.
* **One-Click Paste**: Automatically pastes the transformed text back into your active application.
* **History**: Keep track of your transformations for easy re-use.
* **Export/Import**: Save and load your custom actions for easy sharing.

## 🛠️ Prerequisites

* **Node.js**: (Version 18 or higher recommended)
* **API Key**:
  * [Google Gemini API Key](https://aistudio.google.com/app/apikey)
  * [OpenRouter API Key](https://openrouter.ai/keys)
  * [Groq API Key](https://console.groq.com/keys)

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

### 1. Environment Variables (.env)

Create a `.env` file in the root directory by copying the example:

```bash
cp .env.example .env
```

Edit the `.env` file to configure your preferred LLM provider:

**For Google Gemini:**

```env
LLM_SERVICE=GEMINI
MODEL=gemini-2.0-flash-lite-001
GEMINI_API_KEY=your_gemini_api_key_here
```

**For OpenRouter:**

```env
LLM_SERVICE=OPENROUTER
MODEL=nvidia/nemotron-3-nano-30b-a3b:free
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

**For Groq:**

```env
LLM_SERVICE=GROQ
MODEL=llama3-70b-8192
GROQ_API_KEY=your_groq_api_key_here
```

### 2. Custom Actions (config.json)

You can define custom prompt shortcuts in `config.json`. The app loads these on startup.

```json
{
    "actions": [
        {
            "label": "Summarize",
            "icon": "📝",
            "prompt": "Summarize the following text concisely:"
        },
        {
            "label": "Fix Grammar",
            "icon": "✨",
            "prompt": "Fix grammar and spelling:"
        }
    ]
}
```

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
