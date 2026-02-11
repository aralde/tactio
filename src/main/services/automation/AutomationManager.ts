import { globalShortcut, clipboard, app } from 'electron';
import { simulateCopy, simulatePaste, releaseModifiers } from '../../automation'; // ../../ from src/main/services/automation to src/main/automation
import { WindowManager } from '../window/WindowManager';
import { LLMFactory } from '../llm/LLMFactory';
import { LLMService } from '../llm/LLMService';

export class AutomationManager {
    private windowManager: WindowManager;
    private store: any;
    private lastActionPrompt: string | null = null;

    constructor(windowManager: WindowManager, store: any) {
        this.windowManager = windowManager;
        this.store = store;
    }

    registerGlobalShortcuts() {
        const primaryHotkey = 'CommandOrControl+Shift+G';
        const reapplyHotkey = 'CommandOrControl+Shift+R';

        globalShortcut.register(primaryHotkey, () => this.handleGlobalShortcut());
        globalShortcut.register(reapplyHotkey, () => this.handleReapplyShortcut());

        console.log(`${primaryHotkey} registered:`, globalShortcut.isRegistered(primaryHotkey));
        console.log(`${reapplyHotkey} registered:`, globalShortcut.isRegistered(reapplyHotkey));
    }

    private async handleGlobalShortcut() {
        console.log('Global Shortcut Triggered (Ctrl+Shift+G)');
        const text = await this.captureSelection();
        if (text) {
            console.log('Clipboard text detected, showing window.');
            this.windowManager.showAtCursor(text);
        } else {
            console.log('No new text detected (timeout). Using previous or empty.');
            this.windowManager.showAtCursor('');
        }
    }

    private async handleReapplyShortcut() {
        if (!this.lastActionPrompt) {
            console.log('No last action to reapply.');
            return;
        }

        console.log('Reapplying last action...');
        const text = await this.captureSelection();
        if (!text) {
            console.log('No text selected for reapply.');
            return;
        }

        try {
            // Re-instantiate LLM Service based on current config 
            // (or cache it in Manager, but creating fresh ensures config updates apply)
            const llmService = LLMFactory.createService(this.store.getAll());

            const result = await llmService.generateCompletion(this.lastActionPrompt, text);

            const outputMode = this.store.get('outputMode') || 'paste';

            if (outputMode === 'paste') {
                clipboard.writeText(result);
                // We need to wait a bit and hide window? No window is not open here usually.
                // Just paste.
                simulatePaste();
            } else {
                // File mode - handled via FileManager (todo)
                // For now, assume FileManager is available or log error
                console.log('File mode reapply not fully implemented in refactor yet, falling back to paste');
                clipboard.writeText(result);
                simulatePaste();
            }

        } catch (error) {
            console.error("Reapply failed:", error);
        }
    }

    async captureSelection(): Promise<string> {
        releaseModifiers();
        await new Promise(resolve => setTimeout(resolve, 300));

        clipboard.writeText('');
        try {
            simulateCopy();
        } catch (err) {
            console.error('Auto-copy failed:', err);
            return '';
        }

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
    }

    setLastActionPrompt(prompt: string) {
        this.lastActionPrompt = prompt;
    }
}
