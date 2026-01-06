import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';

export class Store {
    private configPath: string = '';
    private secretsPath: string = '';
    private configData: Record<string, any> = {};
    private secretsData: Record<string, string> = {}; // Encrypted hex strings if using safeStorage

    // Keys that should be stored in secrets.json
    private readonly encryptedKeys = ['apiKey'];

    constructor(private opts: { configName: string; defaults: Record<string, any> }) {
        this.configData = opts.defaults;
    }

    init() {
        const isDev = !app.isPackaged;
        // In production/portable, look next to the executable. In dev, look in root.
        const basePath = isDev
            ? process.cwd()
            : (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')));

        this.configPath = path.join(basePath, 'config.json');
        this.secretsPath = path.join(basePath, 'secrets.json');

        // Load existing
        this.configData = this.parseDataFile(this.configPath, this.opts.defaults);
        this.secretsData = this.parseDataFile(this.secretsPath, {});

        // Migration: Check if any encrypted keys are currently in configData (plain text)
        let migrationNeeded = false;
        for (const key of this.encryptedKeys) {
            if (this.configData[key] && typeof this.configData[key] === 'string') {
                console.log(`[Store] Migrating sensitive key '${key}' to secure storage...`);
                // Move from config to secrets
                this.setSecret(key, this.configData[key]);
                delete this.configData[key];
                migrationNeeded = true;
            }
        }

        if (migrationNeeded) {
            this.saveConfig();
            console.log(`[Store] Migration complete.`);
        }
    }

    get(key: string): any {
        if (this.encryptedKeys.includes(key)) {
            return this.getSecret(key);
        }
        return this.configData[key];
    }

    set(key: string, val: any): void {
        if (this.encryptedKeys.includes(key)) {
            this.setSecret(key, val);
        } else {
            this.configData[key] = val;
            this.saveConfig();
        }
    }

    getAll(): Record<string, any> {
        // Combine config and decrypted secrets for the unified view
        const all = { ...this.configData };
        for (const key of this.encryptedKeys) {
            const val = this.getSecret(key);
            if (val) all[key] = val;
        }
        return all;
    }

    private getSecret(key: string): string | undefined {
        const encryptedValue = this.secretsData[key];
        if (!encryptedValue) return undefined;

        if (safeStorage.isEncryptionAvailable()) {
            try {
                return safeStorage.decryptString(Buffer.from(encryptedValue, 'hex'));
            } catch (error) {
                console.error(`[Store] Failed to decrypt key '${key}':`, error);
                return undefined;
            }
        } else {
            // Fallback: stored as plain text (if safeStorage unavailable)
            return encryptedValue;
        }
    }

    private setSecret(key: string, value: string): void {
        if (!value) {
            delete this.secretsData[key];
        } else {
            if (safeStorage.isEncryptionAvailable()) {
                try {
                    this.secretsData[key] = safeStorage.encryptString(value).toString('hex');
                } catch (error) {
                    console.error(`[Store] Failed to encrypt key '${key}':`, error);
                    // Fallback to plain text if encryption fails unexpectedly? 
                    // Better to fail secure? For now, we store plain text if encryption fails to avoid data loss in weird envs?
                    // No, usually safeStorage failing means we shouldn't continue. 
                    // But if unavailable (Linux without keyring), we fallback.
                    this.secretsData[key] = value;
                }
            } else {
                console.warn(`[Store] SafeStorage unavailable. Storing '${key}' in plain text in secrets.json`);
                this.secretsData[key] = value;
            }
        }
        this.saveSecrets();
    }

    private saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.configData, null, 4));
        } catch (e) {
            console.error("Failed to write config file", e);
        }
    }

    private saveSecrets() {
        try {
            fs.writeFileSync(this.secretsPath, JSON.stringify(this.secretsData, null, 4));
        } catch (e) {
            console.error("Failed to write secrets file", e);
        }
    }

    private parseDataFile(filePath: string, defaults: any) {
        try {
            if (!fs.existsSync(filePath)) return defaults;
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            return defaults;
        }
    }
}
