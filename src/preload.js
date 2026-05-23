const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("papillon", {
  login: (data) => ipcRenderer.invoke("pronote:login", data),
  timetable: (data) => ipcRenderer.invoke("pronote:timetable", data),
  grades: () => ipcRenderer.invoke("pronote:grades"),
  homework: () => ipcRenderer.invoke("pronote:homework"),
  toggleHomework: (data) => ipcRenderer.invoke("pronote:homework:toggle", data),
  news: () => ipcRenderer.invoke("pronote:news"),
  logout: () => ipcRenderer.invoke("pronote:logout"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
