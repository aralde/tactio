import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';

export class Store {
    private path: string = '';
    private data: Record<string, any>;

    constructor(private opts: { configName: string; defaults: Record<string, any> }) {
        this.data = opts.defaults; // Initial data, will load real data on init
    }

    init() {
        const userDataPath = app.getPath('userData');
        this.path = path.join(userDataPath, this.opts.configName + '.json');
        this.data = parseDataFile(this.path, this.opts.defaults);
    }

    get(key: string): any {
        let value = this.data[key];

        // Decrypt if it's the apiKey and looks likely encrypted (we assume base64 if it's encrypted logic)
        // Simplest check: just try to decrypt if encryption is available
        if (key === 'apiKey' && typeof value === 'string' && safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(value, 'base64');
                // Check if buffer is valid? safeStorage throws if text is not valid encrypted buffer
                value = safeStorage.decryptString(buffer);
            } catch (e) {
                // If fails, assume it was plain text or invalid
            }
        }
        return value;
    }

    set(key: string, val: any): void {
        let valueToStore = val;

        if (key === 'apiKey' && typeof val === 'string' && safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = safeStorage.encryptString(val);
                valueToStore = buffer.toString('base64');
            } catch (e) {
                console.error("Encryption failed", e);
            }
        }

        this.data[key] = valueToStore;
        if (this.path) {
            fs.writeFileSync(this.path, JSON.stringify(this.data));
        }
    }
}

function parseDataFile(filePath: string, defaults: any) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        return defaults;
    }
}
