const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Papillon",
    icon: path.join(__dirname, "../assets/icon.ico"),
    backgroundColor: "#0f1a14",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("closed", () => { win = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!win) createWindow(); });

ipcMain.on("open-external", (_, url) => shell.openExternal(url));
