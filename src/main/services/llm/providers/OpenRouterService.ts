import { LLMService } from '../LLMService';
import { ModelInfo } from '../LLMParameters';
import { formatBasePrompt } from '../../../prompts';

export class OpenRouterService extends LLMService {
    async generateCompletion(prompt: string, text: string): Promise<string> {
        if (!this.apiKey) throw new Error("OpenRouter API Key missing.");

        const fullPrompt = formatBasePrompt(prompt, text);

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://pureprompts.vercel.app/",
                    "X-Title": "Tactio"
                },
                body: JSON.stringify({
                    "model": this.model,
                    "messages": [
                        { "role": "user", "content": fullPrompt }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "No response content";

        } catch (error: any) {
            console.error("OpenRouter API Error:", error);
            throw new Error(`OpenRouter Failed: ${error.message || 'Unknown error'}`);
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        if (!this.apiKey) return [];
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            const data = await response.json();
            return data.data.map((m: any) => ({
                id: m.id,
                name: m.name,
                context_length: m.context_length,
                pricing: m.pricing
            })).sort((a: any, b: any) => a.id.localeCompare(b.id));
        } catch (e) {
            console.error("Failed to fetch OpenRouter models:", e);
            return [];
        }
    }
}
