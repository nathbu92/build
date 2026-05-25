const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("papillon", {
  loginQR:      (d) => ipcRenderer.invoke("pronote:loginQR", d),
  loginToken:   (d) => ipcRenderer.invoke("pronote:loginToken", d),
  periods:      (d) => ipcRenderer.invoke("pronote:periods", d),
  timetable:    (d) => ipcRenderer.invoke("pronote:timetable", d),
  grades:       (d) => ipcRenderer.invoke("pronote:grades", d),
  homework:     (d) => ipcRenderer.invoke("pronote:homework", d),
  toggleHW:     (d) => ipcRenderer.invoke("pronote:homework:toggle", d),
  news:         ()  => ipcRenderer.invoke("pronote:news"),
  attendance:   (d) => ipcRenderer.invoke("pronote:attendance", d),
  canteen:      (d) => ipcRenderer.invoke("pronote:canteen", d),
  logout:       ()  => ipcRenderer.invoke("pronote:logout"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
