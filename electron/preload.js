// Preload script for Electron
// Runs in a privileged context before the renderer process
const { contextBridge } = require("electron");

// Expose safe APIs to the renderer if needed in the future
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version: process.versions.electron,
});
