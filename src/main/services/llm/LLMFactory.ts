import { LLMService } from './LLMService';
import { LLMConfig } from './LLMParameters';
import { GeminiService } from './providers/GeminiService';
import { OpenRouterService } from './providers/OpenRouterService';
import { OpenAIService } from './providers/OpenAIService';
import { GroqService } from './providers/GroqService';

export class LLMFactory {
    static createService(config: LLMConfig): LLMService {
        const service = config.service || 'GEMINI';
        const model = config.model || 'gemini-2.0-flash-lite-001';

        // Resolve API Key
        let apiKey = '';
        if (service === 'GEMINI') apiKey = config.geminiApiKey || config.apiKey || '';
        else if (service === 'OPENROUTER') apiKey = config.openRouterApiKey || config.apiKey || '';
        else if (service === 'OPENAI') apiKey = config.openaiApiKey || config.apiKey || '';
        else if (service === 'GROQ') apiKey = config.groqApiKey || config.apiKey || '';

        // Fallback if specific key logic fails but generic is there
        if (!apiKey) apiKey = config.apiKey || '';

        switch (service) {
            case 'GEMINI':
                return new GeminiService(apiKey, model);
            case 'OPENROUTER':
                return new OpenRouterService(apiKey, model);
            case 'OPENAI':
                return new OpenAIService(apiKey, model);
            case 'GROQ':
                return new GroqService(apiKey, model);
            default:
                console.warn(`Unknown service ${service}, defaulting to Gemini`);
                return new GeminiService(apiKey, model);
        }
    }
}
