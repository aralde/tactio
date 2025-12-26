import { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { simulatePaste, simulateCopy, releaseModifiers } from './automation';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// ... (existing code)


import { Store } from './store';

// ... (existing code)

let mainWindow: BrowserWindow | null = null;
let config: any = null;
let genAI: GoogleGenerativeAI | null = null;
let geminiModel: any = null;

// Initialize Store
const store = new Store({
    configName: 'user-preferences',
    defaults: {
        service: 'GEMINI',
        apiKey: '',
        model: 'gemini-2.0-flash-lite-001'
    }
});

function initializeLLM() {
    // Read from store, fall back to process.env for backward compatibility/dev
    const service = store.get('service') || process.env.LLM_SERVICE || 'GEMINI';
    const model = store.get('model') || process.env.MODEL || 'gemini-2.0-flash-lite-001';
    let apiKey = store.get('apiKey');

    // If no API key in store, check env
    if (!apiKey) {
        if (service === 'GEMINI') apiKey = process.env.GEMINI_API_KEY;
        else if (service === 'OPENROUTER') apiKey = process.env.OPENROUTER_API_KEY;
    }

    console.log(`Initializing LLM Service: ${service}, Model: ${model}`);

    if (service === 'GEMINI') {
        if (apiKey) {
            genAI = new GoogleGenerativeAI(apiKey);
            geminiModel = genAI.getGenerativeModel({ model: model });
        } else {
            console.error("GEMINI_API_KEY is missing via Settings or .env");
            geminiModel = null;
        }
    } else if (service === 'OPENROUTER') {
        // OpenRouter doesn't need SDK init here, handled in execute
    }
}

function loadConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config.json');
        const data = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(data);
    } catch (err) {
        console.error('Failed to load config:', err);
        config = { actions: [] };
    }
}


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 300,
        height: 400,
        frame: false, // Floating UI style
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

    // Hide instead of close on blur to keep it ready
    // Hide instead of close on blur to keep it ready
    mainWindow.on('blur', () => {
        // Only hide if NOT pinned (always on top)
        if (!mainWindow?.isAlwaysOnTop()) {
            mainWindow?.hide();
        }
    });
}

function showWindowAtCursor(clipboardText: string = '') {
    if (!mainWindow) return;

    const point = screen.getCursorScreenPoint();
    // Adjust position slightly so it doesn't open exactly under the cursor which might be annoying
    mainWindow.setPosition(point.x + 10, point.y + 10);
    mainWindow.show();
    mainWindow.focus();

    // Send config and clipboard text to renderer
    mainWindow.webContents.send('config-update', { config, clipboardText });
}


