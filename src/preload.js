const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("papillon", {
  // Updater
  checkUpdate:    (silent) => ipcRenderer.invoke("update:check", silent),
  getVersion:     ()       => ipcRenderer.invoke("update:version"),
  onUpdateAvail:  (cb)     => ipcRenderer.on("update:none", (_, v) => cb("none", v)),
  // Auth
  searchSchools:  (d) => ipcRenderer.invoke("pronote:search", d),
  openWebview:    (d) => ipcRenderer.invoke("pronote:openWebview", d),
  loginToken:     (d) => ipcRenderer.invoke("pronote:loginToken", d),
  // Data
  periods:        (d) => ipcRenderer.invoke("pronote:periods", d),
  timetable:      (d) => ipcRenderer.invoke("pronote:timetable", d),
  grades:         (d) => ipcRenderer.invoke("pronote:grades", d),
  homework:       (d) => ipcRenderer.invoke("pronote:homework", d),
  toggleHW:       (d) => ipcRenderer.invoke("pronote:homework:toggle", d),
  news:           ()  => ipcRenderer.invoke("pronote:news"),
  attendance:     (d) => ipcRenderer.invoke("pronote:attendance", d),
  canteen:        (d) => ipcRenderer.invoke("pronote:canteen", d),
  logout:         ()  => ipcRenderer.invoke("pronote:logout"),
  openExternal:   (u) => ipcRenderer.send("open-external", u),
});
