const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onServerPort: (callback) => ipcRenderer.on("server-port", callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
