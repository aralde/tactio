import { AgentCli, AppConfig } from "../types";

const CLI_LABELS: Record<AgentCli, string> = { claude: 'Claude Code', opencode: 'OpenCode', agy: 'Antigravity CLI' };

/** What each CLI can't be held to as tightly as Claude Code, shown under the picker. */
const CLI_NOTES: Record<AgentCli, string> = {
    claude: '',
    opencode: 'OpenCode has no result schema: Tactio asks for the JSON in the prompt and checks it. Its permissions still allow only reading, editing files and mv, mkdir and cp.',
    agy: 'Each run gets its own temporary home with your login, so your GEMINI.md and settings are left out. Commands are limited to mv, mkdir and cp.'
};

export class SettingsManager {
    // Elements
    private modal = document.getElementById('settings-modal') as HTMLDivElement;
    private serviceSelect = document.getElementById('service-select') as HTMLSelectElement;
    private apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    private modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    private outputDirInput = document.getElementById('output-dir-input') as HTMLInputElement;
    private selectDirBtn = document.getElementById('select-dir-btn') as HTMLButtonElement;
    private saveBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
    private cancelBtn = document.getElementById('cancel-settings-btn') as HTMLButtonElement;
    private modelSearchInput = document.getElementById('model-search-input') as HTMLInputElement;
    private generateMetadataCheck = document.getElementById('generate-metadata-check') as HTMLInputElement;

    // Actions Management
    private importActionsBtn = document.getElementById('import-actions-btn') as HTMLButtonElement;
    private exportActionsBtn = document.getElementById('export-actions-btn') as HTMLButtonElement;
    private githubLink = document.getElementById('github-link') as HTMLAnchorElement;

    // Folder agent
    private agentCliSelect = document.getElementById('agent-cli-select') as HTMLSelectElement;
    private agentPathLabel = document.getElementById('agent-path-label') as HTMLLabelElement;
    private agentModelRow = document.getElementById('agent-model-row') as HTMLDivElement;
    private agentModelInput = document.getElementById('agent-model-input') as HTMLInputElement;
    private agentCliNote = document.getElementById('agent-cli-note') as HTMLParagraphElement;
    // Each CLI keeps its own path and model while the picker moves between them.
    private agentPaths: Record<AgentCli, string> = { claude: '', opencode: '', agy: '' };
    private agentModels: Record<AgentCli, string> = { claude: '', opencode: '', agy: '' };
    private shownCli: AgentCli = 'claude';
    private claudePathInput = document.getElementById('claude-path-input') as HTMLInputElement;
    private claudePathBtn = document.getElementById('claude-path-btn') as HTMLButtonElement;
    private folderMenuRow = document.getElementById('folder-menu-row') as HTMLDivElement;
    private folderMenuCheck = document.getElementById('folder-menu-check') as HTMLInputElement;
    private folderMenuEnabled = false;

    private currentSettings: any = {};

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.cancelBtn.onclick = () => this.hide();

        this.saveBtn.onclick = async () => {
            await this.saveSettings();
            this.hide();
        };

        this.serviceSelect.onchange = async () => {
            const newService = this.serviceSelect.value;
            this.apiKeyInput.value = this.getKeyForService(newService);
            const preferredModel = this.getModelForService(newService);
            await this.updateModelList(preferredModel);
        };

        this.apiKeyInput.oninput = () => {
            this.updateKeyInSettings(this.serviceSelect.value, this.apiKeyInput.value);
        };

        this.apiKeyInput.onblur = async () => {
            const service = this.serviceSelect.value;
            if (['OPENROUTER', 'GROQ', 'OPENAI'].includes(service)) {
                await this.updateModelList();
            }
        };

        if (this.modelSearchInput) {
            this.modelSearchInput.oninput = () => {
                this.updateModelList(this.modelSelect.value);
            };
        }

        if (this.selectDirBtn) {
            this.selectDirBtn.onclick = async () => {
                const path = await window.api.selectOutputDirectory();
                if (path) this.outputDirInput.value = path;
            };
        }

