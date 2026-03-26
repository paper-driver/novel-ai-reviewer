const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script for Electron
 * Exposes safe APIs to the Angular frontend via contextBridge
 * Prevents direct Node.js access for security
 */

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // App information
    getAppVersion: () => '1.0.0',
    
    // Folder picker
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    
    // Generic IPC communication
    invoke: (channel, args) => ipcRenderer.invoke(channel, args),
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    once: (channel, callback) => ipcRenderer.once(channel, callback),
    removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
  });
  
  console.log('[Preload] Context bridge established successfully');
} catch (err) {
  console.error('[Preload] Failed to establish context bridge:', err);
}
