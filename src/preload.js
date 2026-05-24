const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("papillon", {
  loginToken: (d) => ipcRenderer.invoke("pronote:loginToken", d),
  loginQR:    (d) => ipcRenderer.invoke("pronote:loginQR", d),
  timetable:  (d) => ipcRenderer.invoke("pronote:timetable", d),
  grades:     ()  => ipcRenderer.invoke("pronote:grades"),
  homework:   (d) => ipcRenderer.invoke("pronote:homework", d || {}),
  toggleHW:   (d) => ipcRenderer.invoke("pronote:homework:toggle", d),
  news:       ()  => ipcRenderer.invoke("pronote:news"),
  logout:     ()  => ipcRenderer.invoke("pronote:logout"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
