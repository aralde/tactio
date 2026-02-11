import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { WindowManager } from '../window/WindowManager';

export class TrayManager {
    private tray: Tray | null = null;
    private windowManager: WindowManager;

    constructor(windowManager: WindowManager) {
        this.windowManager = windowManager;
    }

    create() {
        // Path adjusted: src/main/services/tray -> root/assets
        // up 4 levels to root
        const iconPath = path.join(__dirname, '../../../../assets/tactio-logo.ico');
        const icon = nativeImage.createFromPath(iconPath);
        this.tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
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
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        ]);

        this.tray.setToolTip('Tactio');
        this.tray.setContextMenu(contextMenu);

        this.tray.on('double-click', () => {
            this.windowManager.showAtCursor();
        });
    }
}
