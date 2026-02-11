export interface LLMConfig {
    service: string;
    model: string;
    // Specific keys
    geminiApiKey?: string;
    openRouterApiKey?: string;
    openaiApiKey?: string;
    groqApiKey?: string;
    // Legacy/Fallback
    apiKey?: string;
}

export interface ModelInfo {
    id: string;
    name: string;
    context_length?: number;
    pricing?: any;
}
