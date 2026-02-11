import { app, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { LLMFactory } from '../llm/LLMFactory';

export class FileManager {
    private store: any;

    constructor(store: any) {
        this.store = store;
    }

    async saveContentToFile(content: string, extension: string = 'md'): Promise<string> {
        let outputDir = this.store.get('outputDirectory');
        if (!outputDir) {
            outputDir = path.join(app.getPath('documents'), 'Tactio Output');
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let filename = '';
        let contentToWrite = content;
        const useMetadata = this.store.get('generateMetadata') !== false;

        if (useMetadata) {
            try {
                const metadataPrompt = `
Analyze the following text and generate a JSON object with these fields:
1. "filename": A concise, kebab-case filename (max 50 chars).
2. "summary": A single brief sentence summarizing the content (in the same language as the content).
3. "tags": An array of up to 5 relevant tags starting with # (e.g. ["#code", "#idea"]).

Return ONLY the raw JSON string, no markdown code blocks.
`;
                // Use LLMFactory to get a temporary service instance
                const llmService = LLMFactory.createService(this.store.getAll());
                let llmOutput = await llmService.generateCompletion(metadataPrompt, content.substring(0, 4000));

                llmOutput = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();
                const metadata = JSON.parse(llmOutput);

                if (metadata.filename) {
                    filename = metadata.filename.replace(/[^a-z0-9\-_]/gi, '').trim();
                    if (filename.length > 50) filename = filename.substring(0, 50);
                }

                const summary = metadata.summary || '';
                const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : '';

                if (summary || tags) {
                    contentToWrite = `${summary}\n${tags}\n\n${content}`;
                }

            } catch (e) {
                console.log("Failed to infer metadata, using fallback", e);
            }
        }

        if (!filename || filename.length < 3) {
            const now = new Date();
            const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
            filename = `tactio_${timestamp}`;
        }

        let fullPath = path.join(outputDir, `${filename}.${extension}`);
        let counter = 1;
        while (fs.existsSync(fullPath)) {
            fullPath = path.join(outputDir, `${filename}_${counter}.${extension}`);
            counter++;
        }

        fs.writeFileSync(fullPath, contentToWrite, 'utf8');
        return fullPath;
    }

    async openOutputFolder() {
        let outputDir = this.store.get('outputDirectory');
        if (!outputDir) {
            outputDir = path.join(app.getPath('documents'), 'Tactio Output');
        }
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        await shell.openPath(outputDir);
    }

    async selectOutputDirectory(mainWindow: Electron.BrowserWindow) {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
            title: 'Select Output Directory'
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    }

    async exportActions(mainWindow: Electron.BrowserWindow): Promise<boolean> {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Actions',
            defaultPath: 'tactio-actions.zip',
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (result.canceled || !result.filePath) return false;

        try {
            const zipBase64 = this.store.exportActions();
            if (!zipBase64) return false;

            fs.writeFileSync(result.filePath, Buffer.from(zipBase64, 'base64'));
            return true;
        } catch (e) {
            console.error('Export failed', e);
            throw e;
        }
    }

    async importActions(mainWindow: Electron.BrowserWindow): Promise<boolean> {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Actions',
            filters: [{ name: 'Zip Files', extensions: ['zip'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return false;

        try {
            const content = fs.readFileSync(result.filePaths[0], 'base64');
            this.store.importActions(content);
            return true;
        } catch (e) {
            console.error('Import failed', e);
            throw e;
        }
    }
}
