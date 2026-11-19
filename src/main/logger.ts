import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';

const MAX_BYTES = 5 * 1024 * 1024;

export class Logger {
    private static resolved: string | null = null;

    /** Tactio's own logs folder (%APPDATA%\Tactio\logs on Windows), never the folder it was launched from. */
    static get logPath(): string {
        if (this.resolved) return this.resolved;
        let dir: string;
        try {
            dir = app.getPath('logs');
        } catch {
            dir = path.join(os.tmpdir(), 'Tactio');
        }
        fs.mkdirSync(dir, { recursive: true });
        this.resolved = path.join(dir, 'debug.log');
        return this.resolved;
    }

    static log(context: string, message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? JSON.stringify(data) : '';
        const line = `[${timestamp}] [${context}] ${message} ${dataStr}\n`;

        console.log(line.trim());

        try {
            this.rotate();
            fs.appendFileSync(this.logPath, line);
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    static clear() {
        try {
            fs.writeFileSync(this.logPath, '');
        } catch (err) {
            console.error('Failed to clear log file:', err);
        }
    }

    // Keeps one previous file so the log can't grow without bound.
    private static rotate() {
        try {
            if (fs.statSync(this.logPath).size > MAX_BYTES) fs.renameSync(this.logPath, this.logPath.replace(/\.log$/, '.old.log'));
        } catch {
            // No log yet.
        }
    }
}
