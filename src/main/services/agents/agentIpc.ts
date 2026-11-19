import { dialog, ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTaskManager } from './AgentTaskManager';
import { AgentSchedules } from './AgentSchedules';
import { saveAnswer, withFolderContext } from './folderContext';
import { AgyRunner, ClaudeRunner, OpencodeRunner, Runner, cliProblem, resolveCliPath } from './agentRunners';
import { AgentCli, CLI_NAMES, isAgentCli } from './claudeCli';
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

const PATH_KEYS: Record<AgentCli, string> = { claude: 'claudePath', opencode: 'opencodePath', agy: 'agyPath' };

/** The CLI new tasks run on, from Settings; Claude Code when unset. */
export function currentAgentCli(store: any): AgentCli {
    const saved = store.get('agentCli');
    return isAgentCli(saved) ? saved : 'claude';
}

const binFor = (store: any, cli: AgentCli) => () => resolveCliPath(cli, store.get(PATH_KEYS[cli]));

/**
 * One runner per CLI, each reading its path and model from Settings when it runs, and each given
 * the folder's inventory and Office text before it starts.
 */
export function agentRunners(store: any): (cli: AgentCli) => Runner {
    const runners: Record<AgentCli, Runner> = {
        claude: withFolderContext(new ClaudeRunner(binFor(store, 'claude'))),
        opencode: withFolderContext(new OpencodeRunner(binFor(store, 'opencode'), () => store.get('opencodeModel'))),
        agy: withFolderContext(new AgyRunner(binFor(store, 'agy'), () => store.get('agyModel')))
    };
    return cli => runners[cli];
}

export function registerAgentIpc(store: any, agentWindow: AgentWindow, tasks: AgentTaskManager, schedules: AgentSchedules, onSchedulesChanged: () => void) {
    ipcMain.handle('agent-get', (event, id: string) => tasks.get(id));
    ipcMain.handle('agent-start', (event, dir: string, request: string) => tasks.start(requireFolder(dir), request).id);
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
        const cli = currentAgentCli(store);
        const bin = binFor(store, cli)();
        return { cli, name: CLI_NAMES[cli], path: bin || '', problem: await cliProblem(cli, bin) };
    });

    ipcMain.handle('agent-select-folder', async () => {
        const win = agentWindow.getWindow();
        if (!win) return null;
        const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return res.canceled ? null : res.filePaths[0];
    });

    ipcMain.handle('agent-select-claude', async (event, cli?: AgentCli) => {
        const name = CLI_NAMES[isAgentCli(cli) ? cli : 'claude'];
        const filters = process.platform === 'win32' ? [{ name, extensions: ['exe'] }] : [];
        const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
        return res.canceled ? null : res.filePaths[0];
    });

    ipcMain.handle('agent-folder-menu-get', async () => {
        if (process.platform !== 'win32') return { supported: false, enabled: false };
        return { supported: true, enabled: await reg(['query', MENU_KEYS[0].key]) };
    });

    ipcMain.handle('agent-folder-menu-set', (event, enabled: boolean) => setFolderMenu(enabled));

    ipcMain.handle('agent-save-answer', (event, id: string) => {
        const task = tasks.get(id);
        if (!task?.proposal?.answer) throw new Error('This task has no answer to save.');
        return saveAnswer(requireFolder(task.dir), task.request, task.proposal.answer);
    });

    ipcMain.handle('agent-repeat-get', (event, id: string) => {
        const task = tasks.get(id);
        return Boolean(task && schedules.find(task.dir, task.request));
    });

    // Turns weekly repetition of the task's request on or off, and returns whether it is on.
    ipcMain.handle('agent-repeat-set', (event, id: string, on: boolean) => {
        const task = tasks.get(id);
        if (!task) throw new Error(`No task ${id}`);
        const existing = schedules.find(task.dir, task.request);
        if (on && !existing) schedules.add(task.dir, task.request);
        if (!on && existing) schedules.remove(existing.id);
        onSchedulesChanged();
        return on;
    });
}
