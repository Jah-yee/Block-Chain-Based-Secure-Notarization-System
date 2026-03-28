const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: (url) => shell.openExternal(url),
    saveConfigCache: (data) => ipcRenderer.invoke('save-config-cache', data),
    loadConfigCache: () => ipcRenderer.invoke('load-config-cache')
});
