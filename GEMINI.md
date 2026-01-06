# Tactio - Project Overview

Tactio is an Electron-based productivity tool that uses LLMs to "Copy, Transform, Paste" text. It runs as a background utility, activated via global hotkey (`Ctrl+Shift+G`), processing clipboard content through configured AI prompts (Gemini or OpenRouter).

## Tech Stack
- **Runtime:** Electron (v28), Node.js
- **Language:** TypeScript (v5)
- **UI:** Vanilla HTML/CSS/TS (Renderer process)
- **AI/LLM:** Google Generative AI SDK, OpenRouter API
- **Automation:** `robotjs` (Keyboard simulation), `electron` (Clipboard)
- **Storage:** Local JSON with `safeStorage` encryption for keys

## Key Directories
- `src/main/`: Backend logic. Entry point `main.ts` (Window mgmt, IPC, Hotkeys).
- `src/renderer/`: Frontend UI. `renderer.ts` (DOM, Settings), `index.html`.
- `src/main/store.ts`: Custom configuration management with encryption.
- `src/main/preload.ts`: Context bridge for secure IPC exposure.

## Essential Commands
- **Install:** `npm install`
- **Rebuild (Native Deps):** `npm run rebuild` (Required for `robotjs` on OS change/update)
- **Dev:** `npm start` (Runs `tsc && electron .`)
- **Build:** `npm run build`

## Additional Documentation
- [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) - IPC, State Management, and Window logic patterns.

## Important References
- **IPC Handlers:** `src/main/main.ts:250`
- **LLM Execution:** `src/main/main.ts:114`
- **Global Hotkey:** `src/main/main.ts:228`
- **Store Logic:** `src/main/store.ts:4`
