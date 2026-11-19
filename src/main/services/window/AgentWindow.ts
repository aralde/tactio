import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

const WIDTH = 440;
const MAX_HEIGHT = 640;

export interface AgentView {
    dir?: string;
    taskId?: string;
}

/**
 * The floating card the folder menu, the tray and notifications open: write a request, answer the
 * agent's questions, approve its plan, then see the result. It sizes itself to its content.
 */
export class AgentWindow {
    private win: BrowserWindow | null = null;
    private ready: Promise<void> | null = null;

    private create(): BrowserWindow {
        const win = new BrowserWindow({
            width: WIDTH,
            height: 200,
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            show: false,
            webPreferences: { preload: path.join(__dirname, '../../preload.js') }
        });
        this.ready = win.loadFile(path.join(__dirname, '../../../renderer/agent.html'));
        win.on('closed', () => {
            this.win = null;
            this.ready = null;
        });
        this.win = win;
        return win;
    }

    async show(view: AgentView) {
        const win = this.win || this.create();
        await this.ready;
        if (!win.isVisible()) this.placeNearCursor(win);
        win.webContents.send('agent-show', view);
        win.show();
        win.focus();
    }

    hide() {
        this.win?.hide();
    }

    /** The renderer reports its card height after every view change. */
    fit(height: number) {
        if (!this.win) return;
        const h = Math.min(Math.max(Math.ceil(height), 120), MAX_HEIGHT);
        const [x, y] = this.win.getPosition();
        const area = screen.getDisplayNearestPoint({ x, y }).workArea;
        this.win.setBounds({ x, y: Math.min(y, area.y + area.height - h), width: WIDTH, height: h });
    }

    send(channel: string, payload: unknown) {
        this.win?.webContents.send(channel, payload);
    }

    getWindow() {
        return this.win;
    }

    private placeNearCursor(win: BrowserWindow) {
        const point = screen.getCursorScreenPoint();
        const area = screen.getDisplayNearestPoint(point).workArea;
        const [, height] = win.getSize();
        const x = Math.min(Math.max(point.x + 8, area.x), area.x + area.width - WIDTH);
        const y = Math.min(Math.max(point.y + 8, area.y), area.y + area.height - height);
        win.setPosition(x, y);
    }
}
