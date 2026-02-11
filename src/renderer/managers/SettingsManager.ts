import { AppConfig } from "../types";

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

            // Specific models
            geminiModel: (this.serviceSelect.value === 'GEMINI') ? this.modelSelect.value : this.currentSettings.geminiModel,
            openRouterModel: (this.serviceSelect.value === 'OPENROUTER') ? this.modelSelect.value : this.currentSettings.openRouterModel,
            openaiModel: (this.serviceSelect.value === 'OPENAI') ? this.modelSelect.value : this.currentSettings.openaiModel,
            groqModel: (this.serviceSelect.value === 'GROQ') ? this.modelSelect.value : this.currentSettings.groqModel,
        };

        await window.api.saveSettings(newSettings);
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
