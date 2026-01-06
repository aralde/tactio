import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';

export class Store {
    private path: string = '';
    private data: Record<string, any>;

    constructor(private opts: { configName: string; defaults: Record<string, any> }) {
        this.data = opts.defaults;
    }

    init() {
        const isDev = !app.isPackaged;
        // In production/portable, look next to the executable. In dev, look in root.
        // We check PORTABLE_EXECUTABLE_DIR first, which is set by electron-builder for portable apps.
        const basePath = isDev
            ? process.cwd()
            : (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')));

        // We force the name to config.json for the portable goal
        this.path = path.join(basePath, 'config.json');

        // Load existing or initialize
        this.data = parseDataFile(this.path, this.opts.defaults);
    }

    get(key: string): any {
        let value = this.data[key];
        // We are disabling decryption logic to keep the file simple and portable-editable 
        // as requested ("config.json ... external configuration").
        // If we want to support encrypted keys in the future, we can add a flag, 
        // but for now, we return raw value (user puts plain text key).
        return value;
    }

    set(key: string, val: any): void {
        // Direct assignment, no encryption, to maintain the file as simple JSON
        this.data[key] = val;
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 4)); // Pretty print for user editing
        } catch (e) {
            console.error("Failed to write config file", e);
        }
    }

    getAll(): Record<string, any> {
        return this.data;
    }
}

function parseDataFile(filePath: string, defaults: any) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        return defaults;
    }
}
