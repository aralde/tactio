import { contextBridge, ipcRenderer, clipboard } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Send an action to the main process
    triggerAction: (label: string, prompt: string) => ipcRenderer.invoke('trigger-action', label, prompt),
    onConfigUpdate: (callback: (config: any) => void) => {
        ipcRenderer.on('config-update', (event, config) => callback(config));
    },
    uiReady: () => ipcRenderer.send('ui-ready'),
    pasteResult: (text: string) => ipcRenderer.invoke('paste-result', text),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
    getModels: (service: string, apiKey: string) => ipcRenderer.invoke('get-models', service, apiKey),
    togglePin: () => ipcRenderer.invoke('toggle-pin'),
    closeWindow: () => ipcRenderer.send('close-window'),
    saveContentToFile: (content: string, extension: string) => ipcRenderer.invoke('save-content-to-file', content, extension),
    openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
    selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
    exportActions: () => ipcRenderer.invoke('export-actions'),
    importActions: () => ipcRenderer.invoke('import-actions'),
    copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
    log: (message: string, data?: any) => ipcRenderer.send('log', message, data)
});
