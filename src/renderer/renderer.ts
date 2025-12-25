// Define the API exposed by preload
interface WindowAPI {
    triggerAction: (label: string, prompt: string) => Promise<string>;
    onConfigUpdate: (callback: (config: any) => void) => void;
    uiReady: () => void;
    pasteResult: (text: string) => Promise<void>;
}

interface Window {
    api: WindowAPI;
}

const actionsList = document.getElementById('actions-list') as HTMLDivElement;
const statusBar = document.getElementById('status-bar') as HTMLDivElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;

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
