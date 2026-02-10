import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { ActionsManager } from './actionsManager';

export class Store {
    private path: string = '';
    private data: Record<string, any> = {};
    private actionsManager: ActionsManager | null = null;

    // Keys that should be encrypted
    private readonly encryptedKeys = ['apiKey', 'geminiApiKey', 'openRouterApiKey', 'groqApiKey'];

    constructor(private opts: { configName: string; defaults: Record<string, any> }) {
        this.data = opts.defaults;
    }

    init() {
        // Standard user data path
        const userDataPath = app.getPath('userData');
        // Our new single config file
        this.path = path.join(userDataPath, '.tactiorc');

        // Initialize ActionsManager
        const isDev = !app.isPackaged;
        const actionsBasePath = isDev ? process.cwd() : userDataPath;
        console.log(`[Store] Initializing ActionsManager at: ${actionsBasePath}`);
        this.actionsManager = new ActionsManager(actionsBasePath);

        // check if .tactiorc exists
        if (fs.existsSync(this.path)) {
            this.data = this.parseDataFile(this.path, this.opts.defaults);
        } else {
            // Attempt migration from legacy locations
            this.handleMigration(userDataPath);
        }
    }

    private handleMigration(userDataPath: string) {
        // Legacy paths logic
        const isDev = !app.isPackaged;
        const legacyBasePath = isDev
            ? process.cwd()
            : (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')));

        const legacyConfigPath = path.join(legacyBasePath, 'config.json');
        const legacySecretsPath = path.join(legacyBasePath, 'secrets.json');

        let migrated = false;

        // 1. Load Legacy Config
        if (fs.existsSync(legacyConfigPath)) {
            console.log('[Store] Found legacy config.json, migrating...');
            const legacyConfig = this.parseDataFile(legacyConfigPath, {});
            this.data = { ...this.data, ...legacyConfig };
            migrated = true;
        }

        // 2. Load Legacy Secrets and merge
        if (fs.existsSync(legacySecretsPath)) {
            console.log('[Store] Found legacy secrets.json, migrating...');
            const legacySecrets = this.parseDataFile(legacySecretsPath, {});
            // secrets.json keys are already encrypted or plain text (if safeStorage failed prev).
            // We just merge them in. The `get()` method will handle decryption.
            this.data = { ...this.data, ...legacySecrets };
            migrated = true;
        }

        // 3. Migrate Actions if they were in config.json
        if (this.data['actions'] && Array.isArray(this.data['actions'])) {
            console.log('[Store] Migrating legacy actions from config to ActionsManager...');
            const success = this.actionsManager?.migrateFromConfig(this.data['actions']);
            if (success) {
                delete this.data['actions'];
                migrated = true;
            }
        }

        if (migrated) {
            // Save to new .tactiorc
            this.save();
            console.log('[Store] Migration to .tactiorc complete.');

            // Rename legacy files to .bak
            try {
                if (fs.existsSync(legacyConfigPath)) fs.renameSync(legacyConfigPath, legacyConfigPath + '.bak');
                if (fs.existsSync(legacySecretsPath)) fs.renameSync(legacySecretsPath, legacySecretsPath + '.bak');
            } catch (err) {
                console.error('[Store] Failed to rename legacy files:', err);
            }
        }
    }

    get(key: string): any {
        if (key === 'actions') {
            return this.actionsManager?.getAll() || [];
        }
        if (this.encryptedKeys.includes(key)) {
            return this.getSecret(key);
        }
        return this.data[key];
    }

    set(key: string, val: any): void {
        if (key === 'actions') {
            this.actionsManager?.saveAll(val);
            return;
        }

        if (this.encryptedKeys.includes(key)) {
            this.setSecret(key, val);
        } else {
            this.data[key] = val;
            this.save();
        }
    }

    getAll(): Record<string, any> {
        const all = { ...this.data };

        // Add actions
        if (this.actionsManager) {
            all['actions'] = this.actionsManager.getAll();
        }

        // Decrypt sensitive keys for the view (or keep masked? Usually getAll implies ready to use data)
        // But for display in settings UI we might want masked. 
        // Existing implementation returned decrypted values in getAll().
        for (const key of this.encryptedKeys) {
            const val = this.getSecret(key);
            if (val) all[key] = val;
        }
        return all;
    }

    exportActions(): string {
        return this.actionsManager?.exportActions() || '';
    }

    importActions(zipBase64: string) {
        this.actionsManager?.importActions(zipBase64);
    }

    private getSecret(key: string): string | undefined {
        const encryptedValue = this.data[key];
        if (!encryptedValue) return undefined;

        if (safeStorage.isEncryptionAvailable()) {
            try {
                return safeStorage.decryptString(Buffer.from(encryptedValue, 'hex'));
            } catch (error) {
                // If decryption fails, it might be plain text (legacy fallback or different machine)
                // console.warn(`[Store] Failed to decrypt '${key}', assuming plain text.`);
                return encryptedValue;
            }
        } else {
            return encryptedValue;
        }
    }

    private setSecret(key: string, value: string): void {
        if (!value) {
            delete this.data[key];
        } else {
            if (safeStorage.isEncryptionAvailable()) {
                try {
                    this.data[key] = safeStorage.encryptString(value).toString('hex');
                } catch (error) {
                    console.error(`[Store] Failed to encrypt key '${key}':`, error);
                    this.data[key] = value;
                }
            } else {
                this.data[key] = value;
            }
        }
        this.save();
    }

    private save() {
        try {
            // Ensure directory exists (should exist for userData, but safe to check)
            const dir = path.dirname(this.path);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 4));
        } catch (e) {
            console.error("Failed to write .tactiorc", e);
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
