// Define the API exposed by preload
interface WindowAPI {
    triggerAction: (label: string, prompt: string, style?: string) => Promise<string>;
    onConfigUpdate: (callback: (config: any) => void) => void;
    uiReady: () => void;
    pasteResult: (text: string) => Promise<void>;
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<boolean>;
    getModels: (service: string, apiKey: string) => Promise<any[]>;
    togglePin: () => Promise<boolean>;
    closeWindow: () => void;
    saveContentToFile: (content: string, extension?: string) => Promise<string>;
    openOutputFolder: () => Promise<void>;
    selectOutputDirectory: () => Promise<string | null>;
    exportActions: () => Promise<boolean>;
    importActions: () => Promise<boolean>;
    copyToClipboard: (text: string) => Promise<boolean>;
}

interface Window {
    api: WindowAPI;
}

const actionsList = document.getElementById('actions-list') as HTMLDivElement;
// Variables container removed
const statusBar = document.getElementById('status-bar') as HTMLDivElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;
const settingsIcon = document.getElementById('settings-icon') as HTMLDivElement;
const pinIcon = document.getElementById('pin-icon') as HTMLDivElement;
const closeBtn = document.getElementById('close-btn') as HTMLDivElement;
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;

// Settings Form Handlers
const serviceSelect = document.getElementById('service-select') as HTMLSelectElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const outputDirInput = document.getElementById('output-dir-input') as HTMLInputElement; // New
const selectDirBtn = document.getElementById('select-dir-btn') as HTMLButtonElement; // New
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById('cancel-settings-btn') as HTMLButtonElement;

// New Checkbox
const modelSearchInput = document.getElementById('model-search-input') as HTMLInputElement;
// const onlyFreeModelsCheck = document.getElementById('only-free-models-check') as HTMLInputElement; // Removed
// const freeModelsContainer = document.getElementById('free-models-container') as HTMLDivElement; // Removed

const modeToggle = document.getElementById('mode-toggle') as HTMLDivElement;
const openFolderBtn = document.getElementById('open-folder-btn') as HTMLButtonElement;
const toggleOptions = document.querySelectorAll('.toggle-option');

let currentOutputMode = 'paste'; // 'paste' | 'file'

const clipboardHistory: string[] = [];
const MAX_HISTORY = 20; // Increased history size
let currentConfig: any = null;
let activeClipboardText = '';

window.api.onConfigUpdate((data: any) => {
    // Check if data is the new structure { config, clipboardText } or just config (legacy safety)
    const config = data.config || data;
    currentConfig = config;
    const clipboardText = data.clipboardText || '';
    if (clipboardText) {
        activeClipboardText = clipboardText;
    }

    renderActions(config.actions);
    // renderVariables(config.promptVariables); // REMOVED

    // Load saved mode
    if (config.outputMode) {
        currentOutputMode = config.outputMode;
        updateModeUI(currentOutputMode);
    }

    // Initial State: Show actions AND show clipboard content in the result card
    showInitialState(clipboardText);
});

// --- Mode Logic ---
if (modeToggle) {
    modeToggle.onclick = async () => {
        // Toggle mode
        currentOutputMode = currentOutputMode === 'paste' ? 'file' : 'paste';
        updateModeUI(currentOutputMode);

        // Use a "hack" to persist this temporarily or permanently via saveSettings? 
        // For now, let's just keep it in session state or update settings in background?
        // User asked for a button to choose, usually this transforms behavior immediately.
        // Let's autosave this setting so it remembers next time.
        const settings = await window.api.getSettings();
        settings.outputMode = currentOutputMode;
        await window.api.saveSettings(settings);
    };
}

if (openFolderBtn) {
    openFolderBtn.onclick = () => {
        window.api.openOutputFolder();
    };
}

