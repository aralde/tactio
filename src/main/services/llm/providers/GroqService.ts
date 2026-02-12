import { LLMService } from '../LLMService';
import { ModelInfo } from '../LLMParameters';
import { formatBasePrompt } from '../../../prompts';

export class GroqService extends LLMService {
    async generateCompletion(prompt: string, text: string): Promise<string> {
        if (!this.apiKey) throw new Error("Groq API Key missing.");

        const fullPrompt = formatBasePrompt(prompt, text);

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
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
                throw new Error(`Groq Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "No response content";

        } catch (error: any) {
            console.error("Groq API Error:", error);
            throw new Error(`Groq Failed: ${error.message || 'Unknown error'}`);
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        if (!this.apiKey) return [];
        try {
            const response = await fetch("https://api.groq.com/openai/v1/models", {
                headers: { "Authorization": `Bearer ${this.apiKey}` }
            });
            const data = await response.json();
            return data.data.map((m: any) => ({
                id: m.id,
                name: m.id,
                context_length: m.context_window || 8192
            })).sort((a: any, b: any) => a.id.localeCompare(b.id));
        } catch (e) {
            console.error("Failed to fetch Groq models:", e);
            return [];
        }
    }
}
