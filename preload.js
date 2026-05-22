const { contextBridge, ipcRenderer } = require('electron');

// API exposée au renderer (index.html / scores.html)
// Remplace complètement Google Apps Script
contextBridge.exposeInMainWorld('electronAPI', {
  // AUTH
  login:         (args) => ipcRenderer.invoke('db:login', args),
  register:      (args) => ipcRenderer.invoke('db:register', args),
  deleteAccount: (args) => ipcRenderer.invoke('db:deleteAccount', args),

  // PLAYERS
  getPlayers:    (args) => ipcRenderer.invoke('db:getPlayers', args),
  savePlayer:    (args) => ipcRenderer.invoke('db:savePlayer', args),
  deletePlayer:  (args) => ipcRenderer.invoke('db:deletePlayer', args),

  // TEAMS
  getTeams:      (args) => ipcRenderer.invoke('db:getTeams', args),
  saveTeam:      (args) => ipcRenderer.invoke('db:saveTeam', args),
  deleteTeam:    (args) => ipcRenderer.invoke('db:deleteTeam', args),

  // HISTORY
  getChase:      (args) => ipcRenderer.invoke('db:getChase', args),
  saveChase:     (args) => ipcRenderer.invoke('db:saveChase', args),
  deleteChase:   (args) => ipcRenderer.invoke('db:deleteChase', args),
  getSpeed:      (args) => ipcRenderer.invoke('db:getSpeed', args),
  saveSpeed:     (args) => ipcRenderer.invoke('db:saveSpeed', args),
  deleteSpeed:   (args) => ipcRenderer.invoke('db:deleteSpeed', args),

  // EXPORT / IMPORT
  exportJSON:    (args) => ipcRenderer.invoke('db:exportJSON', args),
  importJSON:    (args) => ipcRenderer.invoke('db:importJSON', args),

  // UTILITAIRES
  openFolder:    ()     => ipcRenderer.invoke('db:openFolder'),
  getDBPath:     ()     => ipcRenderer.invoke('db:getPath'),
  openScores:    ()     => ipcRenderer.invoke('app:openScores'),

  // PHOTO
  pickPhoto:     (args) => ipcRenderer.invoke('db:pickPhoto', args),

  // SETTINGS
  getSetting:    (args) => ipcRenderer.invoke('db:getSetting', args),
  setSetting:    (args) => ipcRenderer.invoke('db:setSetting', args),

  // HAS USERS
  hasUsers:      ()     => ipcRenderer.invoke('db:hasUsers'),
});
