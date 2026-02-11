import { HistoryItem, HistoryVersion } from "../types";
import { UIManager } from "./UIManager";

export class HistoryManager {
    private clipboardHistory: HistoryItem[] = [];
    private MAX_HISTORY = 20;
    private activeHistoryId: string | null = null;
    private activeClipboardText = '';

    // Dependencies
    private uiManager: UIManager;
    // Callback for when a user selects an item (to update app state) or requests actions
    private onPaste: (text: string) => void;
    private onCustomPrompt: (text: string) => void;

    constructor(uiManager: UIManager, onPaste: (text: string) => void, onCustomPrompt: (text: string) => void) {
        this.uiManager = uiManager;
        this.onPaste = onPaste;
        this.onCustomPrompt = onCustomPrompt;
    }

    public handleIncomingClipboard(text: string) {
        if (window.api && window.api.log) window.api.log(`HistoryManager: Handling incoming clipboard`, { textLength: text.length });
        this.activeClipboardText = text;

        const existingItem = this.clipboardHistory.find(item => {
            if (item.versions.length > 0) {
                return item.versions[0].text === text;
            }
            return false;
        });

        if (existingItem) {
            this.activeHistoryId = existingItem.id;
            const index = this.clipboardHistory.indexOf(existingItem);
            if (index > 0) {
                this.clipboardHistory.splice(index, 1);
                this.clipboardHistory.unshift(existingItem);
            }
        } else {
            const newItem: HistoryItem = {
                id: this.generateId(),
                versions: [{
                    text: text,
                    label: 'Original',
                    timestamp: Date.now()
                }],
                timestamp: Date.now()
            };
            this.clipboardHistory.unshift(newItem);
            this.activeHistoryId = newItem.id;

            if (this.clipboardHistory.length > this.MAX_HISTORY) {
                this.clipboardHistory.pop();
            }
        }

        this.renderHistory();
    }

    public addVersionToActiveItem(text: string, label: string) {
        if (!this.activeHistoryId) {
            const newItem: HistoryItem = {
                id: this.generateId(),
                versions: [{
                    text: text,
                    label: label,
                    timestamp: Date.now()
                }],
                timestamp: Date.now()
            };
            this.clipboardHistory.unshift(newItem);
            this.activeHistoryId = newItem.id;
            this.activeClipboardText = text;
            this.renderHistory();
            return;
        }

        const item = this.clipboardHistory.find(i => i.id === this.activeHistoryId);
        if (item) {
            item.versions.unshift({
                text: text,
                label: label,
                timestamp: Date.now()
            });
            item.timestamp = Date.now();
            this.activeClipboardText = text;
            this.renderHistory();
        }
    }

    public getActiveText(): string {
        return this.activeClipboardText;
    }

    public setActiveText(text: string) {
        this.activeClipboardText = text;
    }

    private generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    private renderHistory() {
        if (!this.uiManager.historyList) {
            if (window.api && window.api.log) window.api.log('HistoryManager: historyList element not found!');
            return;
        }
        if (window.api && window.api.log) window.api.log(`HistoryManager: Rendering history. Items: ${this.clipboardHistory.length}`);
        this.uiManager.historyList.innerHTML = '';

        this.clipboardHistory.forEach((item) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'history-item';

            if (item.id === this.activeHistoryId) {
                itemContainer.classList.add('active');
            }

            item.versions.forEach((version, vIndex) => {
                const versionDiv = document.createElement('div');
                versionDiv.className = 'history-version';

                const isSelected = (item.id === this.activeHistoryId && this.activeClipboardText === version.text);

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

                // Click -> Select
                versionDiv.onclick = async (e) => {
                    e.stopPropagation();
                    this.activeHistoryId = item.id;
                    this.activeClipboardText = version.text;

                    try {
                        await window.api.copyToClipboard(version.text);
                    } catch (e) {
                        console.error("Failed to copy to clipboard", e);
                    }

                    this.renderHistory();
                };

                // Double Click -> Paste
                versionDiv.ondblclick = (e) => {
                    e.stopPropagation();
                    this.onPaste(version.text);
                };

                // Right Click -> Custom Prompt
                versionDiv.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.onCustomPrompt(version.text);
                };

                // Actions for this version
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'history-actions';

                // Custom Prompt Button
                const customPromptBtn = document.createElement('button');
                customPromptBtn.className = 'icon-btn';
                customPromptBtn.innerHTML = '🪄';
                customPromptBtn.title = 'Custom AI Prompt (Right Click)';
                customPromptBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.onCustomPrompt(version.text);
                };
                actionsDiv.appendChild(customPromptBtn);

                const pasteBtn = document.createElement('button');
                pasteBtn.className = 'icon-btn';
                pasteBtn.innerHTML = '📋';
                pasteBtn.title = 'Paste / Output';
                pasteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.onPaste(version.text);
                };
                actionsDiv.appendChild(pasteBtn);

                versionDiv.appendChild(actionsDiv);
                itemContainer.appendChild(versionDiv);
            });

            this.uiManager.historyList.appendChild(itemContainer);
        });
    }
}
