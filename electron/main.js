const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

// Handle Squirrel events on Windows (installer)
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow;

// CSS & JS injected after page load to create a 16:9 desktop layout
// The mobile app is displayed in a phone frame on the right,
// and a sidebar with branding + info is shown on the left.
const DESKTOP_LAYOUT_CSS = `
  :root {
    --sidebar-width: 340px;
    --phone-width: 390px;
    --phone-height: 780px;
    --bg: #0a0f0d;
    --sidebar-bg: #0d1a14;
    --accent: #1db954;
    --accent2: #4ade80;
    --text: #e8f5e9;
    --muted: #6b8f71;
    --border: rgba(255,255,255,0.07);
  }

  /* Reset host page */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    background: var(--bg) !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  }

  /* Wrapper injected by JS */
  #papillon-desktop-wrapper {
    display: flex !important;
    width: 100vw !important;
    height: 100vh !important;
    background: var(--bg) !important;
    position: fixed !important;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 999999 !important;
  }

  /* Left sidebar */
  #papillon-sidebar {
    width: var(--sidebar-width) !important;
    min-width: var(--sidebar-width) !important;
    height: 100% !important;
    background: var(--sidebar-bg) !important;
    border-right: 1px solid var(--border) !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 36px 28px !important;
    box-sizing: border-box !important;
    gap: 0 !important;
    overflow: hidden !important;
    position: relative !important;
  }

  #papillon-sidebar::before {
    content: '' !important;
    position: absolute !important;
    top: -80px !important;
    left: -80px !important;
    width: 280px !important;
    height: 280px !important;
    background: radial-gradient(circle, rgba(29,185,84,0.12) 0%, transparent 70%) !important;
    pointer-events: none !important;
  }

  .papillon-logo-block {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin-bottom: 32px !important;
  }

  .papillon-logo-block img {
    width: 42px !important;
    height: 42px !important;
    border-radius: 12px !important;
  }

  .papillon-logo-block span {
    font-size: 22px !important;
    font-weight: 700 !important;
    color: var(--text) !important;
    letter-spacing: -0.3px !important;
  }

  .papillon-tagline {
    font-size: 14px !important;
    color: var(--muted) !important;
    line-height: 1.5 !important;
    margin-bottom: 36px !important;
  }

  .papillon-divider {
    height: 1px !important;
    background: var(--border) !important;
    margin: 0 0 28px 0 !important;
  }

  .papillon-info-title {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
    color: var(--muted) !important;
    margin-bottom: 16px !important;
  }

  .papillon-info-list {
    list-style: none !important;
    padding: 0 !important;
    margin: 0 0 32px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }

  .papillon-info-list li {
    display: flex !important;
    align-items: flex-start !important;
    gap: 10px !important;
    font-size: 13px !important;
    color: #b0c4b1 !important;
    line-height: 1.4 !important;
  }

  .papillon-info-list li .icon {
    font-size: 16px !important;
    flex-shrink: 0 !important;
    margin-top: 1px !important;
  }

  .papillon-spacer {
    flex: 1 !important;
  }

  .papillon-footer {
    font-size: 11px !important;
    color: var(--muted) !important;
    line-height: 1.6 !important;
  }

  .papillon-footer a {
    color: var(--accent2) !important;
    text-decoration: none !important;
  }

  .papillon-version-badge {
    display: inline-flex !important;
    align-items: center !important;
    background: rgba(29,185,84,0.12) !important;
    border: 1px solid rgba(29,185,84,0.25) !important;
    color: var(--accent2) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    padding: 3px 9px !important;
    border-radius: 20px !important;
    margin-bottom: 10px !important;
  }

  /* Right area: phone frame centered */
  #papillon-phone-area {
    flex: 1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: var(--bg) !important;
    position: relative !important;
    overflow: hidden !important;
  }

  #papillon-phone-area::before {
    content: '' !important;
    position: absolute !important;
    bottom: -100px !important;
    right: -100px !important;
    width: 400px !important;
    height: 400px !important;
    background: radial-gradient(circle, rgba(29,185,84,0.06) 0%, transparent 70%) !important;
    pointer-events: none !important;
  }

  #papillon-phone-frame {
    width: var(--phone-width) !important;
    height: var(--phone-height) !important;
    border-radius: 42px !important;
    background: #000 !important;
    box-shadow:
      0 0 0 10px #1a1a1a,
      0 0 0 11px #2a2a2a,
      0 30px 80px rgba(0,0,0,0.7),
      0 10px 30px rgba(0,0,0,0.5) !important;
    overflow: hidden !important;
    position: relative !important;
    flex-shrink: 0 !important;
  }

  /* Notch */
  #papillon-phone-frame::before {
    content: '' !important;
    position: absolute !important;
    top: 0 !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 126px !important;
    height: 34px !important;
    background: #000 !important;
    border-radius: 0 0 20px 20px !important;
    z-index: 10 !important;
  }

  /* Dynamic island dot */
  #papillon-phone-frame::after {
    content: '' !important;
    position: absolute !important;
    top: 11px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 12px !important;
    height: 12px !important;
    background: #1a1a1a !important;
    border-radius: 50% !important;
    z-index: 11 !important;
  }

  /* The actual app iframe */
  #papillon-app-iframe {
    width: 100% !important;
    height: 100% !important;
    border: none !important;
    border-radius: 42px !important;
    display: block !important;
  }
`;

