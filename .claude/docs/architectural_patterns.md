# Architectural Patterns

## IPC Communication
The project uses Electron's `contextBridge` to securely expose APIs to the renderer process.
- **Pattern:** `preload.ts` defines a `WindowAPI` interface.
- **Implementation:** `src/main/preload.ts` exposes `window.api`.
- **Handling:** `src/main/main.ts` uses `ipcMain.handle` (async) and `ipcMain.on` (sync/events).
- **Usage:** Renderer calls `window.api.methodName()`.

## State Management
User preferences are managed via a custom `Store` class.
- **Storage:** JSON file in `app.getPath('userData')`.
- **Security:** Uses Electron's `safeStorage` to encrypt API keys (`apiKey` field).
- **Location:** `src/main/store.ts`.

## Window Management
The application acts as a floating utility tool.
- **Behavior:** The main window is created once and toggled (`show`/`hide`) rather than destroyed.
- **Positioning:** Moves to cursor position on activation via `showWindowAtCursor`.
- **Pinning:** Can be toggled "Always on Top" to prevent auto-hiding on blur (`toggle-pin` IPC).

## LLM Service Integration
The application supports multiple LLM providers (Gemini, OpenRouter) via a switch pattern.
- **Pattern:** `initializeLLM` sets up the client (Gemini SDK) or prepares configuration (OpenRouter).
- **Execution:** `executeLLM` handles the specific API call logic based on the selected service.
- **Fallback:** Logic exists to check `electron-store`, then `process.env`.

## Automation
- **Clipboard:** Uses `electron.clipboard` to read/write text.
- **Keystrokes:** Uses `robotjs` (via `automation.ts`) to simulate OS-level Paste commands after window hiding.