function updateModeUI(mode: string) {
    toggleOptions.forEach(opt => {
        if (opt.getAttribute('data-mode') === mode) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
}

// --- Pin Logic ---
if (pinIcon) {
    pinIcon.onclick = async () => {
        const isPinned = await window.api.togglePin();
        if (isPinned) {
            pinIcon.classList.add('pinned');
            pinIcon.title = "Unpin (Always on Top)";
        } else {
            pinIcon.classList.remove('pinned');
            pinIcon.title = "Pin (Always on Top)";
        }
    };
}

if (closeBtn) {
    closeBtn.onclick = () => {
        window.api.closeWindow();
    };
}

// --- Settings Logic ---

// Local state for settings form
let formSettings: any = {};

settingsIcon.onclick = async () => {
    const settings = await window.api.getSettings();
    formSettings = settings; // Store for form usage
    populateSettingsForm(settings);
    settingsModal.classList.remove('hidden');
};

cancelSettingsBtn.onclick = () => {
    settingsModal.classList.add('hidden');
};

saveSettingsBtn.onclick = async () => {
    // Update the current service's key in our formSettings before saving
    // (in case user edited it but didn't trigger blur/change events or just to be safe)
    const currentService = serviceSelect.value;
    updateKeyInSettings(currentService, apiKeyInput.value);

    const newSettings = {
        service: serviceSelect.value,
        // Send all keys back (modified or original)
        geminiApiKey: formSettings.geminiApiKey,
        openRouterApiKey: formSettings.openRouterApiKey,
        openaiApiKey: formSettings.openaiApiKey,
        groqApiKey: formSettings.groqApiKey,
        // Legacy fallback - keeping it consistent with current service just in case
        apiKey: apiKeyInput.value,

        model: modelSelect.value,
        outputDirectory: outputDirInput.value,
        // onlyFreeModels: onlyFreeModelsCheck.checked, // Removed
        generateMetadata: generateMetadataCheck.checked
    };
    await window.api.saveSettings(newSettings);
    settingsModal.classList.add('hidden');
};

serviceSelect.onchange = async () => {
    // 1. Save the key from the PREVIOUS service into formSettings
    // Actually, we don't know the previous service easily unless we track it.
    // Better approach: always update formSettings on input change (oninput/onblur).
    // So here we just load the NEW service's key.

    // CURRENT Issue: If I type a key, then switch service, the typed key might be lost if I didn't blur?
    // Let's assume onblur handles it, or we handle it here if we tracked 'lastService'.
    // For simplicity, let's just update formSettings based on the displayed value for the *current* 
    // service before switching, but looking up "current" from select.value returns the NEW one.
    // So we need to store 'lastService' or rely on oninput. 
    // Let's stick to updating formSettings on 'input' event of the text box.

    const newService = serviceSelect.value;

    // Load key for new service
    apiKeyInput.value = getKeyForService(newService);

    // Update models
    updateModelList();
};

apiKeyInput.oninput = () => {
    updateKeyInSettings(serviceSelect.value, apiKeyInput.value);
}

apiKeyInput.onblur = async () => {
    // Refresh models when API key changes (needed for OpenRouter/Groq/OpenAI)
    const service = serviceSelect.value;
    if (service === 'OPENROUTER' || service === 'GROQ' || service === 'OPENAI') {
        updateModelList();
    }
};

function getKeyForService(service: string) {
    if (service === 'GEMINI') return formSettings.geminiApiKey || '';
    if (service === 'OPENROUTER') return formSettings.openRouterApiKey || '';
    if (service === 'OPENAI') return formSettings.openaiApiKey || '';
    if (service === 'GROQ') return formSettings.groqApiKey || '';
    return '';
}

function updateKeyInSettings(service: string, key: string) {
    if (service === 'GEMINI') formSettings.geminiApiKey = key;
    else if (service === 'OPENROUTER') formSettings.openRouterApiKey = key;
    else if (service === 'OPENAI') formSettings.openaiApiKey = key;
    else if (service === 'GROQ') formSettings.groqApiKey = key;
}

async function populateSettingsForm(settings: any) {
    serviceSelect.value = settings.service;
    apiKeyInput.value = getKeyForService(settings.service);

    // Fallback for migration: if specific key is empty but 'apiKey' (legacy) exists AND match service?
    // handled in store.ts migration, so we should be good.

    // onlyFreeModelsCheck.checked = settings.onlyFreeModels || false; // Removed

    // Refresh model list with the current filter
    await updateModelList(settings.model);

    outputDirInput.value = settings.outputDirectory || '';
    generateMetadataCheck.checked = settings.generateMetadata !== false;
}

const generateMetadataCheck = document.getElementById('generate-metadata-check') as HTMLInputElement;

if (modelSearchInput) {
    modelSearchInput.oninput = () => {
        updateModelList(modelSelect.value); // Keep current selection if possible
    };
}

if (selectDirBtn) {
    selectDirBtn.onclick = async () => {
        const path = await window.api.selectOutputDirectory();
        if (path) {
            outputDirInput.value = path;
        }
    };
}

const importActionsBtn = document.getElementById('import-actions-btn') as HTMLButtonElement;
const exportActionsBtn = document.getElementById('export-actions-btn') as HTMLButtonElement;

if (importActionsBtn) {
    importActionsBtn.onclick = async () => {
        const success = await window.api.importActions();
        if (success) {
            alert('Actions imported successfully!');
            // Refresh logic handled by onConfigUpdate
        }
    };
}

if (exportActionsBtn) {
    exportActionsBtn.onclick = async () => {
        const success = await window.api.exportActions();
        if (success) alert('Actions exported successfully!');
    };
}

async function updateModelList(selectedModelId: string | null = null) {
    const service = serviceSelect.value;
    const apiKey = apiKeyInput.value;

    modelSelect.innerHTML = '<option>Loading...</option>';
    modelSelect.disabled = true;

    // Toggle Search Input Visibility (Optional: Hide if no models? No, keep it.)
    if (modelSearchInput) {
        if (service === 'GEMINI' || service === 'GROQ' || service === 'OPENROUTER' || service === 'OPENAI') {
            modelSearchInput.disabled = false;
            // If we wanted to hide/show, we could.
        } else {
            // modelSearchInput.classList.add('hidden');
        }
    }

    try {
        const models = await window.api.getModels(service, apiKey);
        modelSelect.innerHTML = '';

        if (models.length === 0) {
            const option = document.createElement('option');
            option.text = "No models found (Check API Key)";
            modelSelect.add(option);
        } else {
            // Filter by search text
            const searchText = modelSearchInput ? modelSearchInput.value.toLowerCase() : '';

            const filteredModels = models.filter(m => {
                if (!searchText) return true;
                return (m.name || m.id).toLowerCase().includes(searchText);
            });

            if (filteredModels.length === 0 && searchText) {
                const option = document.createElement('option');
                option.text = `No models match "${searchText}"`;
                modelSelect.add(option);
            } else {
                filteredModels.forEach((m: any) => {
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.text = m.name || m.id;
                    modelSelect.add(option);
                });
            }
        }
    } catch (e) {
        modelSelect.innerHTML = '<option>Error loading models</option>';
    } finally {
        modelSelect.disabled = false;
        // Restore selection if exists in new list
        if (selectedModelId) {
            // Check if selected model is in the current filtered list?
            // If strictly filtering, it might be gone. But usually we want to keep it if valid?
            // Or just try to set it.
            modelSelect.value = selectedModelId;
        }
    }
}

// --- End Settings Logic ---


function showInitialState(text: string) {
    if (resultContainer && historyList) {
        resultContainer.classList.remove('hidden');
        if (text) {
            addToHistory(text);
        }
        actionsList.classList.remove('disabled-mode');
    }
}

function addToHistory(text: string) {
    // 1. Remove if already exists (to move to top)
    const index = clipboardHistory.indexOf(text);
    if (index > -1) {
        clipboardHistory.splice(index, 1);
    }

    // 2. Add to front
    clipboardHistory.unshift(text);

    // 3. Trim
    if (clipboardHistory.length > MAX_HISTORY) {
        clipboardHistory.pop();
    }

    renderHistory();
}

function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    clipboardHistory.forEach((text, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        if (text === activeClipboardText) {
            item.classList.add('active');
        }

        // Truncate logic
        const previewText = text.length > 200 ? text.substring(0, 200) + '...' : text;

        // Content container
        const content = document.createElement('div');
        content.className = 'history-content';
        content.textContent = previewText;
        item.appendChild(content);

        // Actions container (Paste button)
        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const pasteBtn = document.createElement('button');
        pasteBtn.className = 'icon-btn'; // Re-use icon-btn class
        pasteBtn.innerHTML = '📋'; // Clipboard icon or similar
        pasteBtn.title = 'Paste / Output';
        pasteBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent selection trigger
            performPaste(text);
        };
        actions.appendChild(pasteBtn);
        item.appendChild(actions);

        item.title = "Click to Select, Double-Click to Paste";

        // Click -> Select
        item.onclick = async () => {
            // Optimistic update
            activeClipboardText = text;
            renderHistory();

            try {
                await window.api.copyToClipboard(text);
            } catch (e) {
                console.error("Failed to copy to clipboard", e);
            }
        };

        // Double Click -> Paste
        item.ondblclick = () => {
            performPaste(text);
        };

        historyList.appendChild(item);
    });
}

