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
    openPromptCatalog: () => void;
    openExternal: (url: string) => void;
    log: (message: string, data?: any) => void;

    agentGet: (id: string) => Promise<AgentTask | undefined>;
    agentStart: (dir: string, intent: string) => Promise<string>;
    agentRetry: (id: string) => Promise<string>;
    agentRefine: (id: string, text: string) => Promise<void>;
    agentApprove: (id: string) => Promise<void>;
    agentCancel: (id: string) => Promise<void>;
    agentUndo: (id: string) => Promise<void>;
    agentStatus: () => Promise<{ path: string; problem?: string }>;
    agentSelectFolder: () => Promise<string | null>;
    agentSelectClaude: () => Promise<string | null>;
    agentFolderMenuGet: () => Promise<{ supported: boolean; enabled: boolean }>;
    agentFolderMenuSet: (enabled: boolean) => Promise<boolean>;
    agentFit: (height: number) => void;
    agentHide: () => void;
    onAgentShow: (callback: (view: { dir?: string; taskId?: string }) => void) => void;
    onAgentTask: (callback: (task: AgentTask) => void) => void;
}

export interface AgentChange {
    op: string;
    path: string;
    to?: string;
    detail?: string;
}

export interface AgentTask {
    id: string;
    dir: string;
    intent: string;
    state: 'proposing' | 'awaiting_input' | 'proposed' | 'applying' | 'applied' | 'undoing' | 'undone' | 'cancelled' | 'failed';
    proposal?: {
        summary: string;
        plan: string[];
        changes: AgentChange[];
        questions?: { question: string; hint?: string; options: string[] }[];
    };
    applied?: { done: AgentChange[]; failed: { change: AgentChange; reason: string }[] };
    unexpected?: AgentChange[];
    undone?: { done: AgentChange[]; failed: { change: AgentChange; reason: string }[] };
    error?: string;
    updatedAt: string;
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
    claudePath?: string;
}
