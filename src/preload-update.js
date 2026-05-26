const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("updater", {
  startDownload:    (url, ver) => ipcRenderer.invoke("update:startDownload", url, ver),
  launchInstaller:  ()         => ipcRenderer.invoke("update:launchInstaller"),
  cancelInstall:    ()         => ipcRenderer.invoke("update:cancelInstall"),
  openRelease:      (url)      => ipcRenderer.invoke("update:openRelease", url),
  onProgress:       (cb)       => ipcRenderer.on("update:progress", (_, r, t) => cb(r, t)),
});
