import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Send an action to the main process
    triggerAction: (actionLabel: string, prompt: string) =>
        ipcRenderer.invoke('trigger-action', actionLabel, prompt),

    // Receive config from main process
    onConfigUpdate: (callback: (config: any) => void) =>
        ipcRenderer.on('config-update', (_event, config) => callback(config)),

    // Notify when UI is ready
    uiReady: () => ipcRenderer.send('ui-ready'),

    // Paste the result
    pasteResult: (text: string) => ipcRenderer.invoke('paste-result', text)
});
