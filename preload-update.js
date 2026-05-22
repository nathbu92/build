const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  // Lance le téléchargement du .exe
  startDownload: (exeUrl, version) =>
    ipcRenderer.invoke('update:startDownload', exeUrl, version),

  // Écoute la progression (appelé plusieurs fois pendant le téléchargement)
  onProgress: (callback) => {
    ipcRenderer.on('update:progress', (_, data) => callback(data));
  },

  // Lance l'installeur après confirmation de l'utilisateur
  launchInstaller: () =>
    ipcRenderer.invoke('update:launchInstaller'),

  // Annule et supprime le fichier téléchargé
  cancelInstall: () =>
    ipcRenderer.invoke('update:cancelInstall'),

  // Fallback : ouvre la page GitHub si pas de .exe
  openRelease: (url) =>
    ipcRenderer.invoke('update:openRelease', url),
});