async function executeLLM(prompt: string, text: string): Promise<string> {
    const fullPrompt = `${prompt}\n\n"${text}"`;
    const service = store.get('service') || process.env.LLM_SERVICE || 'GEMINI';
    const modelName = store.get('model') || process.env.MODEL || 'gemini-2.0-flash-lite-001';
    let apiKey = store.get('apiKey');

    // Env fallback
    if (!apiKey) {
        if (service === 'GEMINI') apiKey = process.env.GEMINI_API_KEY;
        else if (service === 'OPENROUTER') apiKey = process.env.OPENROUTER_API_KEY;
    }

    if (service === 'GEMINI') {
        if (!geminiModel) {
            // Try re-init if key was lately added?
            initializeLLM();
            if (!geminiModel) throw new Error("Gemini API not initialized. Please configure API Key.");
        }
        try {
            // Re-fetch model instructions if needed? Standard genAI logic:
            // Ensure we use the current model from store if changed w/o re-init?
            // initializeLLM sets geminiModel. 
            const result = await geminiModel.generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        } catch (error: any) {
            console.error("Gemini API Error:", error);
            throw new Error(`Gemini API Failed: ${error.message || 'Unknown error'}`);
        }
    } else if (service === 'OPENROUTER') {
        if (!apiKey) throw new Error("OpenRouter API Key missing. Please configure settings.");

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "AIToys"
                },
                body: JSON.stringify({
                    "model": modelName,
                    "messages": [
                        { "role": "user", "content": fullPrompt }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "No response content";

        } catch (error: any) {
            console.error("OpenRouter API Error:", error);
            throw new Error(`OpenRouter Failed: ${error.message || 'Unknown error'}`);
        }
    } else {
        throw new Error(`Unknown LLM Service: ${service}`);
    }
}

app.whenReady().then(() => {
    store.init();
    loadConfig();
    initializeLLM();
    createWindow();

    // Register copy-paste handler
    const handleGlobalShortcut = async () => {
        // 0. Release modifiers to prevent interference (e.g., Ctrl+Shift+C in Word)
        releaseModifiers();
        await new Promise(resolve => setTimeout(resolve, 100));

        // 1. Clear clipboard to detect new copy
        clipboard.writeText('');

        // 2. Simulate Copy
        try {
            simulateCopy();
        } catch (err) {
            console.error('Auto-copy failed:', err);
        }

        // 3. Poll for clipboard change (max 1.5s)
        let text = '';
        const startTime = Date.now();
        const timeout = 1500; // 1.5 seconds max wait

        while (Date.now() - startTime < timeout) {
            text = clipboard.readText();
            if (text && text.length > 0) {
                break;
            }
            // Wait 50ms before next check
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (text) {
            console.log('Clipboard text detected, showing window.');
            showWindowAtCursor(text);
        } else {
            console.log('No new text detected (timeout). Using previous or empty.');
            // Fallback: If copy failed, maybe they just wanted to open the app?
            // Or maybe show error? For now show window with what we have (nothing)
            // or recover previous text if we want to be nice? 
            // Let's just show window empty for now, or if it really failed, maybe the user
            // didn't select anything.

            // Restore previous if nothing copied? 
            // actually if they selected nothing, clearing clipboard means we lost previous.
            // But usually you select text -> hotkey. 
            // If no text selected -> Ctrl+C -> clipboard empty.

            // If we want to support "HotKey opens app with OLD clipboard content if nothing selected",
            // that's a different feature. 
            // Current requirement: "Copy text".

            // Let's pass empty string if failed.
            showWindowAtCursor('');
        }
    };

    // Register Global Hotkeys
    const primaryHotkey = 'CommandOrControl+Shift+G';
    const ret = globalShortcut.register(primaryHotkey, handleGlobalShortcut);

    if (!ret) {
        console.log('registration failed');
    }

    // Check if hotkey is registered
    console.log(`${primaryHotkey} registered:`, globalShortcut.isRegistered(primaryHotkey));

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


// IPC Handlers
ipcMain.on('ui-ready', (event) => {
    console.log('Renderer UI ready, sending config');
    event.sender.send('config-update', config);
});

ipcMain.handle('get-settings', () => {
    return {
        service: store.get('service') || 'GEMINI',
        apiKey: store.get('apiKey') || '',
        model: store.get('model') || 'gemini-2.0-flash-lite-001'
    };
});

ipcMain.handle('save-settings', (event, newSettings) => {
    store.set('service', newSettings.service);
    store.set('apiKey', newSettings.apiKey);
    store.set('model', newSettings.model);
    initializeLLM(); // Re-initialize with new settings
    return true;
});

ipcMain.handle('get-models', async (event, service, apiKey) => {
    if (service === 'OPENROUTER') {
        if (!apiKey) return [];
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            const data = await response.json();
            return data.data.map((m: any) => ({
                id: m.id,
                name: m.name,
                context_length: m.context_length
            })).sort((a: any, b: any) => a.id.localeCompare(b.id)); // Sort A-Z
        } catch (e) {
            console.error("Failed to fetch OpenRouter models:", e);
            return [];
        }
    } else if (service === 'GEMINI') {
        // Basic list for now, or fetch if apiKey present
        // Gemini API list_models requires auth? Yes.
        if (apiKey) {
            try {
                const tempGenUI = new GoogleGenerativeAI(apiKey);
                // Note: listModels is on the GoogleGenerativeAI instance? 
                // Actually no, it's a gap in the simple node client often?
                // Checking documentation... Node SDK has it on the manager usually, 
                // but let's stick to a curated list for fallback or try to find it.
                // The current SDK usage: 
                // const genAI = new GoogleGenerativeAI(API_KEY);
                // const model = genAI.getGenerativeModel({ model: "MODEL_NAME" });
                // It doesn't seem to expose a direct 'listModels' in the top level easily in v0.24?
                // Actually it might be via `getGenerativeModel` not having a list. 
                // Let's provide a hardcoded list of verified Gemini models for now to avoid complexity 
                // unless I verify `genAI` object has a list method.
            } catch (e) { }
        }

        return [
            { id: 'gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' }
        ];
    }
    return [];
});

ipcMain.handle('trigger-action', async (event, actionLabel, prompt) => {
    const totalStart = performance.now();
    console.log(`[Timing] Starting action: ${actionLabel}`);

    try {
        // REMOVED: mainWindow?.hide(); // We keep it open for loading state

        const clipStart = performance.now();
        const text = clipboard.readText();
        const clipEnd = performance.now();
        console.log(`[Timing] Clipboard read: ${(clipEnd - clipStart).toFixed(2)}ms`);

        if (!text) return "Clipboard empty";

        console.log(`Executing action: ${actionLabel}`);

        const geminiStart = performance.now();
        const result = await executeLLM(prompt, text);
        const geminiEnd = performance.now();
        console.log(`[Timing] Gemini execution: ${(geminiEnd - geminiStart).toFixed(2)}ms`);

        // NO LONGER HIDING WINDOW OR PASTING AUTOMATICALLY
        // mainWindow?.hide(); 

        const totalEnd = performance.now();
        console.log(`[Timing] Total duration: ${(totalEnd - totalStart).toFixed(2)}ms`);

        return result; // Return the text to renderer
    } catch (error: any) {
        console.error("Error in trigger-action:", error);
        // Do NOT hide on error, let renderer show alert
        return `Error: ${error.message}`;
    }
});

ipcMain.handle('paste-result', async (event, text) => {
    console.log('User requested paste.');
    try {
        // 1. Write to clipboard first
        clipboard.writeText(text);

        // 2. Hide window to return focus to previous app
        // Using minimize AND hide to force focus shift on Windows
        mainWindow?.minimize();
        mainWindow?.hide();

        // 3. Wait for focus to switch (Windows can be slow)
        // Increased to 800ms to be safe
        await new Promise(resolve => setTimeout(resolve, 800));

        // 4. Simulate Paste (Ctrl+V)
        simulatePaste();
    } catch (error) {
        console.error("Error in paste-result:", error);
    }
});

ipcMain.handle('toggle-pin', (event) => {
    if (mainWindow) {
        const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
        mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
        return !isAlwaysOnTop; // Return new state
    }
    return false;
});