async function performPaste(text: string) {
    // Visual feedback handled by renderHistory update usually, 
    // but here we just execute.
    if (currentOutputMode === 'file') {
        try {
            const filePath = await window.api.saveContentToFile(text, 'md');
            alert(`Saved to: ${filePath}`);
        } catch (e) {
            alert('Failed to save file: ' + e);
        }
    } else {
        await window.api.pasteResult(text);
    }
    // Update active text to what was pasted?
    activeClipboardText = text;
    showMain();
}

function renderActions(actions: any[]) {
    actionsList.innerHTML = '';

    if (!actions || actions.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'message';
        msg.textContent = 'No actions found. Add one below.';
        actionsList.appendChild(msg);
    } else {
        actions.forEach((action, index) => {
            const button = document.createElement('button');
            button.className = 'action-btn';
            button.textContent = action.icon || action.label.substring(0, 2);

            const shortcutHint = index < 9 ? ` (Alt+${index + 1})` : '';
            button.title = action.label + shortcutHint;

            button.onclick = () => handleAction(action.label, action.prompt, action.style);
            actionsList.appendChild(button);
        });
    }

    // Add + Button (Always visible)
    const addBtn = document.createElement('button');
    addBtn.className = 'action-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Manage Prompts';
    addBtn.style.border = '1px dashed #555';
    addBtn.onclick = () => openPromptManager();
    actionsList.appendChild(addBtn);
}