        if (this.importActionsBtn) {
            this.importActionsBtn.onclick = async () => {
                const success = await window.api.importActions();
                if (success) alert('Actions imported successfully!');
            };
        }

        if (this.exportActionsBtn) {
            this.exportActionsBtn.onclick = async () => {
                const success = await window.api.exportActions();
                if (success) alert('Actions exported successfully!');
            };
        }

        this.claudePathBtn.onclick = async () => {
            const path = await window.api.agentSelectClaude(this.shownCli);
            if (path) this.claudePathInput.value = path;
        };

        this.agentCliSelect.onchange = () => this.showCli(this.agentCliSelect.value as AgentCli);

        if (this.githubLink) {
            this.githubLink.onclick = (e) => {
                e.preventDefault();
                window.api.openExternal('https://github.com/aralde/tactio');
            };
        }
    }

    public async open() {
        const settings = await window.api.getSettings();
        this.currentSettings = settings;
        this.populateForm(settings);
        this.modal.classList.remove('hidden');
    }

    public hide() {
        this.modal.classList.add('hidden');
    }

    private async populateForm(settings: any) {
        this.serviceSelect.value = settings.service;
        this.apiKeyInput.value = this.getKeyForService(settings.service);
        this.outputDirInput.value = settings.outputDirectory || '';
        this.generateMetadataCheck.checked = settings.generateMetadata !== false;
        this.agentPaths = { claude: settings.claudePath || '', opencode: settings.opencodePath || '', agy: settings.agyPath || '' };
        this.agentModels = { claude: '', opencode: settings.opencodeModel || '', agy: settings.agyModel || '' };
        this.agentCliSelect.value = settings.agentCli || 'claude';
        this.shownCli = this.agentCliSelect.value as AgentCli;
        this.showCli(this.shownCli, false);

        const menu = await window.api.agentFolderMenuGet();
        this.folderMenuRow.classList.toggle('hidden', !menu.supported);
        this.folderMenuEnabled = menu.enabled;
        this.folderMenuCheck.checked = menu.enabled;

        await this.updateModelList(settings.model);
    }

    private async saveSettings() {
        // Update current service key just in case
        this.updateKeyInSettings(this.serviceSelect.value, this.apiKeyInput.value);

        const newSettings = {
            service: this.serviceSelect.value,
            geminiApiKey: this.currentSettings.geminiApiKey,
            openRouterApiKey: this.currentSettings.openRouterApiKey,
            openaiApiKey: this.currentSettings.openaiApiKey,
            groqApiKey: this.currentSettings.groqApiKey,

            // Legacy fallbacks
            apiKey: this.apiKeyInput.value,

            model: this.modelSelect.value,
            outputDirectory: this.outputDirInput.value,
            generateMetadata: this.generateMetadataCheck.checked,
            ...this.agentSettings(),

            // Specific models
            geminiModel: (this.serviceSelect.value === 'GEMINI') ? this.modelSelect.value : this.currentSettings.geminiModel,
            openRouterModel: (this.serviceSelect.value === 'OPENROUTER') ? this.modelSelect.value : this.currentSettings.openRouterModel,
            openaiModel: (this.serviceSelect.value === 'OPENAI') ? this.modelSelect.value : this.currentSettings.openaiModel,
            groqModel: (this.serviceSelect.value === 'GROQ') ? this.modelSelect.value : this.currentSettings.groqModel,
        };

        await window.api.saveSettings(newSettings);

        if (this.folderMenuCheck.checked !== this.folderMenuEnabled) {
            try {
                this.folderMenuEnabled = await window.api.agentFolderMenuSet(this.folderMenuCheck.checked);
            } catch (e) {
                alert('Could not change the folder menu: ' + e);
            }
        }
    }

    /** Keeps what was typed for the CLI on screen, then shows another one's path, model and note. */
    private showCli(cli: AgentCli, keep = true) {
        if (keep) this.keepShownCli();
        this.shownCli = cli;
        this.agentPathLabel.textContent = `${CLI_LABELS[cli]} path:`;
        this.claudePathInput.value = this.agentPaths[cli];
        this.agentModelRow.classList.toggle('hidden', cli === 'claude');
        this.agentModelInput.value = this.agentModels[cli];
        this.agentModelInput.placeholder = cli === 'opencode' ? "OpenCode's default (provider/model)" : "Antigravity's default (see `agy models`)";
        this.agentCliNote.textContent = CLI_NOTES[cli];
        this.agentCliNote.classList.toggle('hidden', !CLI_NOTES[cli]);
    }

    private keepShownCli() {
        this.agentPaths[this.shownCli] = this.claudePathInput.value.trim();
        if (this.shownCli !== 'claude') this.agentModels[this.shownCli] = this.agentModelInput.value.trim();
    }

    private agentSettings() {
        this.keepShownCli();
        return {
            agentCli: this.agentCliSelect.value,
            claudePath: this.agentPaths.claude,
            opencodePath: this.agentPaths.opencode,
            agyPath: this.agentPaths.agy,
            opencodeModel: this.agentModels.opencode,
            agyModel: this.agentModels.agy
        };
    }

    private getKeyForService(service: string) {
        if (service === 'GEMINI') return this.currentSettings.geminiApiKey || '';
        if (service === 'OPENROUTER') return this.currentSettings.openRouterApiKey || '';
        if (service === 'OPENAI') return this.currentSettings.openaiApiKey || '';
        if (service === 'GROQ') return this.currentSettings.groqApiKey || '';
        return '';
    }

    private updateKeyInSettings(service: string, key: string) {
        if (service === 'GEMINI') this.currentSettings.geminiApiKey = key;
        else if (service === 'OPENROUTER') this.currentSettings.openRouterApiKey = key;
        else if (service === 'OPENAI') this.currentSettings.openaiApiKey = key;
        else if (service === 'GROQ') this.currentSettings.groqApiKey = key;
    }

    private getModelForService(service: string) {
        if (service === 'GEMINI') return this.currentSettings.geminiModel || '';
        if (service === 'OPENROUTER') return this.currentSettings.openRouterModel || '';
        if (service === 'OPENAI') return this.currentSettings.openaiModel || '';
        if (service === 'GROQ') return this.currentSettings.groqModel || '';
        return '';
    }

    private async updateModelList(selectedModelId: string | null = null) {
        const service = this.serviceSelect.value;
        const apiKey = this.apiKeyInput.value;

        this.modelSelect.innerHTML = '<option>Loading...</option>';
        this.modelSelect.disabled = true;

        if (this.modelSearchInput) {
            this.modelSearchInput.disabled = false; // Always enable search
        }

        try {
            const models = await window.api.getModels(service, apiKey);
            this.modelSelect.innerHTML = '';

            if (models.length === 0) {
                const option = document.createElement('option');
                option.text = "No models found (Check API Key)";
                this.modelSelect.add(option);
            } else {
                const searchText = this.modelSearchInput ? this.modelSearchInput.value.toLowerCase() : '';

                const filteredModels = models.filter((m: any) => {
                    if (!searchText) return true;
                    return (m.name || m.id).toLowerCase().includes(searchText);
                });

                if (filteredModels.length === 0 && searchText) {
                    const option = document.createElement('option');
                    option.text = `No models match "${searchText}"`;
                    this.modelSelect.add(option);
                } else {
                    filteredModels.forEach((m: any) => {
                        const option = document.createElement('option');
                        option.value = m.id;
                        option.text = m.name || m.id;
                        this.modelSelect.add(option);
                    });
                }
            }
        } catch (e) {
            this.modelSelect.innerHTML = '<option>Error loading models</option>';
        } finally {
            this.modelSelect.disabled = false;
            if (selectedModelId) {
                this.modelSelect.value = selectedModelId;
            }
        }
    }
}
