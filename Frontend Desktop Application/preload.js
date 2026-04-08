const { contextBridge, ipcRenderer } = require('electron');

/**
 * 🛡️ [SECURITY] authoritative Security Bridge (Preload)
 * Strictly exposes only the necessary hardened handlers to the renderer.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    auth: {
        start: () => ipcRenderer.invoke('auth:start'),
        checkSession: () => ipcRenderer.invoke('auth:check-session'),
        logout: () => ipcRenderer.invoke('auth:logout'),
        getDeviceId: () => ipcRenderer.invoke('auth:get-device-id'),
        onStatusChanged: (callback) => ipcRenderer.on('auth:status-changed', (event, data) => callback(data))
    },
    config: {
        save: (data) => ipcRenderer.invoke('config:save', data),
        load: () => ipcRenderer.invoke('config:load'),
        syncApiUrl: (url) => ipcRenderer.invoke('config:sync-api-url', url)
    },
    api: {
        call: (endpoint, method, data) => ipcRenderer.invoke('api:call', endpoint, method, data)
    },
    system: {
        openExternal: (url) => ipcRenderer.send('open-external', url)
    }
});
