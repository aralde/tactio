import { ModelInfo } from './LLMParameters';

export abstract class LLMService {
    protected apiKey: string;
    protected model: string;

    constructor(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    abstract generateCompletion(prompt: string, text: string): Promise<string>;
    abstract getModels(): Promise<ModelInfo[]>;
}
