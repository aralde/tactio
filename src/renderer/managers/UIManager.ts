import { AppConfig } from "../types";

export class UIManager {
    // Shared Elements
    public actionsList = document.getElementById('actions-list') as HTMLDivElement;
    public statusBar = document.getElementById('status-bar') as HTMLDivElement;
    public resultContainer = document.getElementById('result-container') as HTMLDivElement;
    public historyList = document.getElementById('history-list') as HTMLDivElement;

    // Controls
    private pinIcon = document.getElementById('pin-icon') as HTMLDivElement;
    private closeBtn = document.getElementById('close-btn') as HTMLDivElement;
    private modeToggle = document.getElementById('mode-toggle') as HTMLDivElement;
    private openFolderBtn = document.getElementById('open-folder-btn') as HTMLButtonElement;
    private toggleOptions = document.querySelectorAll('.toggle-option');
    private settingsIcon = document.getElementById('settings-icon') as HTMLDivElement;

    public currentOutputMode: 'paste' | 'file' = 'paste';

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners() {
        if (this.pinIcon) {
            this.pinIcon.onclick = async () => {
                const isPinned = await window.api.togglePin();
                this.updatePinState(isPinned);
            };
        }

        if (this.closeBtn) {
            this.closeBtn.onclick = () => window.api.closeWindow();
        }

        if (this.openFolderBtn) {
            this.openFolderBtn.onclick = () => window.api.openOutputFolder();
        }

        if (this.modeToggle) {
            this.modeToggle.onclick = async () => {
                this.currentOutputMode = this.currentOutputMode === 'paste' ? 'file' : 'paste';
                this.updateModeUI(this.currentOutputMode);

                // Persist mode
                const settings = await window.api.getSettings();
                settings.outputMode = this.currentOutputMode;
                await window.api.saveSettings(settings);
            };
        }
    }

    public updatePinState(isPinned: boolean) {
        if (isPinned) {
            this.pinIcon.classList.add('pinned');
            this.pinIcon.title = "Unpin (Always on Top)";
        } else {
            this.pinIcon.classList.remove('pinned');
            this.pinIcon.title = "Pin (Always on Top)";
        }
    }

    public updateModeUI(mode: string) {
        this.currentOutputMode = mode as 'paste' | 'file';
        this.toggleOptions.forEach(opt => {
            if (opt.getAttribute('data-mode') === mode) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    public onSettingsClick(callback: () => void) {
        if (this.settingsIcon) {
            this.settingsIcon.onclick = callback;
        }
    }

    public setLoading(isLoading: boolean) {
        if (isLoading) {
            this.actionsList.classList.add('disabled-mode');
            this.resultContainer.classList.add('hidden');
            this.statusBar.classList.remove('hidden');
            document.body.classList.add('loading');
        } else {
            document.body.classList.remove('loading');
            this.statusBar.classList.add('hidden');
            // We don't auto-remove disabled-mode here as result might keep it
        }
    }

    public enableUI(keepResult: boolean = false) {
        if (this.actionsList) {
            this.actionsList.classList.remove('disabled-mode');
        }
        if (this.resultContainer) {
            if (keepResult) {
                this.resultContainer.classList.remove('hidden');
            } else {
                this.resultContainer.classList.add('hidden');
            }
        }
    }

    public showMain() {
        this.enableUI(true); // Show result/history container by default
    }
}
