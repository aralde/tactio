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

interface HistoryVersion {
    text: string;
    label: string;
    timestamp: number;
}

interface HistoryItem {
    id: string;
    versions: HistoryVersion[];
    timestamp: number; // Last modified
}

const clipboardHistory: HistoryItem[] = [];
const MAX_HISTORY = 20; // Increased history size
let currentConfig: any = null;
let activeClipboardText = '';
let activeHistoryId: string | null = null; // Track which item is currently "active"

window.api.onConfigUpdate((data: any) => {
    // Check if data is the new structure { config, clipboardText } or just config (legacy safety)
    const config = data.config || data;
    currentConfig = config;
    const clipboardText = data.clipboardText || '';

    // Handle incoming clipboard text logic
    if (clipboardText) {
        handleIncomingClipboard(clipboardText);
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
        generateMetadata: generateMetadataCheck.checked,

        // Pass specific model choices explicitly
        geminiModel: (serviceSelect.value === 'GEMINI') ? modelSelect.value : formSettings.geminiModel,
        openRouterModel: (serviceSelect.value === 'OPENROUTER') ? modelSelect.value : formSettings.openRouterModel,
        openaiModel: (serviceSelect.value === 'OPENAI') ? modelSelect.value : formSettings.openaiModel,
        groqModel: (serviceSelect.value === 'GROQ') ? modelSelect.value : formSettings.groqModel,
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

    // Get preferred model for new service
    const preferredModel = getModelForService(newService);

    // Update models
    updateModelList(preferredModel);
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

function getModelForService(service: string) {
    if (service === 'GEMINI') return formSettings.geminiModel || '';
    if (service === 'OPENROUTER') return formSettings.openRouterModel || '';
    if (service === 'OPENAI') return formSettings.openaiModel || '';
    if (service === 'GROQ') return formSettings.groqModel || '';
    return '';
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
        // Logic moved to handleIncomingClipboard and renderHistory
        actionsList.classList.remove('disabled-mode');
    }
}

function handleIncomingClipboard(text: string) {
    activeClipboardText = text;

    // Check if this text already exists in the "latest version" of any history item
    const existingItem = clipboardHistory.find(item => {
        if (item.versions.length > 0) {
            return item.versions[0].text === text; // Check latest
        }
        return false;
    });

    if (existingItem) {
        // It exists, set it as active and move to top
        activeHistoryId = existingItem.id;

        // Move to top logic
        const index = clipboardHistory.indexOf(existingItem);
        if (index > 0) {
            clipboardHistory.splice(index, 1);
            clipboardHistory.unshift(existingItem);
        }
        // Update timestamp? Maybe not if it's identical.
    } else {
        // create new item
        const newItem: HistoryItem = {
            id: generateId(),
            versions: [{
                text: text,
                label: 'Original',
                timestamp: Date.now()
            }],
            timestamp: Date.now()
        };
        clipboardHistory.unshift(newItem);
        activeHistoryId = newItem.id;

        // Trim
        if (clipboardHistory.length > MAX_HISTORY) {
            clipboardHistory.pop();
        }
    }

    renderHistory();
}


function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    clipboardHistory.forEach((item) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'history-item';

        if (item.id === activeHistoryId) {
            itemContainer.classList.add('active');
        }

        // Render Versions
        // We want oldest at bottom? Or newest at top?
        // Usually newest version at TOP is standard for history stacks.
        // So versions[0] is newest.
        item.versions.forEach((version, vIndex) => {
            const versionDiv = document.createElement('div');
            versionDiv.className = 'history-version';

            // If not the last one (visually bottom, which is oldest in our array structure if we iterate normally?),
            // let's stick to: versions[0] is LATEST.

            // We want to differentiate "Original" vs "Transformations"
            // The first item in the array (index 0) is the *latest* version.
            // The last item in the array is the *original*.

            const isLatest = vIndex === 0;
            const isSelected = (item.id === activeHistoryId && activeClipboardText === version.text);

            if (isSelected) {
                versionDiv.classList.add('selected-version');
            }

            // Label
            const metaDiv = document.createElement('div');
            metaDiv.className = 'version-meta';
            const timeString = new Date(version.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            metaDiv.textContent = `${version.label} • ${timeString}`;
            versionDiv.appendChild(metaDiv);

            // Content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'history-content';
            const previewText = version.text.length > 150 ? version.text.substring(0, 150) + '...' : version.text;
            contentDiv.textContent = previewText;
            versionDiv.appendChild(contentDiv);

            // Click -> Select this specific version to be active text
            versionDiv.onclick = async (e) => {
                e.stopPropagation();
                activeHistoryId = item.id;
                activeClipboardText = version.text;

                // Copy to clipboard immediately on click?
                // Per previous logic, yes:
                try {
                    await window.api.copyToClipboard(version.text);
                } catch (e) {
                    console.error("Failed to copy to clipboard", e);
                }

                renderHistory(); // Re-render to show selection state
            };

            // Double Click -> Paste
            versionDiv.ondblclick = (e) => {
                e.stopPropagation();
                performPaste(version.text);
            };

            // Right Click -> Custom Prompt
            versionDiv.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                openCustomPromptModal(version.text);
            };

            // Actions for this version
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'history-actions';

            const pasteBtn = document.createElement('button');
            pasteBtn.className = 'icon-btn';
            pasteBtn.innerHTML = '📋';
            pasteBtn.title = 'Paste / Output';
            pasteBtn.onclick = (e) => {
                e.stopPropagation();
                performPaste(version.text);
            };
            actionsDiv.appendChild(pasteBtn);

            versionDiv.appendChild(actionsDiv);
            itemContainer.appendChild(versionDiv);
        });

        historyList.appendChild(itemContainer);
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
            // If file mode, we might still want to add to version history?
            // Yes, user probably wants to see it happened.
            addVersionToActiveItem(result, label);

            alert(`Saved to: ${filePath}`);
            enableUI(true); // Keep result visible
        } else {
            // Paste mode behavior
            addVersionToActiveItem(result, label);
            enableUI(true); // Keep result visible
        }
    } catch (error) {
        console.error('Action failed:', error);
        alert('Action failed: ' + error); // Simple error feedback
        enableUI(true); // Show result if partial? or just enable actions
    } finally {
        setLoading(false);
    }
}

