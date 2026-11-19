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
    openPromptCatalog: () => ipcRenderer.send('open-prompt-catalog'),
    openExternal: (url: string) => ipcRenderer.send('open-external', url),
    log: (message: string, data?: any) => ipcRenderer.send('log', message, data),

    agentList: () => ipcRenderer.invoke('agent-list'),
    agentStart: (dir: string, intent: string) => ipcRenderer.invoke('agent-start', dir, intent),
    agentRefine: (id: string, text: string) => ipcRenderer.invoke('agent-refine', id, text),
    agentApprove: (id: string) => ipcRenderer.invoke('agent-approve', id),
    agentCancel: (id: string) => ipcRenderer.invoke('agent-cancel', id),
    agentUndo: (id: string) => ipcRenderer.invoke('agent-undo', id),
    agentStatus: () => ipcRenderer.invoke('agent-status'),
    agentSelectFolder: () => ipcRenderer.invoke('agent-select-folder'),
    agentSelectClaude: () => ipcRenderer.invoke('agent-select-claude'),
    agentFolderMenuGet: () => ipcRenderer.invoke('agent-folder-menu-get'),
    agentFolderMenuSet: (enabled: boolean) => ipcRenderer.invoke('agent-folder-menu-set', enabled),
    onAgentTasks: (callback: (tasks: any[]) => void) => {
        ipcRenderer.on('agent-tasks', (event, tasks) => callback(tasks));
    },
    onAgentOpen: (callback: (dir: string) => void) => {
        ipcRenderer.on('agent-open', (event, dir) => callback(dir));
    }
});