const DESKTOP_LAYOUT_JS = `
(function() {
  if (document.getElementById('papillon-desktop-wrapper')) return;

  // Inject CSS
  const style = document.createElement('style');
  style.id = 'papillon-desktop-style';
  style.textContent = ${JSON.stringify(DESKTOP_LAYOUT_CSS)};
  document.head.appendChild(style);

  // Get current page URL to reload inside iframe
  const currentURL = window.location.href;

  // Build the desktop wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'papillon-desktop-wrapper';

  wrapper.innerHTML = \`
    <div id="papillon-sidebar">
      <div class="papillon-logo-block">
        <img src="./assets/images/icon.png" onerror="this.style.display='none'" alt="Papillon">
        <span>Papillon</span>
      </div>
      <p class="papillon-tagline">L'application scolaire libre et open-source pour les lycéens français.</p>
      <div class="papillon-divider"></div>

      <div class="papillon-info-title">Fonctionnalités</div>
      <ul class="papillon-info-list">
        <li><span class="icon">📅</span><span>Emploi du temps et cours en temps réel</span></li>
        <li><span class="icon">📝</span><span>Devoirs, notes et compétences</span></li>
        <li><span class="icon">📣</span><span>Actualités et vie scolaire</span></li>
        <li><span class="icon">🍽️</span><span>Menu de la cantine et solde</span></li>
        <li><span class="icon">🔔</span><span>Notifications et alertes</span></li>
        <li><span class="icon">🌐</span><span>Compatible Pronote, EcoleDirecte, Skolengo</span></li>
      </ul>

      <div class="papillon-divider"></div>
      <div class="papillon-info-title">À propos</div>
      <ul class="papillon-info-list">
        <li><span class="icon">🔓</span><span>100% open-source (MIT)</span></li>
        <li><span class="icon">🔒</span><span>Données stockées localement, aucune collecte</span></li>
        <li><span class="icon">🤝</span><span>Communauté active sur GitHub</span></li>
      </ul>

      <div class="papillon-spacer"></div>
      <div class="papillon-footer">
        <div class="papillon-version-badge">v8.4.2 — Windows</div><br>
        <a href="#">getpapillon.xyz</a> · <a href="#">GitHub</a><br>
        © 2024 Papillon — Licence MIT
      </div>
    </div>

    <div id="papillon-phone-area">
      <div id="papillon-phone-frame">
        <iframe
          id="papillon-app-iframe"
          src="\${currentURL}"
          allow="camera; microphone; geolocation; clipboard-read; clipboard-write"
        ></iframe>
      </div>
    </div>
  \`;

  document.body.appendChild(wrapper);
})();
`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "Papillon",
    icon: path.join(__dirname, "../assets/images/icon.png"),
    backgroundColor: "#0a0f0d",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false, // needed for executeJavaScript injection
      webSecurity: false,      // needed for iframe same-origin
      allowRunningInsecureContent: true,
    },
    autoHideMenuBar: true,
    frame: true,
  });

  // Remove default menu
  Menu.setApplicationMenu(null);

  // Load the exported web app
  const indexPath = path.join(__dirname, "../web-build/index.html");

  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadURL("http://localhost:8081");
  }

  // Inject the desktop layout after the page is ready
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(DESKTOP_LAYOUT_JS).catch(console.error);
  });

  // Open external links in the browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