function enableUI(keepResult: boolean = false) {
    if (actionsList) {
        actionsList.classList.remove('disabled-mode');
    }
    if (resultContainer) {
        if (keepResult) {
            resultContainer.classList.remove('hidden');
        } else {
            resultContainer.classList.add('hidden');
        }
    }
}

function addVersionToActiveItem(text: string, label: string) {
    console.log('Adding version:', label, text.substring(0, 20), 'to', activeHistoryId);
    if (!activeHistoryId) {
        console.warn('No activeHistoryId found. Creating new item fallback.');
        // Fallback: Create new item if for some reason we lost track
        const newItem: HistoryItem = {
            id: generateId(),
            versions: [{
                text: text,
                label: label,
                timestamp: Date.now()
            }],
            timestamp: Date.now()
        };
        clipboardHistory.unshift(newItem);
        activeHistoryId = newItem.id;
        renderHistory();
        return;
    }

    const item = clipboardHistory.find(i => i.id === activeHistoryId);
    if (item) {
        item.versions.unshift({
            text: text,
            label: label,
            timestamp: Date.now()
        });
        item.timestamp = Date.now();
        activeClipboardText = text;
        renderHistory();
    } else {
        console.error('Active history item not found in array:', activeHistoryId);
    }
}

function showResult(text: string) {
    // Deprecated? Or used for pure paste?
    // If we use it, ensure it doesn't block.
    if (actionsList && resultContainer) {
        // actionsList.classList.add('disabled-mode'); // REMOVED BLOCKING
        resultContainer.classList.remove('hidden');
        // addToHistory(text); // Already handled in handleAction via addVersionToActiveItem
    }
}

function showMain() {
    enableUI(false);
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

// Custom Prompt Modal Elements
const customPromptModal = document.getElementById('custom-prompt-modal') as HTMLDivElement;
const customPromptInput = document.getElementById('custom-prompt-input') as HTMLTextAreaElement;
const customPromptApplyBtn = document.getElementById('custom-prompt-apply-btn') as HTMLButtonElement;
const customPromptCancelBtn = document.getElementById('custom-prompt-cancel-btn') as HTMLButtonElement;
let customPromptTargetText = ''; // To store the text we want to apply prompt to

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

    promptManagerModal.classList.remove('hidden');
    showManagerView('form');
}

// ... (existing prompt manager code logic if needed, but we append custom prompt logic here)

// --- Custom Prompt Logic ---

function openCustomPromptModal(text: string) {
    customPromptTargetText = text;
    customPromptInput.value = ''; // Clear previous
    customPromptModal.classList.remove('hidden');
    customPromptInput.focus();
}

if (customPromptCancelBtn) {
    customPromptCancelBtn.onclick = () => {
        customPromptModal.classList.add('hidden');
    };
}

if (customPromptApplyBtn) {
    customPromptApplyBtn.onclick = async () => {
        const prompt = customPromptInput.value.trim();
        if (!prompt) return;

        customPromptModal.classList.add('hidden');

        // Execute Action
        setLoading(true);
        try {
            // Use 'normal' style by default for custom prompts or add a selector?
            // For now, simple 'normal'.
            const result = await window.api.triggerAction('Custom Prompt', prompt, 'normal');

            if (result.startsWith('Error:')) {
                throw new Error(result);
            }

            // Add result to history
            addVersionToActiveItem(result, `Custom: ${prompt.substring(0, 15)}...`);
            enableUI(true);

        } catch (error) {
            console.error('Custom prompt action failed:', error);
            alert('Action failed: ' + error);
            enableUI(true);
        } finally {
            setLoading(false);
        }
    };
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
