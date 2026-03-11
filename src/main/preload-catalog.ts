import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tactio', {
    addPrompt: (promptData: any) => ipcRenderer.send('add-prompt-from-catalog', promptData)
});