// Global renderVariables REMOVED per user request

async function handleAction(label: string, prompt: string, style?: string) {
    setLoading(true);
    try {
        const result = await window.api.triggerAction(label, prompt, style);

        if (result.startsWith('Error:')) {
            throw new Error(result);
        }

        if (currentOutputMode === 'file') {
            const filePath = await window.api.saveContentToFile(result, 'md');
            addToHistory(result); // Store clean text, not the message
            alert(`Saved to: ${filePath}`);
            showMain();
        } else {
            // Paste mode behavior
            showResult(result);
        }
    } catch (error) {
        console.error('Action failed:', error);
        alert('Action failed: ' + error); // Simple error feedback
        showMain();
    } finally {
        setLoading(false);
    }
}

function showResult(text: string) {
    if (actionsList && resultContainer) {
        actionsList.classList.add('disabled-mode');
        resultContainer.classList.remove('hidden');
        addToHistory(text);
    }
}

function showMain() {
    // using global constants
    if (actionsList && resultContainer) {
        actionsList.classList.remove('disabled-mode');
        resultContainer.classList.add('hidden');
    }
}

function setLoading(isLoading: boolean) {
    if (isLoading) {
        // Don't hide actions, just disable them
        actionsList.classList.add('disabled-mode');
        // Hide result container if it was showing? Maybe keep it? 
        // Usually we want to clear previous result or show loading.
        resultContainer.classList.add('hidden');

        statusBar.classList.remove('hidden');
        document.body.classList.add('loading');
    } else {
        document.body.classList.remove('loading');
        statusBar.classList.add('hidden');

        // Note: We don't remove 'disabled-mode' here blindly, 
        // because showResult() might want to keep it.
        // showMain() removes it.
    }
}

