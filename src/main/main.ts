import { app, ipcMain, clipboard } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Logger } from './logger';
import { Store } from './store';
import { WindowManager } from './services/window/WindowManager';
import { TrayManager } from './services/tray/TrayManager';
import { AutomationManager } from './services/automation/AutomationManager';
import { FileManager } from './services/files/FileManager';
import { LLMFactory } from './services/llm/LLMFactory';
import { LLMConfig } from './services/llm/LLMParameters';
import { simulatePaste } from './automation';

dotenv.config();

// Debug: Force log on startup
console.log('Main process starting...');
Logger.log('Main', 'Process started', { cwd: process.cwd() });

let store: Store;
let windowManager: WindowManager;
let trayManager: TrayManager;
let automationManager: AutomationManager;
let fileManager: FileManager;

app.whenReady().then(() => {
    // Initialize Store
    store = new Store({
        configName: 'user-preferences',
        defaults: {
            service: 'GEMINI',
            apiKey: '',
            model: 'gemini-2.0-flash-lite-001',
            actions: []
        }
    });
    store.init();

    // Initialize Managers
    windowManager = new WindowManager(store);
    windowManager.create();

    trayManager = new TrayManager(windowManager);
    trayManager.create();

    automationManager = new AutomationManager(windowManager, store);
    automationManager.registerGlobalShortcuts();

    fileManager = new FileManager(store);

    app.on('activate', () => {
        if (!windowManager.getWindow()) {
            windowManager.create();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

ipcMain.on('ui-ready', (event) => {
    console.log('Renderer UI ready, sending config');
    windowManager.sendConfig(store.getAll());
});

ipcMain.handle('get-settings', () => {
    const s = store;
    // Return configuration object for Renderer
    return {
        service: s.get('service') || 'GEMINI',
        // Keys
        geminiApiKey: s.get('geminiApiKey') || '',
        openRouterApiKey: s.get('openRouterApiKey') || '',
        openaiApiKey: s.get('openaiApiKey') || '',
        groqApiKey: s.get('groqApiKey') || '',
        // Models
        geminiModel: s.get('geminiModel') || '',
        openRouterModel: s.get('openRouterModel') || '',
        openaiModel: s.get('openaiModel') || '',
        groqModel: s.get('groqModel') || '',
        // Legacy
        apiKey: s.get('apiKey') || '',
        model: s.get('model') || 'gemini-2.0-flash-lite-001',
        outputMode: s.get('outputMode') || 'paste',
        outputDirectory: s.get('outputDirectory') || path.join(app.getPath('documents'), 'Tactio Output'),
        // Misc
        promptVariables: s.get('promptVariables') || [],
        generateMetadata: s.get('generateMetadata') !== false
    };
});

ipcMain.handle('save-settings', (event, newSettings) => {
    // Map settings to store
    if (newSettings.service !== undefined) store.set('service', newSettings.service);

    // API Keys
    if (newSettings.geminiApiKey !== undefined) store.set('geminiApiKey', newSettings.geminiApiKey);
    if (newSettings.openRouterApiKey !== undefined) store.set('openRouterApiKey', newSettings.openRouterApiKey);
    if (newSettings.openaiApiKey !== undefined) store.set('openaiApiKey', newSettings.openaiApiKey);
    if (newSettings.groqApiKey !== undefined) store.set('groqApiKey', newSettings.groqApiKey);

    // Models
    if (newSettings.geminiModel !== undefined) store.set('geminiModel', newSettings.geminiModel);
    if (newSettings.openRouterModel !== undefined) store.set('openRouterModel', newSettings.openRouterModel);
    if (newSettings.openaiModel !== undefined) store.set('openaiModel', newSettings.openaiModel);
    if (newSettings.groqModel !== undefined) store.set('groqModel', newSettings.groqModel);

    // Generic/Legacy
    if (newSettings.apiKey !== undefined) store.set('apiKey', newSettings.apiKey);
    if (newSettings.model !== undefined) store.set('model', newSettings.model);

    // App Config
    if (newSettings.outputMode !== undefined) store.set('outputMode', newSettings.outputMode);
    if (newSettings.outputDirectory !== undefined) store.set('outputDirectory', newSettings.outputDirectory);
    if (newSettings.actions !== undefined) store.set('actions', newSettings.actions);
    if (newSettings.promptVariables !== undefined) store.set('promptVariables', newSettings.promptVariables);
    if (newSettings.generateMetadata !== undefined) store.set('generateMetadata', newSettings.generateMetadata);

    return true;
});

ipcMain.handle('get-models', async (event, service, apiKey) => {
    // Construct temp config for Factory
    const tempConfig: any = { service };

    // Map the incoming generic 'apiKey' to the specific service key for the factory
    if (service === 'GEMINI') tempConfig.geminiApiKey = apiKey;
    else if (service === 'OPENROUTER') tempConfig.openRouterApiKey = apiKey;
    else if (service === 'OPENAI') tempConfig.openaiApiKey = apiKey;
    else if (service === 'GROQ') tempConfig.groqApiKey = apiKey;

    tempConfig.apiKey = apiKey; // Fallback

    try {
        const serviceInstance = LLMFactory.createService(tempConfig as LLMConfig);
        return await serviceInstance.getModels();
    } catch (error) {
        console.error("Error fetching models:", error);
        return [];
    }
});

// Helper: Substitute variables
function substituteVariables(prompt: string): string {
    const variables = store.get('promptVariables') || [];
    let finalPrompt = prompt;
    variables.forEach((v: any) => {
        if (v.key && v.selected) {
            const regex = new RegExp(`{{${v.key}}}`, 'gi');
            finalPrompt = finalPrompt.replace(regex, v.selected);
        }
    });
    return finalPrompt;
}

ipcMain.handle('trigger-action', async (event, actionLabel, prompt, style = 'normal') => {
    const totalStart = performance.now();
    console.log(`[Timing] Starting action: ${actionLabel}, Style: ${style}`);

    try {
        let systemInstruction = "";
        if (style === 'professional') systemInstruction = "System: Respond in a highly professional, business-appropriate tone.\n";
        else if (style === 'casual') systemInstruction = "System: Respond in a casual, friendly, and conversational tone.\n";
        else if (style === 'concise') systemInstruction = "System: Respond strictly with the requested information. Do not add any introductory or concluding remarks. No formatting unless requested.\n";

        const effectivePrompt = systemInstruction ? `${systemInstruction}\n${prompt}` : prompt;
        const finalPrompt = substituteVariables(effectivePrompt);

        // Store for reapply
        automationManager.setLastActionPrompt(finalPrompt);

        const text = clipboard.readText();

        if (!text) return "Clipboard empty";

        console.log(`Executing action: ${actionLabel}`);

        // Execute LLM
        const config = store.getAll() as unknown as LLMConfig;
        const llmService = LLMFactory.createService(config);

        const result = await llmService.generateCompletion(finalPrompt, text);

        const totalEnd = performance.now();
        console.log(`[Timing] Total duration: ${(totalEnd - totalStart).toFixed(2)}ms`);

        return result;

    } catch (error: any) {
        console.error("Error in trigger-action:", error);
        return `Error: ${error.message}`;
    }
});

ipcMain.handle('paste-result', async (event, text) => {
    console.log('User requested paste.');
    try {
        clipboard.writeText(text);
        windowManager.minimize();
        windowManager.hide();

        await new Promise(resolve => setTimeout(resolve, 800));
        simulatePaste();
    } catch (error) {
        console.error("Error in paste-result:", error);
    }
});

ipcMain.handle('toggle-pin', (event) => {
    return windowManager.togglePin();
});

ipcMain.on('close-window', () => {
    windowManager.hide();
});

ipcMain.handle('copy-to-clipboard', async (event, text) => {
    try {
        clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Failed to write to clipboard:', error);
        return false;
    }
});

ipcMain.handle('save-content-to-file', async (event, content, extension = 'md') => {
    try {
        return await fileManager.saveContentToFile(content, extension);
    } catch (error: any) {
        console.error('Failed to save file:', error);
        throw new Error(`Failed to save file: ${error.message}`);
    }
});

ipcMain.handle('open-output-folder', async () => {
    await fileManager.openOutputFolder();
});

// Log handler
ipcMain.on('log', (event, message, data) => {
    Logger.log('Renderer', message, data);
});

ipcMain.handle('select-output-directory', async () => {
    const win = windowManager.getWindow();
    if (!win) return null;
    return await fileManager.selectOutputDirectory(win);
});

ipcMain.handle('export-actions', async () => {
    const win = windowManager.getWindow();
    if (!win) return false;
    return await fileManager.exportActions(win);
});

ipcMain.handle('import-actions', async () => {
    const win = windowManager.getWindow();
    if (!win) return false;
    const result = await fileManager.importActions(win);
    if (result) {
        windowManager.sendConfig(store.getAll());
    }
    return result;
});
