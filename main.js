const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

// ══════════════════════════════════════════════════════════════
// VÉRIFICATION DE MISE À JOUR
// Repo : https://github.com/nathbu92/parkourpro
// Règles : silencieux si hors-ligne, jamais bloquant
// ══════════════════════════════════════════════════════════════
const GITHUB_RELEASES_API = 'https://api.github.com/repos/nathbu92/parkourpro/releases/latest';
const CURRENT_VERSION = app.getVersion();
const appIcon = path.join(__dirname, 'src', 'assets', 'icon.png');

let updateWin = null;

/**
 * Compare deux versions semver simplifiées (ex: "2.0.0" vs "3.1.0").
 * Retourne true si latestVersion est strictement supérieure à currentVersion.
 */
function isNewerVersion(current, latest) {
  const parse = v => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

/**
 * Vérifie si une connexion internet est disponible via l'API Electron net.
 */
function isOnline() {
  return net.isOnline();
}

/**
 * Effectue une requête HTTPS GET et retourne le body en JSON.
 * Retourne null en cas d'erreur (timeout, réseau, JSON invalide…).
 */
function fetchJSON(url) {
  return new Promise((resolve) => {
    try {
      const request = net.request({
        method: 'GET',
        url,
        redirect: 'follow'
      });

      request.setHeader('User-Agent', `parkour-pro/${CURRENT_VERSION}`);
      request.setHeader('Accept', 'application/vnd.github+json');

      let body = '';
      const timeout = setTimeout(() => {
        try { request.abort(); } catch (_) {}
        resolve(null);
      }, 6000); // 6s max, ne doit jamais bloquer l'app

      request.on('response', (response) => {
        response.on('data', (chunk) => { body += chunk.toString(); });
        response.on('end', () => {
          clearTimeout(timeout);
          try { resolve(JSON.parse(body)); }
          catch (_) { resolve(null); }
        });
        response.on('error', () => { clearTimeout(timeout); resolve(null); });
      });

      request.on('error', () => { clearTimeout(timeout); resolve(null); });
      request.end();
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Ouvre la fenêtre HTML de mise à jour avec les infos de la release.
 */
let downloadedInstallerPath = null; // chemin local du .exe téléchargé

function openUpdateWindow(latestVersion, releaseUrl, releaseBody, exeUrl) {
  if (updateWin && !updateWin.isDestroyed()) {
    updateWin.focus();
    return;
  }

  const bodyEncoded = encodeURIComponent((releaseBody || '').slice(0, 800));
  const exeEncoded  = encodeURIComponent(exeUrl || '');
  const fileUrl = `file://${path.join(__dirname, 'src', 'update.html')}` +
    `?current=${encodeURIComponent(CURRENT_VERSION)}` +
    `&latest=${encodeURIComponent(latestVersion)}` +
    `&exeUrl=${exeEncoded}` +
    `&body=${bodyEncoded}`;

  updateWin = new BrowserWindow({
    width: 500,
    height: 500,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-update.js')
    }
  });

  updateWin.loadURL(fileUrl);
  updateWin.on('closed', () => {
    updateWin = null;
    downloadedInstallerPath = null;
  });
}

/**
 * Télécharge le fichier .exe depuis GitHub et envoie la progression à la popup.
 * Utilise net.request d'Electron pour rester dans le contexte sandboxé.
 */
function downloadInstaller(exeUrl, version) {
  return new Promise((resolve, reject) => {
    try {
      const downloadsPath = app.getPath('downloads');
      const fileName      = `PARKOUR-PRO Setup ${version}.exe`;
      const destPath      = path.join(downloadsPath, fileName);

      // Supprime un éventuel fichier partiel précédent
      try { fs.unlinkSync(destPath); } catch (_) {}

      const file = fs.createWriteStream(destPath);
      let totalBytes     = 0;
      let receivedBytes  = 0;

      const request = net.request({ method: 'GET', url: exeUrl, redirect: 'follow' });
      request.setHeader('User-Agent', `parkour-pro/${CURRENT_VERSION}`);

      // Timeout de sécurité : 5 minutes max
      const timeout = setTimeout(() => {
        try { request.abort(); } catch (_) {}
        file.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(new Error('Timeout téléchargement'));
      }, 5 * 60 * 1000);

      request.on('response', (response) => {
        // Gestion des redirects GitHub (302 → CDN)
        if (response.statusCode === 302 || response.statusCode === 301) {
          clearTimeout(timeout);
          file.destroy();
          const redirectUrl = response.headers['location'];
          if (redirectUrl) {
            downloadInstaller(redirectUrl, version).then(resolve).catch(reject);
          } else {
            reject(new Error('Redirect sans Location'));
          }
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          receivedBytes += chunk.length;
          file.write(chunk);

          // Envoie la progression à la popup
          if (updateWin && !updateWin.isDestroyed()) {
            const percent = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0;
            updateWin.webContents.send('update:progress', {
              percent,
              transferred: receivedBytes,
              total: totalBytes
            });
          }
        });

        response.on('end', () => {
          clearTimeout(timeout);
          file.end(() => {
            downloadedInstallerPath = destPath;
            if (updateWin && !updateWin.isDestroyed()) {
              updateWin.webContents.send('update:progress', {
                percent: 100,
                transferred: receivedBytes,
                total: totalBytes,
                status: 'done'
              });
            }
            resolve(destPath);
          });
        });

        response.on('error', (err) => {
          clearTimeout(timeout);
          file.destroy();
          try { fs.unlinkSync(destPath); } catch (_) {}
          if (updateWin && !updateWin.isDestroyed()) {
            updateWin.webContents.send('update:progress', { status: 'error' });
          }
          reject(err);
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeout);
        file.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        if (updateWin && !updateWin.isDestroyed()) {
          updateWin.webContents.send('update:progress', { status: 'error' });
        }
        reject(err);
      });

      request.end();
    } catch (err) {
      reject(err);
    }
  });
}



/**
 * Point d'entrée : vérification de mise à jour.
 * Appelé après que l'app soit prête, de façon totalement non-bloquante.
 */
async function checkForUpdate() {
  try {
    // 1. Vérification connexion — si hors-ligne, on sort immédiatement
    if (!isOnline()) {
      console.log('[update] Hors-ligne, vérification ignorée.');
      return;
    }

    // 2. Requête GitHub Releases API (timeout interne de 6s)
    const release = await fetchJSON(GITHUB_RELEASES_API);
    if (!release || !release.tag_name) {
      console.log('[update] Aucune release trouvée ou erreur réseau.');
      return;
    }

    const latestVersion = release.tag_name.replace(/^v/, '');
    const releaseUrl    = release.html_url || 'https://github.com/nathbu92/parkourpro/releases/latest';
    const releaseBody   = release.body || '';

    // Cherche le .exe dans les assets de la release
    const assets = release.assets || [];
    const exeAsset = assets.find(a =>
      a.name && a.name.toLowerCase().endsWith('.exe') && a.browser_download_url
    );
    const exeUrl = exeAsset ? exeAsset.browser_download_url : '';

    console.log(`[update] Actuel : v${CURRENT_VERSION} / Dernier : v${latestVersion}`);
    if (exeUrl) console.log(`[update] .exe trouvé : ${exeAsset.name}`);
    else        console.log('[update] Aucun .exe dans les assets (release peut-être sans binaire)');

    // 3. Comparaison de version
    if (!isNewerVersion(CURRENT_VERSION, latestVersion)) {
      console.log('[update] Application à jour.');
      return;
    }

    // 4. Nouvelle version détectée
    console.log(`[update] Nouvelle version disponible : v${latestVersion}`);
    openUpdateWindow(latestVersion, releaseUrl, releaseBody, exeUrl);

  } catch (err) {
    // Sécurité totale : aucune erreur ne doit jamais remonter ou bloquer l'app
    console.warn('[update] Erreur silencieuse :', err && err.message);
  }
}

// ── Base de données SQLite ──
let db;
function initDB() {
  const Database = require('better-sqlite3');
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'parkour-pro.db');
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      pseudo TEXT DEFAULT '',
      photo TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      players TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS chase_history (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS speed_history (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  try { db.exec('ALTER TABLE players ADD COLUMN photo TEXT DEFAULT NULL'); } catch(_) {}
  console.log('DB initialisée :', dbPath);
  return dbPath;
}

// ── IPC Handlers ──
function registerHandlers() {
  // AUTH
  ipcMain.handle('db:login', (_, { username, code }) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND code = ?').get(username, String(code));
    if (!user) return { ok: false, error: 'Identifiants incorrects' };
    return { ok: true, username: user.username };
  });

  ipcMain.handle('db:register', (_, { username, code }) => {
    const exists = db.prepare('SELECT username FROM users WHERE username = ?').get(username);
    if (exists) return { ok: false, error: 'Ce nom d\'utilisateur existe déjà' };
    db.prepare('INSERT INTO users (username, code) VALUES (?, ?)').run(username, String(code));
    return { ok: true, username };
  });

  ipcMain.handle('db:deleteAccount', (_, { username }) => {
    db.prepare('DELETE FROM users WHERE username = ?').run(username);
    db.prepare('DELETE FROM players WHERE owner = ?').run(username);
    db.prepare('DELETE FROM teams WHERE owner = ?').run(username);
    db.prepare('DELETE FROM chase_history WHERE owner = ?').run(username);
    db.prepare('DELETE FROM speed_history WHERE owner = ?').run(username);
    return { ok: true };
  });

  // PLAYERS
  ipcMain.handle('db:getPlayers', (_, { owner }) => {
    const rows = db.prepare('SELECT * FROM players WHERE owner = ?').all(owner);
    return rows.map(r => ({ id: r.id, owner: r.owner, name: r.name, pseudo: r.pseudo, photo: r.photo || null }));
  });

  ipcMain.handle('db:savePlayer', (_, { owner, player }) => {
    db.prepare(`
      INSERT INTO players (id, owner, name, pseudo, photo) VALUES (@id, @owner, @name, @pseudo, @photo)
      ON CONFLICT(id) DO UPDATE SET name=@name, pseudo=@pseudo, photo=@photo
    `).run({ id: player.id, owner, name: player.name, pseudo: player.pseudo || '', photo: player.photo || null });
    return { ok: true };
  });

  // PHOTO upload (dialog)
  ipcMain.handle('db:pickPhoto', async (_, { owner, playerId }) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Choisir une photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false };
    const data = fs.readFileSync(filePaths[0]);
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/gif';
    const b64 = 'data:' + mime + ';base64,' + data.toString('base64');
    db.prepare('UPDATE players SET photo = ? WHERE id = ? AND owner = ?').run(b64, playerId, owner);
    return { ok: true, photo: b64 };
  });

  // APP SETTINGS
  ipcMain.handle('db:getSetting', (_, { key }) => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : null;
  });

  ipcMain.handle('db:setSetting', (_, { key, value }) => {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?').run(key, value, value);
    return { ok: true };
  });

  // HAS USERS (pour savoir si la DB est vide)
  ipcMain.handle('db:hasUsers', () => {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
    return row.c > 0;
  });

  ipcMain.handle('db:deletePlayer', (_, { owner, id }) => {
    db.prepare('DELETE FROM players WHERE id = ? AND owner = ?').run(id, owner);
    return { ok: true };
  });

  // TEAMS
  ipcMain.handle('db:getTeams', (_, { owner }) => {
    const rows = db.prepare('SELECT * FROM teams WHERE owner = ?').all(owner);
    return rows.map(r => ({ id: r.id, owner: r.owner, name: r.name, players: JSON.parse(r.players) }));
  });

  ipcMain.handle('db:saveTeam', (_, { owner, team }) => {
    db.prepare(`
      INSERT INTO teams (id, owner, name, players) VALUES (@id, @owner, @name, @players)
      ON CONFLICT(id) DO UPDATE SET name=@name, players=@players
    `).run({ id: team.id, owner, name: team.name, players: JSON.stringify(team.players || []) });
    return { ok: true };
  });

  ipcMain.handle('db:deleteTeam', (_, { owner, id }) => {
    db.prepare('DELETE FROM teams WHERE id = ? AND owner = ?').run(id, owner);
    return { ok: true };
  });

  // CHASE HISTORY
  ipcMain.handle('db:getChase', (_, { owner }) => {
    const rows = db.prepare('SELECT * FROM chase_history WHERE owner = ? ORDER BY rowid DESC').all(owner);
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveChase', (_, { owner, compet }) => {
    db.prepare(`
      INSERT INTO chase_history (id, owner, name, date, data) VALUES (@id, @owner, @name, @date, @data)
      ON CONFLICT(id) DO UPDATE SET data=@data
    `).run({ id: String(compet.id), owner, name: compet.name, date: compet.date, data: JSON.stringify(compet) });
    return { ok: true };
  });

  ipcMain.handle('db:deleteChase', (_, { owner, id }) => {
    db.prepare('DELETE FROM chase_history WHERE id = ? AND owner = ?').run(String(id), owner);
    return { ok: true };
  });

  // SPEED HISTORY
  ipcMain.handle('db:getSpeed', (_, { owner }) => {
    const rows = db.prepare('SELECT * FROM speed_history WHERE owner = ? ORDER BY rowid DESC').all(owner);
    return rows.map(r => JSON.parse(r.data));
  });

  ipcMain.handle('db:saveSpeed', (_, { owner, compet }) => {
    db.prepare(`
      INSERT INTO speed_history (id, owner, name, date, data) VALUES (@id, @owner, @name, @date, @data)
      ON CONFLICT(id) DO UPDATE SET data=@data
    `).run({ id: String(compet.id), owner, name: compet.name, date: compet.date, data: JSON.stringify(compet) });
    return { ok: true };
  });

  ipcMain.handle('db:deleteSpeed', (_, { owner, id }) => {
    db.prepare('DELETE FROM speed_history WHERE id = ? AND owner = ?').run(String(id), owner);
    return { ok: true };
  });

  // EXPORT JSON
  ipcMain.handle('db:exportJSON', async (_, { owner }) => {
    const players   = db.prepare('SELECT * FROM players WHERE owner = ?').all(owner).map(r => ({ id: r.id, name: r.name, pseudo: r.pseudo }));
    const teams     = db.prepare('SELECT * FROM teams WHERE owner = ?').all(owner).map(r => ({ id: r.id, name: r.name, players: JSON.parse(r.players) }));
    const chase     = db.prepare('SELECT data FROM chase_history WHERE owner = ?').all(owner).map(r => JSON.parse(r.data));
    const speed     = db.prepare('SELECT data FROM speed_history WHERE owner = ?').all(owner).map(r => JSON.parse(r.data));

    const exportData = { user: owner, exportDate: new Date().toISOString(), players, teams, chaseHistory: chase, speedHistory: speed };

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Exporter les données',
      defaultPath: `parkour-pro-backup-${owner}-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    return { ok: true, filePath };
  });

  // IMPORT JSON
  ipcMain.handle('db:importJSON', async (_, { owner }) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Importer des données',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false };

    try {
      const raw = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(raw);

      const insertPlayer = db.prepare(`INSERT INTO players (id, owner, name, pseudo) VALUES (@id, @owner, @name, @pseudo) ON CONFLICT(id) DO UPDATE SET name=@name, pseudo=@pseudo`);
      const insertTeam   = db.prepare(`INSERT INTO teams (id, owner, name, players) VALUES (@id, @owner, @name, @players) ON CONFLICT(id) DO UPDATE SET name=@name, players=@players`);
      const insertChase  = db.prepare(`INSERT INTO chase_history (id, owner, name, date, data) VALUES (@id, @owner, @name, @date, @data) ON CONFLICT(id) DO UPDATE SET data=@data`);
      const insertSpeed  = db.prepare(`INSERT INTO speed_history (id, owner, name, date, data) VALUES (@id, @owner, @name, @date, @data) ON CONFLICT(id) DO UPDATE SET data=@data`);

      const txn = db.transaction(() => {
        (data.players || []).forEach(p => insertPlayer.run({ id: p.id || String(Date.now() + Math.random()), owner, name: p.name, pseudo: p.pseudo || '' }));
        (data.teams || []).forEach(t => insertTeam.run({ id: t.id || String(Date.now() + Math.random()), owner, name: t.name, players: JSON.stringify(t.players || []) }));
        (data.chaseHistory || []).forEach(c => insertChase.run({ id: String(c.id), owner, name: c.name, date: c.date, data: JSON.stringify({ ...c, owner }) }));
        (data.speedHistory || []).forEach(s => insertSpeed.run({ id: String(s.id), owner, name: s.name, date: s.date, data: JSON.stringify({ ...s, owner }) }));
      });
      txn();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // OPEN DB FOLDER
  ipcMain.handle('db:openFolder', () => {
    shell.openPath(app.getPath('userData'));
    return { ok: true };
  });

  // GET DB PATH
  ipcMain.handle('db:getPath', () => {
    return path.join(app.getPath('userData'), 'parkour-pro.db');
  });

  // OPEN RELEASE URL (fallback si pas de .exe)
  ipcMain.handle('update:openRelease', (_, url) => {
    const safe = (url || '').startsWith('https://github.com/') ? url : 'https://github.com/nathbu92/parkourpro/releases/latest';
    shell.openExternal(safe);
    if (updateWin && !updateWin.isDestroyed()) updateWin.close();
    return { ok: true };
  });

  // LANCER LE TÉLÉCHARGEMENT du .exe
  ipcMain.handle('update:startDownload', async (_, exeUrl, version) => {
    try {
      await downloadInstaller(exeUrl, version);
      return { ok: true };
    } catch (err) {
      console.warn('[update] Erreur téléchargement :', err && err.message);
      return { ok: false, error: err && err.message };
    }
  });

  // LANCER L'INSTALLEUR après confirmation
  ipcMain.handle('update:launchInstaller', () => {
    if (!downloadedInstallerPath || !fs.existsSync(downloadedInstallerPath)) {
      return { ok: false, error: 'Fichier introuvable' };
    }
    try {
      const { spawn } = require('child_process');
      // Lance l'installeur NSIS de façon détachée puis quitte l'app
      spawn(downloadedInstallerPath, [], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      setTimeout(() => app.quit(), 500);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message };
    }
  });

  // ANNULER : supprimer le fichier téléchargé
  ipcMain.handle('update:cancelInstall', () => {
    if (downloadedInstallerPath) {
      try { fs.unlinkSync(downloadedInstallerPath); } catch (_) {}
      downloadedInstallerPath = null;
    }
    return { ok: true };
  });
}

// ── Fenêtres ──
let mainWin, splashWin, scoresWin;

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 520,
    height: 340,
    frame: false,          // sans bordure ni barre de titre
    transparent: true,     // fond transparent (arrondi possible)
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,     // le splash n'apparaît pas dans la barre des tâches
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWin.loadFile(path.join(__dirname, 'src', 'splash.html'));
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PARKOUR-PRO',
    backgroundColor: '#0a0a0f',
    icon: appIcon,         // ← icône dans la barre des tâches Windows/Linux
    show: false,           // on attend que la fenêtre soit prête avant d'afficher
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.setMenuBarVisibility(false);

  // Quand l'app principale a fini de charger, on ferme le splash
  // did-finish-load est plus fiable que ready-to-show (qui peut ne pas se déclencher
  // si des ressources externes comme Google Fonts sont inaccessibles)
  let splashClosed = false;
  function closeSplash() {
    if (splashClosed) return;
    splashClosed = true;
    const elapsed = Date.now() - splashStart;
    const remaining = Math.max(0, 2500 - elapsed);
    setTimeout(() => {
      if (splashWin && !splashWin.isDestroyed()) splashWin.close();
      mainWin.show();
      mainWin.focus();
    }, remaining);
  }

  mainWin.webContents.once('did-finish-load', closeSplash);
  // Timeout de secours : si dans 8s rien ne s'est passé, on ouvre quand même
  setTimeout(closeSplash, 8000);

  // Vérification mise à jour : 3s après affichage, jamais bloquant, silencieux hors-ligne
  mainWin.once('show', () => {
    setTimeout(() => checkForUpdate(), 3000);
  });

  // Ouvrir scores dans fenêtre séparée
  ipcMain.handle('app:openScores', () => {
    if (scoresWin && !scoresWin.isDestroyed()) {
      scoresWin.focus();
      return;
    }
    scoresWin = new BrowserWindow({
      width: 1280,
      height: 720,
      title: 'PARKOUR-PRO — Scores Live',
      backgroundColor: '#0a0a0f',
      icon: appIcon,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    scoresWin.loadFile(path.join(__dirname, 'src', 'scores.html'));
    scoresWin.setMenuBarVisibility(false);
    scoresWin.on('closed', () => { scoresWin = null; });
  });
}

let splashStart;

app.whenReady().then(() => {
  splashStart = Date.now();
  createSplashWindow();
  initDB();
  registerHandlers();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
