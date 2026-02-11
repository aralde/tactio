import * as fs from 'fs';
import * as path from 'path';

export class Logger {
    private static logPath = path.join(process.cwd(), 'debug.log');

    static log(context: string, message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? JSON.stringify(data) : '';
        const line = `[${timestamp}] [${context}] ${message} ${dataStr}\n`;

        console.log(line.trim());

        try {
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
}
