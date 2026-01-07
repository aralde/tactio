import { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog } from 'electron';
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
let tray: Tray | null = null;
let genAI: GoogleGenerativeAI | null = null;
let geminiModel: any = null;
let lastActionPrompt: string | null = null;

// Helper: Save content to file with smart naming
const saveContentToFile = async (content: string, extension: string = 'md'): Promise<string> => {
    let outputDir = store.get('outputDirectory');
    if (!outputDir) {
        outputDir = path.join(app.getPath('documents'), 'Tactio Output');
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let filename = '';
    let contentToWrite = content;
    const useMetadata = store.get('generateMetadata') !== false; // Default true

    if (useMetadata) {
        try {
            // Generate metadata (filename, summary, tags)
            const metadataPrompt = `
Analyze the following text and generate a JSON object with these fields:
1. "filename": A concise, kebab-case filename (max 50 chars).
2. "summary": A single brief sentence summarizing the content (in the same language as the content).
3. "tags": An array of up to 5 relevant tags starting with # (e.g. ["#code", "#idea"]).

Return ONLY the raw JSON string, no markdown code blocks.
`;

            let llmOutput = await executeLLM(metadataPrompt, content.substring(0, 4000));

            // Clean up markdown code blocks if present (common with LLMs)
            llmOutput = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();

            const metadata = JSON.parse(llmOutput);

            if (metadata.filename) {
                filename = metadata.filename.replace(/[^a-z0-9\-_]/gi, '').trim();
                if (filename.length > 50) filename = filename.substring(0, 50);
            }

            const summary = metadata.summary || '';
            const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : '';

            // Prepend summary and tags if they exist
            if (summary || tags) {
                contentToWrite = `${summary}\n${tags}\n\n${content}`;
            }

        } catch (e) {
            console.log("Failed to infer metadata, using fallback", e);
        }
    }

    if (!filename || filename.length < 3) {
        const now = new Date();
        const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
        filename = `tactio_${timestamp}`;
    }

    // Avoid duplicates
    let fullPath = path.join(outputDir, `${filename}.${extension}`);
    let counter = 1;
    while (fs.existsSync(fullPath)) {
        fullPath = path.join(outputDir, `${filename}_${counter}.${extension}`);
        counter++;
    }

    fs.writeFileSync(fullPath, contentToWrite, 'utf8');
    return fullPath;
};

function createTray() {
    const iconPath = path.join(__dirname, '../../assets/tactio-logo.ico'); // Updated to use tactio-logo.ico
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show/Hide',
            click: () => {
                if (mainWindow?.isVisible()) {
                    mainWindow.hide();
                } else {
                    showWindowAtCursor();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Tactio');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        showWindowAtCursor();
    });
}

// Initialize Store
const store = new Store({
    configName: 'user-preferences', // This name is now overridden in store.ts to be config.json
    defaults: {
        service: 'GEMINI',
        apiKey: '',
        model: 'gemini-2.0-flash-lite-001',
        actions: []
    }
});

function initializeLLM() {
    // Read from store, fall back to process.env for backward compatibility/dev
    const service = store.get('service') || process.env.LLM_SERVICE || 'GEMINI';
    const model = store.get('model') || process.env.MODEL || 'gemini-2.0-flash-lite-001';
    // Unified key retrieval
    let apiKey = '';
    if (service === 'GEMINI') apiKey = store.get('geminiApiKey') || process.env.GEMINI_API_KEY;
    else if (service === 'OPENROUTER') apiKey = store.get('openRouterApiKey') || process.env.OPENROUTER_API_KEY;
    else if (service === 'GROQ') apiKey = store.get('groqApiKey') || process.env.GROQ_API_KEY; // New Groq support

    // Fallback to legacy 'apiKey' if still present (though migration should handle it)
    if (!apiKey) apiKey = store.get('apiKey');

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
    } else if (service === 'GROQ') {
        // Groq handled via fetch in execute
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
        icon: path.join(__dirname, '../../assets/tactio-logo.ico')
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

    // Only move if NOT pinned (always on top)
    if (!mainWindow.isAlwaysOnTop()) {
        const point = screen.getCursorScreenPoint();
        // Adjust position slightly so it doesn't open exactly under the cursor which might be annoying
        mainWindow.setPosition(point.x + 10, point.y + 10);
    } else {
        console.log('Window is pinned, skipping reposition to cursor.');
    }

    mainWindow.show();
    mainWindow.focus();

    // Send config and clipboard text to renderer
    mainWindow.webContents.send('config-update', { config: store.getAll(), clipboardText });
}


async function executeLLM(prompt: string, text: string): Promise<string> {
    const fullPrompt = `${prompt}\n\n"${text}"`;
    const service = store.get('service') || process.env.LLM_SERVICE || 'GEMINI';
    const modelName = store.get('model') || process.env.MODEL || 'gemini-2.0-flash-lite-001';
    // Unified key retrieval
    let apiKey = '';
    if (service === 'GEMINI') apiKey = store.get('geminiApiKey') || process.env.GEMINI_API_KEY;
    else if (service === 'OPENROUTER') apiKey = store.get('openRouterApiKey') || process.env.OPENROUTER_API_KEY;
    else if (service === 'GROQ') apiKey = store.get('groqApiKey') || process.env.GROQ_API_KEY;

    // Fallback
    if (!apiKey) apiKey = store.get('apiKey');

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
    } else if (service === 'GROQ') {
        if (!apiKey) throw new Error("Groq API Key missing. Please configure settings.");

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
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
                throw new Error(`Groq Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "No response content";

        } catch (error: any) {
            console.error("Groq API Error:", error);
            throw new Error(`Groq Failed: ${error.message || 'Unknown error'}`);
        }
    } else {
        throw new Error(`Unknown LLM Service: ${service}`);
    }
}

app.whenReady().then(() => {
    store.init();
    // loadConfig(); // Removed: Config unified in Store
    initializeLLM();
    createWindow();
    createTray();

    // Helper: Capture currently selected text
    const captureSelection = async (): Promise<string> => {
        // 0. Release modifiers to prevent interference
        releaseModifiers();
        await new Promise(resolve => setTimeout(resolve, 300));

        // 1. Clear clipboard to detect new copy
        clipboard.writeText('');

        // 2. Simulate Copy
        try {
            simulateCopy();
        } catch (err) {
            console.error('Auto-copy failed:', err);
            return '';
        }

        // 3. Poll for clipboard change (max 2.0s)
        let text = '';
        const startTime = Date.now();
        const timeout = 2000;

        while (Date.now() - startTime < timeout) {
            text = clipboard.readText();
            if (text && text.length > 0) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return text;
    };

    // Register copy-paste handler
    const handleGlobalShortcut = async () => {
        console.log('Global Shortcut Triggered (Ctrl+Shift+G)');

        // 0. Release modifiers to prevent interference (e.g., Ctrl+Shift+C in Word)
        releaseModifiers();
        await new Promise(resolve => setTimeout(resolve, 300)); // Increased to 300ms

        // 1. Clear clipboard to detect new copy
        clipboard.writeText('');

        // 2. Simulate Copy
        try {
            simulateCopy();
        } catch (err) {
            console.error('Auto-copy failed:', err);
        }

        // 3. Poll for clipboard change (max 2.0s)
        let text = '';
        const startTime = Date.now();
        const timeout = 2000; // Increased timeout to 2.0s

        while (Date.now() - startTime < timeout) {
            text = clipboard.readText();
            if (text && text.length > 0) {
                break;
            }
            // Wait 100ms before next check (less thrashing)
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (text) {
            console.log('Clipboard text detected, showing window.');
            showWindowAtCursor(text);
        } else {
            console.log('No new text detected (timeout). Using previous or empty.');
            showWindowAtCursor('');
        }
    };

    const handleReapplyShortcut = async () => {
        if (!lastActionPrompt) {
            console.log('No last action to reapply.');
            return;
        }

        console.log('Reapplying last action...');
        const text = await captureSelection();
        if (!text) {
            console.log('No text selected for reapply.');
            return;
        }

        try {
            // Reapply uses the baked-in prompt from last time (effectivePrompt)
            const result = await executeLLM(lastActionPrompt, text);

            // Check output mode
            const outputMode = store.get('outputMode') || 'paste';

            if (outputMode === 'paste') {
                clipboard.writeText(result);
                simulatePaste();
            } else {
                // File mode
                try {
                    const fullPath = await saveContentToFile(result, 'md');
                    console.log('Saved to', fullPath);
                    // shell.showItemInFolder(fullPath); // Optional
                } catch (e) {
                    console.error('Failed to auto-save file:', e);
                }
            }

        } catch (error) {
            console.error("Reapply failed:", error);
        }
    };

    // Register Global Hotkeys
    const primaryHotkey = 'CommandOrControl+Shift+G';
    const reapplyHotkey = 'CommandOrControl+Shift+R';

    globalShortcut.register(primaryHotkey, handleGlobalShortcut);
    globalShortcut.register(reapplyHotkey, handleReapplyShortcut);

    console.log(`${primaryHotkey} registered:`, globalShortcut.isRegistered(primaryHotkey));
    console.log(`${reapplyHotkey} registered:`, globalShortcut.isRegistered(reapplyHotkey));

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
    event.sender.send('config-update', store.getAll());
});

ipcMain.handle('get-settings', () => {
    return {
        service: store.get('service') || 'GEMINI',
        // Return specific keys
        geminiApiKey: store.get('geminiApiKey') || '',
        openRouterApiKey: store.get('openRouterApiKey') || '',
        groqApiKey: store.get('groqApiKey') || '',
        // Legacy support
        apiKey: store.get('apiKey') || '',
        model: store.get('model') || 'gemini-2.0-flash-lite-001',
        outputMode: store.get('outputMode') || 'paste',
        outputDirectory: store.get('outputDirectory') || path.join(app.getPath('documents'), 'Tactio Output'),

        onlyFreeModels: store.get('onlyFreeModels') || false,
        promptVariables: store.get('promptVariables') || [],
        generateMetadata: store.get('generateMetadata') !== false // Default true
    };
});

ipcMain.handle('save-settings', (event, newSettings) => {
    if (newSettings.service !== undefined) store.set('service', newSettings.service);

    // Set specific keys if provided
    if (newSettings.geminiApiKey !== undefined) store.set('geminiApiKey', newSettings.geminiApiKey);
    if (newSettings.openRouterApiKey !== undefined) store.set('openRouterApiKey', newSettings.openRouterApiKey);
    if (newSettings.groqApiKey !== undefined) store.set('groqApiKey', newSettings.groqApiKey);

    // If generic apiKey provided (legacy frontend?), try to map it to current service?
    // Better to rely on frontend sending specific keys now. 
    // But for safety, if apiKey is sent and no specific key is sent:
    if (newSettings.apiKey !== undefined) {
        // Determine where to put it based on SERVICE, only if specific one wasn't sent logic?
        // Simpler: Just rely on specific keys. If 'apiKey' is sent, we ignore it or store it in legacy?
        // Let's store it in legacy just in case, but frontend should update to send specifics.
        store.set('apiKey', newSettings.apiKey);
    }

    if (newSettings.model !== undefined) store.set('model', newSettings.model);
    if (newSettings.outputMode !== undefined) store.set('outputMode', newSettings.outputMode);
    if (newSettings.outputDirectory !== undefined) store.set('outputDirectory', newSettings.outputDirectory);
    if (newSettings.actions !== undefined) store.set('actions', newSettings.actions);

    if (newSettings.onlyFreeModels !== undefined) store.set('onlyFreeModels', newSettings.onlyFreeModels);
    if (newSettings.promptVariables !== undefined) store.set('promptVariables', newSettings.promptVariables);
    if (newSettings.generateMetadata !== undefined) store.set('generateMetadata', newSettings.generateMetadata);

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
                context_length: m.context_length,
                pricing: m.pricing // Pass pricing info
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
    } else if (service === 'GROQ') {
        if (!apiKey) return [];
        try {
            const response = await fetch("https://api.groq.com/openai/v1/models", {
                headers: { "Authorization": `Bearer ${apiKey}` }
            });
            const data = await response.json();
            return data.data.map((m: any) => ({
                id: m.id,
                name: m.id, // Groq uses ID as name essentially
                context_length: m.context_window || 8192, // Fallback
                // pricing: unknown for Groq API standard response usually?
            })).sort((a: any, b: any) => a.id.localeCompare(b.id));
        } catch (e) {
            console.error("Failed to fetch Groq models:", e);
            return [];
        }
    }
    return [];
});

ipcMain.handle('trigger-action', async (event, actionLabel, prompt, style = 'normal') => {
    const totalStart = performance.now();
    console.log(`[Timing] Starting action: ${actionLabel}, Style: ${style}`);

    try {
        // Save prompt for reapply (we might want to save style too later, but for now just prompt)
        // If we want reapply to respect style, we need to save it. 
        // Let's assume reapply uses the same lastActionPrompt which now we should bake the style into? 
        // Or store lastActionStyle?

        // Let's bake the style into a temporary "effective prompt" for execution, 
        // but for reapply we might need to know the style. 
        // Simplest: construct the full prompt here.

        let systemInstruction = "";
        if (style === 'professional') systemInstruction = "System: Respond in a highly professional, business-appropriate tone.\n";
        else if (style === 'casual') systemInstruction = "System: Respond in a casual, friendly, and conversational tone.\n";
        else if (style === 'concise') systemInstruction = "System: Respond strictly with the requested information. Do not add any introductory or concluding remarks. No formatting unless requested.\n";

        const effectivePrompt = systemInstruction ? `${systemInstruction}\n${prompt}` : prompt;
        lastActionPrompt = effectivePrompt;


        // REMOVED: mainWindow?.hide(); // We keep it open for loading state

        const clipStart = performance.now();
        const text = clipboard.readText();
        const clipEnd = performance.now();
        console.log(`[Timing] Clipboard read: ${(clipEnd - clipStart).toFixed(2)}ms`);

        if (!text) return "Clipboard empty";

        console.log(`Executing action: ${actionLabel}`);

        // Substitute Variables (REMOVED)
        // const finalPrompt = substituteVariables(prompt);

        const geminiStart = performance.now();
        const result = await executeLLM(effectivePrompt, text);
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

ipcMain.on('close-window', () => {
    mainWindow?.hide();
});
ipcMain.handle('save-content-to-file', async (event, content, extension = 'md') => {
    try {
        return await saveContentToFile(content, extension);
    } catch (error: any) {
        console.error('Failed to save file:', error);
        throw new Error(`Failed to save file: ${error.message}`);
    }
});

ipcMain.handle('open-output-folder', async () => {
    let outputDir = store.get('outputDirectory');
    if (!outputDir) {
        outputDir = path.join(app.getPath('documents'), 'Tactio Output');
    }
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    await shell.openPath(outputDir);
});

ipcMain.handle('select-output-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        title: 'Select Output Directory'
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});
