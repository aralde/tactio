import { Tray, Menu, nativeImage, app, shell } from 'electron';
import * as path from 'path';
import { WindowManager } from '../window/WindowManager';
import { Logger } from '../../logger';

export interface TrayTask {
    id: string;
    label: string;
}

export interface TrayCli {
    id: string;
    label: string;
    checked: boolean;
}

const TRAY_TASKS = 8;

export class TrayManager {
    private tray: Tray | null = null;
    private windowManager: WindowManager;
    private agentTasks: TrayTask[] = [];
    private onAskAgent: (taskId?: string) => void = () => {};
    private agentClis: TrayCli[] = [];
    private onPickCli: (id: string) => void = () => {};
    private schedules: TrayTask[] = [];
    private onStopSchedule: (id: string) => void = () => {};

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
    }

    /** Shows which CLI new agent tasks run on, as radio items that switch it. */
    setAgentClis(clis: TrayCli[], onPick: (id: string) => void) {
        this.agentClis = clis;
        this.onPickCli = onPick;
        this.tray?.setContextMenu(this.buildMenu());
    }

    /** Lists the requests that repeat weekly; picking one stops it. */
    setSchedules(schedules: TrayTask[], onStop: (id: string) => void) {
        this.schedules = schedules;
        this.onStopSchedule = onStop;
        this.tray?.setContextMenu(this.buildMenu());
    }

    /** Lists the latest agent tasks in the tray menu; picking one opens it in the agent window. */
    setAgentTasks(tasks: TrayTask[], onAskAgent: (taskId?: string) => void) {
        this.agentTasks = tasks.slice(0, TRAY_TASKS);
        this.onAskAgent = onAskAgent;
        this.tray?.setContextMenu(this.buildMenu());
    }

    create() {
        // Path adjusted: src/main/services/tray -> root/assets
        // up 4 levels to root
        const iconPath = path.join(__dirname, '../../../../assets/tactio-logo.ico');
        const icon = nativeImage.createFromPath(iconPath);
        this.tray = new Tray(icon);

        this.tray.setToolTip('Tactio');
        this.tray.setContextMenu(this.buildMenu());

        this.tray.on('double-click', () => {
            this.windowManager.showAtCursor();
        });
    }

    private buildMenu(): Menu {
        const tasks: Electron.MenuItemConstructorOptions[] = this.agentTasks.length
            ? this.agentTasks.map(t => ({ label: t.label, click: () => this.onAskAgent(t.id) }))
            : [{ label: 'No tasks yet', enabled: false }];
        const current = this.agentClis.find(c => c.checked);
        const clis: Electron.MenuItemConstructorOptions[] = this.agentClis.map(c => ({
            label: c.label,
            type: 'radio',
            checked: c.checked,
            click: () => this.onPickCli(c.id)
        }));
        const repeating: Electron.MenuItemConstructorOptions[] = this.schedules.length
            ? [{ label: 'Click one to stop it', enabled: false }, ...this.schedules.map(s => ({ label: s.label, click: () => this.onStopSchedule(s.id) }))]
            : [{ label: 'Nothing repeats yet', enabled: false }];

        return Menu.buildFromTemplate([
            {
                label: 'Show/Hide',
                click: () => {
                    if (this.windowManager.isVisible()) {
                        this.windowManager.hide();
                    } else {
                        this.windowManager.showAtCursor();
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Ask the agent…',
                click: () => this.onAskAgent()
            },
            {
                label: 'Agent tasks',
                submenu: tasks
            },
            {
                label: 'Repeating weekly',
                submenu: repeating
            },
            ...(clis.length ? [{ label: current ? `Agent: ${current.label}` : 'Agent', submenu: clis }] : []),
            { type: 'separator' },
            {
                label: 'Open logs folder',
                click: () => shell.showItemInFolder(Logger.logPath)
            },
            {
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        ]);
    }
}
