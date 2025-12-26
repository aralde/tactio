// Define the API exposed by preload
interface WindowAPI {
    triggerAction: (label: string, prompt: string) => Promise<string>;
    onConfigUpdate: (callback: (config: any) => void) => void;
    uiReady: () => void;
    pasteResult: (text: string) => Promise<void>;
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<boolean>;
    getModels: (service: string, apiKey: string) => Promise<any[]>;
    togglePin: () => Promise<boolean>;
    closeWindow: () => void;
}

interface Window {
    api: WindowAPI;
}

const actionsList = document.getElementById('actions-list') as HTMLDivElement;
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
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById('cancel-settings-btn') as HTMLButtonElement;

const clipboardHistory: string[] = [];
const MAX_HISTORY = 3;

window.api.onConfigUpdate((data: any) => {
    // Check if data is the new structure { config, clipboardText } or just config (legacy safety)
    const config = data.config || data;
    const clipboardText = data.clipboardText || '';

    renderActions(config.actions);

    // Initial State: Show actions AND show clipboard content in the result card
    showInitialState(clipboardText);
});

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

settingsIcon.onclick = async () => {
    const settings = await window.api.getSettings();
    populateSettingsForm(settings);
    settingsModal.classList.remove('hidden');
};

cancelSettingsBtn.onclick = () => {
    settingsModal.classList.add('hidden');
};

saveSettingsBtn.onclick = async () => {
    const newSettings = {
        service: serviceSelect.value,
        apiKey: apiKeyInput.value,
        model: modelSelect.value
    };
    await window.api.saveSettings(newSettings);
    settingsModal.classList.add('hidden');
    // Optional: Show success toast
};

serviceSelect.onchange = async () => {
    updateModelList();
};

apiKeyInput.onblur = async () => {
    // Refresh models when API key changes (needed for OpenRouter)
    if (serviceSelect.value === 'OPENROUTER') {
        updateModelList();
    }
};

async function populateSettingsForm(settings: any) {
    serviceSelect.value = settings.service;
    apiKeyInput.value = settings.apiKey;

    // Initial fetch of models
    await updateModelList(settings.model);
}

async function updateModelList(selectedModelId: string | null = null) {
    const service = serviceSelect.value;
    const apiKey = apiKeyInput.value;

    modelSelect.innerHTML = '<option>Loading...</option>';
    modelSelect.disabled = true;

    try {
        const models = await window.api.getModels(service, apiKey);
        modelSelect.innerHTML = '';

        if (models.length === 0) {
            const option = document.createElement('option');
            option.text = "No models found (Check API Key)";
            modelSelect.add(option);
        } else {
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.id;
                option.text = m.name || m.id;
                modelSelect.add(option);
            });
        }
    } catch (e) {
        modelSelect.innerHTML = '<option>Error loading models</option>';
    } finally {
        modelSelect.disabled = false;
        // Restore selection if exists in new list
        if (selectedModelId) {
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

        // Truncate logic
        const previewText = text.length > 200 ? text.substring(0, 200) + '...' : text;
        item.textContent = previewText;
        item.title = "Click to paste";

        item.onclick = async () => {
            // Visual feedback
            item.style.borderColor = '#0078d4';
            await window.api.pasteResult(text);
            showMain();
        };

        historyList.appendChild(item);
    });
}

function renderActions(actions: any[]) {
    actionsList.innerHTML = '';

    if (!actions || actions.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'message';
        msg.textContent = 'No actions defined in config.json';
        actionsList.appendChild(msg);
        return;
    }

    actions.forEach(action => {
        const button = document.createElement('button');
        button.className = 'action-btn';
        // Use icon if available, otherwise fallback to first letter of labels
        button.textContent = action.icon || action.label.substring(0, 2);
        button.title = action.label; // Tooltip content

        button.onclick = () => handleAction(action.label, action.prompt);
        actionsList.appendChild(button);
    });
}

async function handleAction(label: string, prompt: string) {
    setLoading(true);
    try {
        const result = await window.api.triggerAction(label, prompt);
        showResult(result);
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