showMain();

// Signal readiness
window.api.uiReady();

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Only handle Alt + Number
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

    // Ignore if input focused
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

    // Ignore if modals open
    if (!settingsModal.classList.contains('hidden') || !promptManagerModal.classList.contains('hidden')) return;

    // Ignore if loading/disabled
    if (actionsList.classList.contains('disabled-mode')) return;

    const key = e.key;
    if (/^[1-9]$/.test(key)) {
        const index = parseInt(key) - 1;
        if (currentConfig && currentConfig.actions && currentConfig.actions[index]) {
            const action = currentConfig.actions[index];
            // Visual feedback could be added here (e.g. simulate click)
            handleAction(action.label, action.prompt, action.style);
        }
    }
});

// --- Prompt Manager Logic ---

const promptManagerModal = document.getElementById('prompt-manager-modal') as HTMLDivElement;
const managerListView = document.getElementById('manager-list-view') as HTMLDivElement;
const managerFormView = document.getElementById('manager-form-view') as HTMLDivElement;
const managerPromptsList = document.getElementById('manager-prompts-list') as HTMLDivElement;

const managerAddBtn = document.getElementById('manager-add-btn') as HTMLButtonElement;
const managerCloseBtn = document.getElementById('manager-close-btn') as HTMLButtonElement;

// Emoji Picker
const emojiPickerBtn = document.getElementById('emoji-picker-btn') as HTMLButtonElement;
const emojiPalette = document.getElementById('emoji-palette') as HTMLDivElement;
const commonEmojis = [
    '📝', '🔍', '✨', '🔥', '💡', '🚀', '✅', '❌',
    '🇪🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇮🇹', '🇯🇵', '🇨🇳', '🇷🇺',
    '📧', '💬', '📞', '📅', '📊', '📈', '📉', '📎',
    '🤖', '🧠', '💻', '📱', '⌨️', '🖱️', '🔋', '🔌',
    '💼', '📁', '📂', '🗂️', '🗑️', '🔒', '🔓', '🔑',
    '🐛', '🐞', '🕷️', '🕸️', '🦠', '🧬', '🔬', '🔭',
    '❤️', '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪'
];

// Form elements
const promptLabelInput = document.getElementById('prompt-label-input') as HTMLInputElement;
const promptIconInput = document.getElementById('prompt-icon-input') as HTMLInputElement;
const promptStyleSelect = document.getElementById('prompt-style-select') as HTMLSelectElement; // New
const promptTextInput = document.getElementById('prompt-text-input') as HTMLTextAreaElement;
const editIndexInput = document.getElementById('edit-index-input') as HTMLInputElement;

const promptSaveBtn = document.getElementById('prompt-save-btn') as HTMLButtonElement;
const promptCancelBtn = document.getElementById('prompt-cancel-btn') as HTMLButtonElement;
const promptDeleteBtn = document.getElementById('prompt-delete-btn') as HTMLButtonElement;

function openPromptManager() {
    if (!currentConfig) return;
    renderManagerList();
    promptManagerModal.classList.remove('hidden');
    showManagerView('list');
}

function showManagerView(view: 'list' | 'form') {
    if (view === 'list') {
        managerListView.classList.remove('hidden');
        managerFormView.classList.add('hidden');
    } else {
        managerListView.classList.add('hidden');
        managerFormView.classList.remove('hidden');
    }
}

function renderManagerList() {
    managerPromptsList.innerHTML = '';
    const actions = currentConfig.actions || [];

    actions.forEach((action: any, index: number) => {
        const item = document.createElement('div');
        item.className = 'manager-item';
        item.onclick = () => editPrompt(index);

        item.innerHTML = `
            <div class="manager-item-icon">${action.icon || '📄'}</div>
            <div class="manager-item-label">${action.label}</div>
            <div class="manager-item-style" style="font-size:10px; color:#666; margin-right:5px;">${action.style || ''}</div>
            <div class="manager-item-edit">Edit ></div>
        `;
        managerPromptsList.appendChild(item);
    });
}

