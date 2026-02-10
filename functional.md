# Tactio – Functional Analysis

Tactio is a desktop productivity tool built on Electron designed to optimise the “Copy, Transform, Paste” workflow using Large Language Models (LLMs). It works as a background utility that is globally activated to process selected text.

## Technical Architecture

* **Runtime**: Electron (v28), Node.js.  
* **Language**: TypeScript (v5).  
* **Frontend**: HTML/CSS/Vanilla TypeScript (no heavy frameworks like React/Vue/Angular).  
* **Backend (Main)**: IPC, window management, OS integration.  
* **Storage**: Local via `store.ts` (JSON config) and Electron’s `safeStorage` for API keys.

## Main Features

### 1. Global Activation and Context Capture

* **Global Hotkey**: `Ctrl+Shift+G` (Command+Shift+G on Mac).  
* **Activation Flow**:  
    1. When the shortcut is pressed, the app simulates `Ctrl+C` to copy the selected text.  
    2. Reads the clipboard content.  
    3. Opens a floating window (“Spotlight‑style”) near the cursor position.  
    4. Shows the captured text (or a recent history) ready to be processed.

### 2. AI Processing (LLMs)

Tactio supports multiple AI providers to transform the text:

* **Google Gemini**:  
  * Uses the official `@google/generative-ai` SDK.  
  * Supported models (hard‑coded): `gemini-2.0-flash-lite-001`, `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.0-pro`.  
* **OpenRouter**:  
  * Uses the standard OpenAI‑compatible API.  
  * Allows access to any model available on OpenRouter.  
  * **Free‑Model Filtering**: Includes a setting option to list only free models.

### 3. “Actions” System (Prompts)

The core functionality resides in configurable “Actions”:

* **Prompt Manager**: UI to create, edit, and delete actions.  
* **Action Structure**:  
  * **Label**: Short name (e.g., “Summarize”, “Translate”).  
  * **Icon**: Emoji or short text (e.g., “📝”, “🇪🇸”).  
  * **System Prompt**: The instruction sent to the LLM (e.g., “Summarize the following text…”).  
* **Quick Button Bar**: Actions appear as buttons on the main screen for immediate access.

### 4. Output Modes

The user can choose what to do with the AI‑generated result:

* **Paste Mode (📋)**:  
  * Copies the result to the clipboard.  
  * Minimises and hides the Tactio window.  
  * Simulates `Ctrl+V` to automatically paste the text into the previous application.  
* **File Mode (💾)**:  
  * Saves the result as a Markdown file (`.md`) in a configured directory.  
  * Generates smart file names using AI (or a timestamp if that fails).  
  * Shows a confirmation alert and allows opening the output folder.  
  * Keeps the window open for further work.

### 5. History and Window Management

* **Recent History**: Shows the last three processed results with an option to reuse them (paste again or save).  
* **Floating Window**:  
  * “Frameless” design (no OS borders).  
  * **Pin**: “Always on Top” option (`📌`) to prevent the window from hiding when it loses focus.  
  * **Auto‑hide**: By default, the window hides when clicking outside of it (blur).  
  * Visual resize indicator in the bottom‑right corner.

### 6. Settings

* Service selection (Gemini vs OpenRouter).  
* Secure management of API keys.  
* Output directory selection for files.  
* Persistence of preferences (output mode, etc.).

## Typical User Flow

1. User selects text in any app (browser, IDE, notes).  
2. Presses `Ctrl+Shift+G`.  
3. Tactio appears with its action buttons (e.g., “Explain Code”).  
4. User clicks “Explain Code”.  
5. Tactio sends the text + prompt to the AI.  
6. **If in Paste mode**: The original text is replaced by the explanation.  
7. **If in File mode**: A file `tactio_explanation.md` is created in the documents folder.
