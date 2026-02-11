import { LLMService } from '../LLMService';
import { ModelInfo } from '../LLMParameters';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

        const fullPrompt = `${prompt}\n\n"${text}"`;
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
        // Hardcoded list as per original implementation fallback
        return [
            { id: 'gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' }
        ];
    }
}
