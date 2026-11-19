import { dialog, ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTaskManager } from './AgentTaskManager';
import { claudeProblem, resolveClaudePath } from './ClaudeRunner';
import { MENU_KEYS, addMenuCalls, removeMenuCalls } from './folderMenu';
import { AgentWindow } from '../window/AgentWindow';

export function isFolder(dir: string): boolean {
    try {
        return fs.statSync(dir).isDirectory();
    } catch {
        return false;
    }
}

export function requireFolder(dir: string): string {
    if (!isFolder(dir)) throw new Error(`Folder not found: ${dir}`);
    return dir;
}

function reg(args: string[]): Promise<boolean> {
    return new Promise(resolve => execFile('reg', args, { windowsHide: true }, err => resolve(!err)));
}

// A portable build runs from a temp copy; PORTABLE_EXECUTABLE_FILE is the exe the user launched.
function launcher(): { exe: string; appArg?: string } {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    return process.defaultApp ? { exe, appArg: path.resolve(process.argv[1]) } : { exe };
}

async function setFolderMenu(enabled: boolean): Promise<boolean> {
    if (process.platform !== 'win32') throw new Error('The folder menu is only available on Windows.');
    if (!enabled) {
        for (const args of removeMenuCalls()) await reg(args);
        return false;
    }
    const { exe, appArg } = launcher();
    for (const args of addMenuCalls(exe, appArg)) {
        if (!(await reg(args))) throw new Error(`reg ${args.slice(0, 2).join(' ')} failed`);
    }
    return true;
}

export function registerAgentIpc(store: any, agentWindow: AgentWindow, tasks: AgentTaskManager) {
    ipcMain.handle('agent-get', (event, id: string) => tasks.get(id));
    ipcMain.handle('agent-start', (event, dir: string, intent: string) => tasks.start(requireFolder(dir), intent).id);
    ipcMain.handle('agent-retry', (event, id: string) => {
        const task = tasks.get(id);
        if (task) requireFolder(task.dir);
        return tasks.retry(id).id;
    });
    ipcMain.handle('agent-refine', (event, id: string, text: string) => tasks.refine(id, text));
    ipcMain.handle('agent-approve', (event, id: string) => tasks.approve(id));
    ipcMain.handle('agent-cancel', (event, id: string) => tasks.cancel(id));
    ipcMain.handle('agent-undo', (event, id: string) => tasks.undo(id));
    ipcMain.on('agent-fit', (event, height: number) => agentWindow.fit(height));
    ipcMain.on('agent-hide', () => agentWindow.hide());

    ipcMain.handle('agent-status', async () => {
        const bin = resolveClaudePath(store.get('claudePath'));
        return { path: bin || '', problem: await claudeProblem(bin) };
    });

    ipcMain.handle('agent-select-folder', async () => {
        const win = agentWindow.getWindow();
        if (!win) return null;
        const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return res.canceled ? null : res.filePaths[0];
    });

    ipcMain.handle('agent-select-claude', async (event) => {
        const filters = process.platform === 'win32' ? [{ name: 'Claude Code', extensions: ['exe'] }] : [];
        const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
        return res.canceled ? null : res.filePaths[0];
    });

    ipcMain.handle('agent-folder-menu-get', async () => {
        if (process.platform !== 'win32') return { supported: false, enabled: false };
        return { supported: true, enabled: await reg(['query', MENU_KEYS[0].key]) };
    });

    ipcMain.handle('agent-folder-menu-set', (event, enabled: boolean) => setFolderMenu(enabled));
}
