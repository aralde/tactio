import { BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private store: any; // We'll pass the store instance

    constructor(store: any) {
        this.store = store;
    }

    create() {
        this.mainWindow = new BrowserWindow({
            width: 400,
            height: 660,
            frame: false, // Floating UI style
            alwaysOnTop: true,
            skipTaskbar: true,
            show: false,
            webPreferences: {
                // Adjust path based on compiled structure: src/main/services/window -> src/main/preload.js
                // In dist: dist/main/services/window/WindowManager.js -> dist/main/preload.js
                // Adjust path based on compiled structure: src/main/services/window -> src/main/preload.js
                // In dist: dist/main/services/window/WindowManager.js -> dist/main/preload.js
                preload: (() => {
                    const preloadPath = path.join(__dirname, '../../preload.js');
                    console.log('Resolved Preload Path:', preloadPath);
                    if (!fs.existsSync(preloadPath)) {
                        console.error('FATAL: Preload script not found at:', preloadPath);
                    } else {
                        console.log('Preload script found.');
                    }
                    return preloadPath;
                })(),
            },
            // Adjust path for icon: src/main/services/window -> assets/tactio-logo.ico
            // In dist: dist/main/services/window -> dist/assets ?? usually assets are copied to root or resources
            // Original: path.join(__dirname, '../../assets/tactio-logo.ico') from main.ts (src/main)
            // So from here: ../../../assets ? 
            // Let's assume standard electron-builder assets or similar.
            // If main.ts was: ../../assets (meaning src/../assets = root/assets)
            // Then from src/main/services/window: ../../../../assets ?
            // Let's try to be safe. If __dirname is deep, we go up.
            icon: path.join(__dirname, '../../../../assets/tactio-logo.ico')
        });

        // Load index.html
        // Original: path.join(__dirname, '../../src/renderer/index.html')
        // main.ts (src/main) -> ../src/renderer = src/renderer
        // Here: ../../../src/renderer/index.html
        // Load index.html from dist/renderer
        // compiled: dist/main/services/window/WindowManager.js
        // target: dist/renderer/index.html
        // relative: ../../../renderer/index.html
        this.mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));

        // Hide instead of close on blur to keep it ready
        this.mainWindow.on('blur', () => {
            // Only hide if NOT pinned (always on top)
            // But logic says: if pinned = alwaysOnTop is true.
            // Original logic: if (!mainWindow?.isAlwaysOnTop()) hide()
            // Wait, "Pinned" usually means "Stay visible/AlwaysOnTop". 
            // If I pin it, I want it to stay.
            if (!this.mainWindow?.isAlwaysOnTop()) {
                this.mainWindow?.hide();
            }
        });

        return this.mainWindow;
    }

    showAtCursor(clipboardText: string = '') {
        if (!this.mainWindow) return;

        // Only move if NOT pinned
        if (!this.mainWindow.isAlwaysOnTop()) {
            const point = screen.getCursorScreenPoint();
            this.mainWindow.setPosition(point.x + 10, point.y + 10);
        }

        this.mainWindow.show();
        this.mainWindow.focus();

        // Send config and clipboard text
        this.mainWindow.webContents.send('config-update', {
            config: this.store.getAll(),
            clipboardText
        });
    }

    hide() {
        this.mainWindow?.hide();
    }

    minimize() {
        this.mainWindow?.minimize();
    }

    isVisible() {
        return this.mainWindow?.isVisible() || false;
    }

    togglePin(): boolean {
        if (this.mainWindow) {
            const isAlwaysOnTop = this.mainWindow.isAlwaysOnTop();
            this.mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
            return !isAlwaysOnTop;
        }
        return false;
    }

    sendConfig(config: any) {
        this.mainWindow?.webContents.send('config-update', config);
    }

    getWindow() {
        return this.mainWindow;
    }
}
