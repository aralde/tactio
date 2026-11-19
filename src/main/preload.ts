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

    agentGet: (id: string) => ipcRenderer.invoke('agent-get', id),
    agentStart: (dir: string, intent: string) => ipcRenderer.invoke('agent-start', dir, intent),
    agentRetry: (id: string) => ipcRenderer.invoke('agent-retry', id),
    agentRefine: (id: string, text: string) => ipcRenderer.invoke('agent-refine', id, text),
    agentApprove: (id: string) => ipcRenderer.invoke('agent-approve', id),
    agentCancel: (id: string) => ipcRenderer.invoke('agent-cancel', id),
    agentUndo: (id: string) => ipcRenderer.invoke('agent-undo', id),
    agentSaveAnswer: (id: string) => ipcRenderer.invoke('agent-save-answer', id),
    agentRepeatGet: (id: string) => ipcRenderer.invoke('agent-repeat-get', id),
    agentRepeatSet: (id: string, on: boolean) => ipcRenderer.invoke('agent-repeat-set', id, on),
    agentStatus: () => ipcRenderer.invoke('agent-status'),
    agentSelectFolder: () => ipcRenderer.invoke('agent-select-folder'),
    agentSelectClaude: (cli?: string) => ipcRenderer.invoke('agent-select-claude', cli),
    agentFolderMenuGet: () => ipcRenderer.invoke('agent-folder-menu-get'),
    agentFolderMenuSet: (enabled: boolean) => ipcRenderer.invoke('agent-folder-menu-set', enabled),
    agentFit: (height: number) => ipcRenderer.send('agent-fit', height),
    agentHide: () => ipcRenderer.send('agent-hide'),
    onAgentShow: (callback: (view: { dir?: string; taskId?: string }) => void) => {
        ipcRenderer.on('agent-show', (event, view) => callback(view));
    },
    onAgentTask: (callback: (task: any) => void) => {
        ipcRenderer.on('agent-task', (event, task) => callback(task));
    }
});
