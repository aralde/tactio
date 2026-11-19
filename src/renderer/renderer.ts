import { AppConfig, Action } from "./types";
import { UIManager } from "./managers/UIManager";
import { SettingsManager } from "./managers/SettingsManager";
import { HistoryManager } from "./managers/HistoryManager";
import { ActionsManager } from "./managers/ActionsManager";
import { PromptManager } from "./managers/PromptManager";

// Wrap everything in an async IIFE to allow top-level await and error handling
(async () => {
    let uiManager: UIManager;
    let settingsManager: SettingsManager;
    let historyManager: HistoryManager;
    let actionsManager: ActionsManager;
    let promptManager: PromptManager;

    try {
        if (window.api && window.api.log) {
            window.api.log('Renderer process started');
        } else {
            console.log('Renderer process started (log api not available yet?)');
        }

        // --- Initialization ---
        uiManager = new UIManager();
        if (window.api && window.api.log) window.api.log('UIManager initialized');

        settingsManager = new SettingsManager();
        if (window.api && window.api.log) window.api.log('SettingsManager initialized');

        // --- Core Logic Handlers ---
        const handlePaste = async (text: string) => {
            if (uiManager.currentOutputMode === 'file') {
                try {
                    const filePath = await window.api.saveContentToFile(text, 'md');
                    alert(`Saved to: ${filePath}`);
                } catch (e) {
                    alert('Failed to save file: ' + e);
                }
            } else {
                await window.api.pasteResult(text);
            }
        };

        const handleCustomPrompt = (text: string) => {
            const modal = document.getElementById('custom-prompt-modal') as HTMLDivElement;
            const input = document.getElementById('custom-prompt-input') as HTMLTextAreaElement;
            const applyBtn = document.getElementById('custom-prompt-apply-btn') as HTMLButtonElement;
            const cancelBtn = document.getElementById('custom-prompt-cancel-btn') as HTMLButtonElement;

            if (modal) {
                input.value = '';
                modal.classList.remove('hidden');
                input.focus();

                const close = () => {
                    modal.classList.add('hidden');
                    applyBtn.onclick = null;
                };

                cancelBtn.onclick = close;

                applyBtn.onclick = async () => {
                    const prompt = input.value;
                    if (!prompt) return;
                    close();
                    triggerAction('Custom', prompt, 'concise', text);
                }
            }
        };

        historyManager = new HistoryManager(uiManager, handlePaste, handleCustomPrompt);
        if (window.api && window.api.log) window.api.log('HistoryManager initialized');

        const triggerAction = async (label: string, prompt: string, style: string = 'concise', textOverride?: string) => {
            uiManager.setLoading(true);

            if (textOverride) {
                await window.api.copyToClipboard(textOverride);
            }

            try {
                if (window.api && window.api.log) window.api.log(`Triggering action: ${label}`);
                const result = await window.api.triggerAction(label, prompt, style);

                if (result.startsWith('Error:')) {
                    throw new Error(result);
                }

                if (uiManager.currentOutputMode === 'file') {
                    const filePath = await window.api.saveContentToFile(result, 'md');
                    historyManager.addVersionToActiveItem(result, label);
                    alert(`Saved to: ${filePath}`);
                    uiManager.enableUI(true);
                } else {
                    historyManager.addVersionToActiveItem(result, label);
                    uiManager.enableUI(true);
                }

            } catch (error) {
                console.error('Action failed:', error);
                if (window.api && window.api.log) window.api.log('Action failed', { error: String(error) });
                alert('Action failed: ' + error);
                uiManager.enableUI(true);
            } finally {
                uiManager.setLoading(false);
            }
        };

        actionsManager = new ActionsManager(
            uiManager,
            triggerAction,
            () => {
                window.api.getSettings().then(settings => {
                    promptManager.open(settings.actions || []);
                });
            }
        );
        if (window.api && window.api.log) window.api.log('ActionsManager initialized');

        const onSaveActions = async (newActions: Action[]) => {
            const settings = await window.api.getSettings();
            settings.actions = newActions;
            await window.api.saveSettings(settings);
        };

        promptManager = new PromptManager(onSaveActions);
        if (window.api && window.api.log) window.api.log('PromptManager initialized');

        // --- IPC Events ---
        window.api.onConfigUpdate((data: any) => {
            // Log config update but avoid spamming huge objects
            // window.api.log('Config update received'); 

            const config = data.config || data;
            const clipboardText = data.clipboardText || '';

            if (clipboardText && clipboardText.trim().length > 0) {
                historyManager.handleIncomingClipboard(clipboardText);
                uiManager.showMain();
            }

            actionsManager.render(config.actions);
            // If the prompt manager is currently open, we should update its internal state
            // so if a deep link added a prompt, it shows up immediately in the list
            if (promptManager) {
                promptManager.updateAndRender(config.actions);
            }

            uiManager.updateModeUI(config.outputMode);
        });

        // --- Catalog Links (One-time setup) ---
        const catalogBtn = document.getElementById('catalog-icon');
        if (catalogBtn) {
            catalogBtn.addEventListener('click', () => {
                if (window.api && window.api.openPromptCatalog) {
                    window.api.openPromptCatalog();
                }
            });
        }
        const managerLibLink = document.getElementById('manager-open-library-link');
        if (managerLibLink) {
            managerLibLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.api && window.api.openPromptCatalog) {
                    window.api.openPromptCatalog();
                }
            });
        }

        uiManager.onSettingsClick(() => settingsManager.open());

        // --- Global Shortcuts ---
        document.addEventListener('keydown', (e) => {
            if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

            if (document.querySelector('.modal:not(.hidden)')) return;
            if (!document.getElementById('settings-modal')?.classList.contains('hidden')) return;
            if (!document.getElementById('prompt-manager-modal')?.classList.contains('hidden')) return;

            if (uiManager.actionsList.classList.contains('disabled-mode')) return;

            const key = e.key;
            if (/^[1-9]$/.test(key)) {
                const index = parseInt(key) - 1;
                const action = actionsManager.getActionByIndex(index);
                if (action) {
                    triggerAction(action.label, action.prompt, action.style);
                }
            }
        });

        window.api.uiReady();
        if (window.api && window.api.log) window.api.log('Renderer ready signal sent');

    } catch (error) {
        console.error('Renderer initialization failed:', error);
        if (window.api && window.api.log) {
            window.api.log('FATAL: Renderer initialization failed', { error: String(error) });
        }
        alert('Renderer failed to initialize: ' + error);
    }
})();
