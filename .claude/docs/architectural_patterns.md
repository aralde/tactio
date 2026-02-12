# Architectural Patterns

## Main Process Organization

The main process is organized using a Manager pattern to separate concerns:

- **WindowManager**: Handles window creation, toggling, and IPC events related to the UI.
- **TrayManager**: Manages the system tray icon and context menu.
- **AutomationManager**: Handles global hotkeys and keyboard simulation (robotjs).
- **FileManager**: Manages file I/O, including saving content and importing/exporting actions.
- **ActionsManager**: Handles CRUD operations for user-defined actions.

## IPC Communication

The project uses Electron's `contextBridge` to securely expose APIs to the renderer process.

- **Pattern:** `preload.ts` defines a `WindowAPI` interface.
- **Implementation:** `src/main/preload.ts` exposes `window.api`.
- **Handling:** `src/main/main.ts` delegates most work to the relevant Managers or the `Store`.
- **Usage:** Renderer calls `window.api.methodName()`.

## State Management

User preferences are managed via a custom `Store` class.

- **Storage:** JSON file in `app.getPath('userData')/.tactiorc`.
- **Security:** Uses Electron's `safeStorage` to encrypt sensitive keys (API Keys).
- **Location:** `src/main/store.ts`.
- **Synchronization:** The `Store` emits updates to the Renderer via `windowManager.sendConfig()`.

## LLM Service Integration

The application uses a Strategy pattern via an `LLMFactory`.

- **Pattern:** `LLMFactory` creates instances of `LLMService` based on the selected provider.
- **Supported Providers:** Gemini, OpenRouter, OpenAI, Groq.
- **Execution:** `executeLLM` (or `trigger-action` handler) uses the factory to get the service and calls `generateCompletion`.
- **Configuration:** API keys and models are retrieved from the `Store` at runtime.

## Automation

- **Clipboard:** Uses `electron.clipboard` to read/write text.
- **Keystrokes:** Uses `robotjs` (via `AutomationManager`) to simulate OS-level Paste commands after window hiding.
- **Global Hotkeys:** Registered via `globalShortcut` in `AutomationManager`.
