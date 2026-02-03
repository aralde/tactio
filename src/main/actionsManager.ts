import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import AdmZip from 'adm-zip';

export interface Action {
    label: string;
    icon?: string;
    prompt: string;
    style?: string;
}

export class ActionsManager {
    private actionsDir: string;

    constructor(basePath: string) {
        this.actionsDir = path.join(basePath, 'actions');
        this.ensureDir();
    }

    private ensureDir() {
        if (!fs.existsSync(this.actionsDir)) {
            fs.mkdirSync(this.actionsDir, { recursive: true });
        }
    }

    // --- Core CRUD ---

    getAll(): Action[] {
        this.ensureDir();
        const files = fs.readdirSync(this.actionsDir).filter(f => f.endsWith('.md'));
        const actions: Action[] = [];

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(this.actionsDir, file), 'utf-8');
                const action = this.parseAction(content);
                if (action) {
                    actions.push(action);
                }
            } catch (e) {
                console.error(`[ActionsManager] Failed to load action ${file}:`, e);
            }
        }
        return actions;
    }

    saveAll(actions: Action[]) {
        this.ensureDir();
        // 1. Clear existing (or careful sync? For now, simpler to clear and rewrite to ensure order/deletions)
        // But rewriting all might be slow if many. 
        // Better: Delete all .md files, then write new ones. 
        // Since we don't have IDs, filenames are generated from labels?
        // Issue: if I rename "Summarize" to "Sum", the old file remains if I don't clear.
        
        // Approach: Delete directory contents (only .md), then write all.
        const existing = fs.readdirSync(this.actionsDir).filter(f => f.endsWith('.md'));
        existing.forEach(f => fs.unlinkSync(path.join(this.actionsDir, f)));

        actions.forEach((action, index) => {
            const filename = this.generateFilename(action.label, index);
            const content = this.serializeAction(action);
            fs.writeFileSync(path.join(this.actionsDir, filename), content, 'utf-8');
        });
    }

    // --- Migration ---

    migrateFromConfig(legacyActions: any[]): boolean {
        if (!legacyActions || legacyActions.length === 0) return false;
        
        const existing = this.getAll();
        if (existing.length > 0) return false; // Already have files, don't overwrite

        console.log(`[ActionsManager] Migrating ${legacyActions.length} actions to Files...`);
        this.saveAll(legacyActions);
        return true;
    }

    // --- Import/Export ---

    exportActions(): string {
        try {
            const zip = new AdmZip();
            zip.addLocalFolder(this.actionsDir);
            
            // Return buffer base64? Or just save to a path?
            // Usually user wants to save to a specific path.
            // Let's return the Buffer, main process can save it.
            return zip.toBuffer().toString('base64'); 
        } catch (e) {
            console.error('[ActionsManager] Export failed:', e);
            throw e;
        }
    }

    importActions(zipDataBase64: string) {
        try {
            const buffer = Buffer.from(zipDataBase64, 'base64');
            const zip = new AdmZip(buffer);
            
            // Backup current? Or overwrite? 
            // User requested "Merge" or "Replace"? usually "Import" implies adding or replacing.
            // Let's Wipe and Replace for simplicity based on "Import" standard in tools, 
            // or maybe I should unzip to temp and merge?
            // START SIMPLE: Unzip and overwrite.
            // Actually, `extractAllTo` will overwrite existing files but keep others if names differ.
            // If I want a clean state, I should clear first.
            // Let's clear first to ensure exact replica of the zip state.
            
            this.ensureDir();
            const existing = fs.readdirSync(this.actionsDir).filter(f => f.endsWith('.md'));
            existing.forEach(f => fs.unlinkSync(path.join(this.actionsDir, f)));

            zip.extractAllTo(this.actionsDir, true);
        } catch (e) {
            console.error('[ActionsManager] Import failed:', e);
            throw e;
        }
    }

    // --- Helpers ---

    private generateFilename(label: string, index: number): string {
        // Sanitize label
        let name = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (!name) name = 'action';
        // Add index to ensure unique and ordering (roughly)
        return `${String(index).padStart(3, '0')}_${name}.md`;
    }

    private parseAction(content: string): Action | null {
        // Simple Frontmatter Parser
        // ---
        // label: X
        // icon: Y
        // style: Z
        // ---
        // Prompt...
        
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match) {
            // Fallback: entire file is prompt, label is filename? No, invalid format.
            return null; 
        }

        const fm = match[1];
        const body = match[2].trim();

        const labelMatch = fm.match(/^label:\s*(.*)$/m);
        const iconMatch = fm.match(/^icon:\s*(.*)$/m);
        const styleMatch = fm.match(/^style:\s*(.*)$/m);

        if (!labelMatch) return null;

        return {
            label: labelMatch[1].trim(),
            icon: iconMatch ? iconMatch[1].trim() : undefined,
            style: styleMatch ? styleMatch[1].trim() : undefined,
            prompt: body
        };
    }

    private serializeAction(action: Action): string {
        let fm = '---\n';
        fm += `label: ${action.label}\n`;
        if (action.icon) fm += `icon: ${action.icon}\n`;
        if (action.style) fm += `style: ${action.style}\n`;
        fm += '---\n';
        return fm + action.prompt;
    }
}
