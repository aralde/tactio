export interface WindowAPI {
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
    log: (message: string, data?: any) => void;
}

declare global {
    interface Window {
        api: WindowAPI;
    }
}

export interface HistoryVersion {
    text: string;
    label: string;
    timestamp: number;
}

export interface HistoryItem {
    id: string;
    versions: HistoryVersion[];
    timestamp: number;
}

export interface Action {
    label: string;
    prompt: string;
    icon?: string;
    style?: string;
}

export interface AppConfig {
    service: string;
    geminiApiKey?: string;
    openRouterApiKey?: string;
    openaiApiKey?: string;
    groqApiKey?: string;

    geminiModel?: string;
    openRouterModel?: string;
    openaiModel?: string;
    groqModel?: string;

    apiKey?: string; // Legacy
    model?: string; // Legacy

    outputMode?: 'paste' | 'file';
    outputDirectory?: string;
    generateMetadata?: boolean;

    actions: Action[];
    promptVariables?: any[];
}