function editPrompt(index: number) {
    const action = currentConfig.actions[index];
    promptLabelInput.value = action.label;
    promptIconInput.value = action.icon || '';
    promptStyleSelect.value = action.style || 'concise'; // Load style
    promptTextInput.value = action.prompt;
    editIndexInput.value = index.toString();

    promptDeleteBtn.classList.remove('hidden'); // Show delete for existing
    const title = document.getElementById('manager-form-title');
    if (title) title.textContent = 'Edit Prompt';

    showManagerView('form');
}

if (emojiPickerBtn) {
    emojiPickerBtn.onclick = () => {
        if (emojiPalette.classList.contains('hidden')) {
            renderEmojiPalette();
            emojiPalette.classList.remove('hidden');
        } else {
            emojiPalette.classList.add('hidden');
        }
    };
}

function renderEmojiPalette() {
    emojiPalette.innerHTML = '';
    commonEmojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-option';
        span.textContent = emoji;
        span.onclick = () => {
            promptIconInput.value = emoji;
            emojiPalette.classList.add('hidden');
        };
        emojiPalette.appendChild(span);
    });
}

const variableInsertionContainer = document.getElementById('variable-insertion-container') as HTMLDivElement;
function renderVariableChips() {
    if (!variableInsertionContainer) return;
    variableInsertionContainer.innerHTML = '';

    if (!currentConfig || !currentConfig.promptVariables) return;

    currentConfig.promptVariables.forEach((v: any) => {
        const chip = document.createElement('span');
        chip.className = 'variable-chip';
        chip.textContent = `{{${v.key}}}`;
        chip.title = `Insert ${v.label} variable`;

        chip.onclick = () => {
            insertAtCursor(promptTextInput, `{{${v.key}}}`);
        };

        variableInsertionContainer.appendChild(chip);
    });
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;

    textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
}

if (managerAddBtn) {
    managerAddBtn.onclick = () => {
        promptLabelInput.value = '';
        promptIconInput.value = '';
        promptStyleSelect.value = 'normal';
        promptTextInput.value = '';
        editIndexInput.value = '-1'; // New item

        promptDeleteBtn.classList.add('hidden'); // Hide delete for new
        emojiPalette.classList.add('hidden'); // Ensure palette is closed
        const title = document.getElementById('manager-form-title');
        if (title) title.textContent = 'New Prompt';

        showManagerView('form');
    };
}

if (managerCloseBtn) {
    managerCloseBtn.onclick = () => {
        promptManagerModal.classList.add('hidden');
    };
}

if (promptCancelBtn) {
    promptCancelBtn.onclick = () => {
        showManagerView('list');
    };
}

if (promptSaveBtn) {
    promptSaveBtn.onclick = async () => {
        const label = promptLabelInput.value.trim();
        const icon = promptIconInput.value.trim();
        const style = promptStyleSelect.value;
        const prompt = promptTextInput.value.trim();
        const index = parseInt(editIndexInput.value);

        if (!label || !prompt) {
            alert('Label and Prompt are required.');
            return;
        }

        const newAction = { label, icon, style, prompt }; // Save style
        const actions = [...(currentConfig.actions || [])];

        if (index >= 0) {
            actions[index] = newAction;
        } else {
            actions.push(newAction);
        }

        // Optimistic update
        currentConfig.actions = actions;

        // Save
        await window.api.saveSettings({ actions });

        // Refresh
        renderManagerList();
        showManagerView('list');

        // Also refresh main UI
        renderActions(actions);
    };
}

if (promptDeleteBtn) {
    promptDeleteBtn.onclick = async () => {
        if (!confirm('Are you sure you want to delete this prompt?')) return;

        const index = parseInt(editIndexInput.value);
        if (index >= 0) {
            const actions = [...(currentConfig.actions || [])];
            actions.splice(index, 1);

            currentConfig.actions = actions;
            await window.api.saveSettings({ actions });

            renderManagerList();
            showManagerView('list');
            renderActions(actions);
        }
    };
}
