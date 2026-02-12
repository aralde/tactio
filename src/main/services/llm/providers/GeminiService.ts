import { LLMService } from '../LLMService';
import { ModelInfo } from '../LLMParameters';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { formatBasePrompt } from '../../../prompts';

export class GeminiService extends LLMService {
    private genAI: GoogleGenerativeAI;
    private geminiModel: any;

    constructor(apiKey: string, model: string) {
        super(apiKey, model);
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.geminiModel = this.genAI.getGenerativeModel({ model: model });
    }

    async generateCompletion(prompt: string, text: string): Promise<string> {
        if (!this.geminiModel) throw new Error("Gemini API not initialized.");

        const fullPrompt = formatBasePrompt(prompt, text);
        try {
            const result = await this.geminiModel.generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        } catch (error: any) {
            console.error("Gemini API Error:", error);
            throw new Error(`Gemini API Failed: ${error.message || 'Unknown error'}`);
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        if (!this.apiKey) return [];

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            if (!response.ok) {
                console.error(`Failed to fetch Gemini models: ${response.statusText}`);
                return this.getFallbackModels();
            }

            const data = await response.json();
            if (!data.models || !Array.isArray(data.models)) {
                console.error('Invalid response format from Gemini API');
                return this.getFallbackModels();
            }

            // Filter for 'generateContent' capable models and map to ModelInfo
            return data.models
                .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map((m: any) => ({
                    id: m.name.replace('models/', ''), // API returns 'models/gemini-pro', we want 'gemini-pro'
                    name: m.displayName || m.name
                }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name));

        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            return this.getFallbackModels();
        }
    }

    private getFallbackModels(): ModelInfo[] {
        return [
            { id: 'gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' }
        ];
    }
}
