const { app, BrowserWindow, Menu, ipcMain, shell, session: eSession, net } = require("electron");
const path = require("path");
const fs   = require("fs");
const crypto = require("crypto");

const CURRENT_VERSION      = app.getVersion();
const GITHUB_RELEASES_API  = "https://api.github.com/repos/nathbu92/papillon-desktop/releases/latest";

let mainWin, updateWin = null, pronoteWin = null;
let sessionHandle = null, pendingLoginResolve = null;
let downloadedInstallerPath = null;

// ══ FETCH JSON via Electron net (pas de dépendance externe) ══
function fetchJSON(url) {
  return new Promise(resolve => {
    try {
      const req = net.request({ method: "GET", url, redirect: "follow" });
      req.setHeader("User-Agent", `papillon-desktop/${CURRENT_VERSION}`);
      req.setHeader("Accept", "application/vnd.github+json");
      let body = "";
      const timeout = setTimeout(() => { try { req.abort(); } catch(_) {} resolve(null); }, 6000);
      req.on("response", res => {
        res.on("data", c => { body += c.toString(); });
        res.on("end", () => { clearTimeout(timeout); try { resolve(JSON.parse(body)); } catch(_) { resolve(null); } });
        res.on("error", () => { clearTimeout(timeout); resolve(null); });
      });
      req.on("error", () => { clearTimeout(timeout); resolve(null); });
      req.end();
    } catch(_) { resolve(null); }
  });
}

function isNewerVersion(current, latest) {
  const p = v => v.replace(/^v/, "").split(".").map(n => parseInt(n)||0);
  const [cM,cm,cp] = p(current), [lM,lm,lp] = p(latest);
  if(lM!==cM) return lM>cM; if(lm!==cm) return lm>cm; return lp>cp;
}

// ══ CHECK FOR UPDATES ══
async function checkForUpdates(silent = true) {
  if(!net.isOnline()) return;
  const release = await fetchJSON(GITHUB_RELEASES_API);
  if(!release?.tag_name) return;
  const latest = release.tag_name.replace(/^v/, "");
  if(!isNewerVersion(CURRENT_VERSION, latest)) {
    if(!silent) mainWin?.webContents.send("update:none", CURRENT_VERSION);
    return;
  }
  const exeAsset = (release.assets||[]).find(a => a.name?.toLowerCase().endsWith(".exe") && a.browser_download_url);
  openUpdateWindow(latest, release.html_url||"", release.body||"", exeAsset?.browser_download_url||"");
}

function openUpdateWindow(latest, releaseUrl, body, exeUrl) {
  if(updateWin && !updateWin.isDestroyed()) { updateWin.focus(); return; }
  const fileUrl = `file://${path.join(__dirname, "update.html")}` +
    `?current=${encodeURIComponent(CURRENT_VERSION)}&latest=${encodeURIComponent(latest)}` +
    `&exeUrl=${encodeURIComponent(exeUrl)}&body=${encodeURIComponent((body||"").slice(0,800))}`;
  updateWin = new BrowserWindow({
    width: 480, height: 520, parent: mainWin,
    frame: false, transparent: true, resizable: false, center: true, alwaysOnTop: true,
    icon: path.join(__dirname, "../assets/icon.ico"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload-update.js") },
  });
  updateWin.loadURL(fileUrl);
  updateWin.on("closed", () => { updateWin = null; downloadedInstallerPath = null; });
}

function downloadInstaller(exeUrl, version) {
  return new Promise((resolve, reject) => {
    try {
      const dest = path.join(app.getPath("downloads"), `Papillon-Setup-${version}.exe`);
      try { fs.unlinkSync(dest); } catch(_) {}
      const file = fs.createWriteStream(dest);
      let total = 0, received = 0;
      const req = net.request({ method: "GET", url: exeUrl, redirect: "follow" });
      req.setHeader("User-Agent", `papillon-desktop/${CURRENT_VERSION}`);
      const timeout = setTimeout(() => { try { req.abort(); } catch(_) {} file.destroy(); try { fs.unlinkSync(dest); } catch(_) {} reject(new Error("Timeout")); }, 5*60*1000);
      req.on("response", res => {
        if(res.statusCode===302||res.statusCode===301) {
          const loc = res.headers["location"];
          if(loc) { clearTimeout(timeout); file.destroy(); try { fs.unlinkSync(dest); } catch(_) {} downloadInstaller(loc, version).then(resolve).catch(reject); return; }
        }
        total = parseInt(res.headers["content-length"])||0;
        res.on("data", chunk => {
          received += chunk.length;
          file.write(chunk);
          updateWin?.webContents.send("update:progress", received, total);
        });
        res.on("end", () => {
          clearTimeout(timeout); file.end();
          downloadedInstallerPath = dest;
          resolve({ ok: true });
        });
        res.on("error", err => { clearTimeout(timeout); file.destroy(); try { fs.unlinkSync(dest); } catch(_) {} reject(err); });
      });
      req.on("error", err => { clearTimeout(timeout); file.destroy(); reject(err); });
      req.end();
    } catch(err) { reject(err); }
  });
}

// ══ IPC: Updater ══
function registerUpdateHandlers() {
  ipcMain.handle("update:check",  async(_, silent=true) => { await checkForUpdates(silent); return { ok: true }; });
  ipcMain.handle("update:version", () => CURRENT_VERSION);
  ipcMain.handle("update:openRelease", (_, url) => { shell.openExternal((url||"").startsWith("https://github.com/") ? url : "https://github.com/nathbu92/papillon-desktop/releases/latest"); updateWin?.close(); return { ok: true }; });
  ipcMain.handle("update:startDownload", async(_, exeUrl, ver) => { try { return await downloadInstaller(exeUrl, ver); } catch(err) { return { ok: false, error: err?.message }; } });
  ipcMain.handle("update:launchInstaller", () => {
    if(!downloadedInstallerPath||!fs.existsSync(downloadedInstallerPath)) return { ok: false, error: "Fichier introuvable" };
    try { require("child_process").spawn(downloadedInstallerPath, [], { detached: true, stdio: "ignore" }).unref(); setTimeout(() => app.quit(), 500); return { ok: true }; }
    catch(err) { return { ok: false, error: err?.message }; }
  });
  ipcMain.handle("update:cancelInstall", () => { if(downloadedInstallerPath) { try { fs.unlinkSync(downloadedInstallerPath); } catch(_) {} downloadedInstallerPath = null; } return { ok: true }; });
}

// ══ PRONOTE FETCHER ══
const customFetcher = async (options) => {
  const response = await fetch(options.url, {
    method: options.method,
    headers: { ...options.headers, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 PRONOTE Mobile APP Version/2.0.11" },
    body: options.method !== "GET" ? options.content : void 0,
    redirect: options.redirect,
  });
  const content = await response.text();
  return { content, status: response.status, get headers() { return response.headers; } };
};

// ══ WINDOWS ══
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1100, minHeight: 700,
    title: "Papillon", icon: path.join(__dirname, "../assets/icon.ico"),
    backgroundColor: "#0d1710", autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(null);
  mainWin.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  registerUpdateHandlers();
  // Check on startup after 4s, then every 30min
  setTimeout(() => checkForUpdates(true), 4000);
  setInterval(() => checkForUpdates(true), 30*60*1000);
});
app.on("window-all-closed", () => { if(process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if(!mainWin) createWindow(); });

// ══ SEARCH SCHOOLS ══
ipcMain.handle("pronote:search", async(_, { query, lat, lon }) => {
  try {
    const { geolocation } = require("pawnote");
    let schools = [];
    if(lat && lon) {
      schools = await geolocation({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
    } else if(query) {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, { headers: { "User-Agent": "Papillon/1.0.0" } });
      const geoData = await geoRes.json();
      if(geoData?.[0]) schools = await geolocation({ latitude: parseFloat(geoData[0].lat), longitude: parseFloat(geoData[0].lon) });
    }
    return { ok: true, schools: schools.map(s => ({ name: s.name, url: s.url, distance: s.distance })) };
  } catch(err) { return { ok: false, error: err.message }; }
});

// ══ PRONOTE WEBVIEW LOGIN ══
ipcMain.handle("pronote:openWebview", async(_, { url, schoolName }) => {
  return new Promise(resolve => {
    pendingLoginResolve = resolve;
    const deviceUUID = crypto.randomUUID();
    const infoURL = url.replace(/\/?$/, "/") + "InfoMobileApp.json?id=0D264427-EEFC-4810-A9E9-346942A862A4";
    const loginSession = eSession.fromPartition(`pronote-${Date.now()}`, { cache: false });
    pronoteWin = new BrowserWindow({
      width: 460, height: 720, parent: mainWin, modal: true,
      title: `Connexion — ${schoolName||"Pronote"}`, autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: false, session: loginSession,
        userAgent: "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36" },
    });
    const exp = new Date(Date.now() + 5*60*1000).toUTCString();
    const safeUrl = url.replace(/'/g, "\\'").replace(/\/?$/, "/");
    const INFO_INJECT = `(function(){try{const j=JSON.parse(document.body.innerText);const t=j&&j.CAS&&j.CAS.jetonCAS;if(t){document.cookie="validationAppliMobile="+t+"; expires=${exp}";document.cookie="uuidAppliMobile=${deviceUUID}; expires=${exp}";document.cookie="ielang=1036; expires=${new Date(Date.now()+365*24*60*60*1000).toUTCString()}";}window.location.assign("${safeUrl}mobile.eleve.html?fd=1");}catch(e){}})();`;
    const HOOK = `(function(){try{window.GInterface.passerEnModeValidationAppliMobile('','${deviceUUID}','','','{"model":"random","platform":"android"}');}catch(e){}})();`;
    const DETECT = `(function(){setInterval(function(){try{const s=window.loginState;if(s&&s.status===0&&s.login){document.title="PPLOG:"+JSON.stringify({login:s.login,mdp:s.mdp,uuid:'${deviceUUID}',url:'${safeUrl}'});}}catch(e){}},600);})();`;
    pronoteWin.loadURL(infoURL);
    pronoteWin.webContents.on("did-finish-load", () => {
      const cur = pronoteWin?.webContents.getURL()||"";
      if(cur.includes("InfoMobileApp")) pronoteWin.webContents.executeJavaScript(INFO_INJECT).catch(()=>{});
      else if(cur.includes("mobile.eleve.html")) { pronoteWin.webContents.executeJavaScript(HOOK).catch(()=>{}); pronoteWin.webContents.executeJavaScript(DETECT).catch(()=>{}); }
    });
    pronoteWin.webContents.on("page-title-updated", async(_, title) => {
      if(!title.startsWith("PPLOG:")) return;
      try {
        const data = JSON.parse(title.slice(6));
        const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
        sessionHandle = createSessionHandle(customFetcher);
        const refresh = await loginToken(sessionHandle, { url: data.url, kind: AccountKind.STUDENT, username: data.login, token: data.mdp, deviceUUID: data.uuid });
        const usr = sessionHandle.user.resources[0];
        pronoteWin.close(); pronoteWin = null; pendingLoginResolve = null;
        resolve({ ok: true, token: refresh.token, url: refresh.url, kind: refresh.kind, username: refresh.username,
          user: { name: sessionHandle.user.name, class: usr.studentClass?.name||usr.className||"", school: usr.establishmentName||"" } });
      } catch(err) { pronoteWin?.close(); pronoteWin = null; pendingLoginResolve = null; resolve({ ok: false, error: err.message }); }
    });
    pronoteWin.on("closed", () => { pronoteWin = null; if(pendingLoginResolve) { pendingLoginResolve({ ok: false, error: "closed" }); pendingLoginResolve = null; } });
  });
});

// ══ LOGIN TOKEN ══
ipcMain.handle("pronote:loginToken", async(_, { url, username, token, deviceUUID, kind }) => {
  try {
    const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
    sessionHandle = createSessionHandle(customFetcher);
    const refresh = await loginToken(sessionHandle, { url, kind: kind||AccountKind.STUDENT, username, token, deviceUUID });
    const usr = sessionHandle.user.resources[0];
    return { ok: true, token: refresh.token, user: { name: sessionHandle.user.name, class: usr.studentClass?.name||usr.className||"", school: usr.establishmentName||"" } };
  } catch(err) { return { ok: false, error: err.message }; }
});

// ══ PERIODS ══
ipcMain.handle("pronote:periods", async(_, { tab }) => {
  if(!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { TabLocation } = require("pawnote");
    const tabMap = { grades: TabLocation.Grades, attendance: TabLocation.Notebook };
    const t = sessionHandle.user.resources[0].tabs.get(tabMap[tab]);
    if(!t) return { ok: false, error: "Onglet non disponible" };
    const now = new Date();
    const current = t.periods.find(p => (!p.startDate||new Date(p.startDate)<=now)&&(!p.endDate||new Date(p.endDate)>=now));
    return { ok: true, periods: t.periods.map(p => ({ id: p.id, name: p.name, start: p.startDate?.toISOString(), end: p.endDate?.toISOString() })), current: current?.name||t.periods[0]?.name };
  } catch(err) { return { ok: false, error: err.message }; }
});

// ══ TIMETABLE ══
ipcMain.handle("pronote:timetable", async(_, { date }) => {
  if(!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { timetableFromWeek, parseTimetable, translateToWeekNumber } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const wn = translateToWeekNumber(d, sessionHandle.instance.firstMonday);
    const tt = await timetableFromWeek(sessionHandle, wn);
    parseTimetable(sessionHandle, tt, { withSuperposedCanceledClasses: false, withCanceledClasses: true, withPlannedClasses: true });
    const STATUS_MAP = { "Cours annulé":"cancelled","Prof. absent":"teacher_absent","Prof./pers. absent":"teacher_absent","Classe absente":"class_absent","Sortie pédagogique":"outing","Cours déplacé":"moved" };
    const lessons = tt.classes.map(c => {
      const base = { from: c.startDate?.toISOString(), to: c.endDate?.toISOString(), color: c.backgroundColor||"#22c55e", notes: c.notes||"" };
      if(c.is==="lesson") { const st = STATUS_MAP[c.status]||(c.isCancelled?"cancelled":null); return { ...base, type:"lesson", id:c.id, subject:c.subject?.name||"Cours", teacher:c.teacherNames?.join(", ")||"", room:c.classrooms?.join(", ")||"", group:c.groupNames?.join(", ")||"", isCancelled:c.isCancelled||st==="cancelled"||st==="teacher_absent"||false, isTest:c.test||false, status:st, customStatus:c.status||null, resourceId:c.lessonResourceID||null }; }
      if(c.is==="detention") return { ...base, type:"detention", id:c.id, subject:c.title||"Retenue", room:c.classrooms?.join(", ")||"", status:"detention" };
      if(c.is==="activity") return { ...base, type:"activity", id:c.id, subject:c.title||"Activité", status:"activity" };
      return null;
    }).filter(Boolean);
    return { ok: true, lessons };
  } catch(err) { return { ok: false, error: err.message }; }
});

// ══ GRADES ══
ipcMain.handle("pronote:grades", async(_, { periodName }) => {
  if(!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { gradesOverview, GradeKind, TabLocation } = require("pawnote");
    const gradeTab = sessionHandle.user.resources[0].tabs.get(TabLocation.Grades);
    if(!gradeTab) return { ok: false, error: "Notes non disponibles" };
    const period = periodName ? gradeTab.periods.find(p => p.name===periodName) : gradeTab.periods[0];
    const ov = await gradesOverview(sessionHandle, period);
    const ms = g => {
      if(!g) return { value:0, disabled:true, status:"—" };
      switch(g.kind) {
        case GradeKind.Grade: return { value:g.points??0, disabled:false };
        case GradeKind.NotGraded: return { value:0, disabled:true, status:"N. Not." };
        case GradeKind.Absent: return { value:0, disabled:true, status:"Abs." };
        case GradeKind.AbsentZero: return { value:0, disabled:false, status:"Abs.*" };
        case GradeKind.Exempted: return { value:0, disabled:true, status:"Disp." };
        case GradeKind.Unfit: return { value:0, disabled:true, status:"Disp." };
        case GradeKind.Unreturned: return { value:0, disabled:true, status:"N. Rendu" };
        case GradeKind.UnreturnedZero: return { value:0, disabled:false, status:"N. Rendu*" };
        default: return { value:0, disabled:true, status:"—" };
      }
    };
    const allG = ov.grades.map(g => ({ id:g.id, subjectId:g.subject?.id, subjectName:g.subject?.name||"Matière", description:g.comment||"", givenAt:g.date?.toISOString()||null, outOf:ms(g.outOf), coefficient:g.coefficient??1, studentScore:ms(g.value), averageScore:ms(g.average), minScore:ms(g.min), maxScore:ms(g.max), isBonus:g.isBonus||false, isOptional:g.isOptional||false }));
    const subjects = ov.subjectsAverages.map(a => ({ id:a.subject?.id, name:a.subject?.name||"", studentAverage:ms(a.student), classAverage:ms(a.class_average), maximum:ms(a.max), minimum:ms(a.min), grades:allG.filter(g=>g.subjectId===a.subject?.id) }));
    return { ok:true, subjects, overall:ms(ov.overallAverage), classAverage:ms(ov.classAverage), periodName:period?.name };
  } catch(err) { return { ok:false, error:err.message }; }
});

// ══ HOMEWORK ══
ipcMain.handle("pronote:homework", async(_, { weekOffset=0 }) => {
  if(!sessionHandle) return { ok:false, error:"Non connecté" };
  try {
    const { assignmentsFromWeek, translateToWeekNumber } = require("pawnote");
    const d = new Date(); d.setDate(d.getDate()+weekOffset*7);
    const day = d.getDay(); d.setDate(d.getDate()-day+(day===0?-6:1));
    const wn = translateToWeekNumber(d, sessionHandle.instance.firstMonday);
    const hw = await assignmentsFromWeek(sessionHandle, wn);
    return { ok:true, homeworks:hw.map(h => ({ id:h.id, subject:h.subject?.name||"Matière", content:h.description||"", dueDate:h.deadline?.toISOString()||null, isDone:h.done||false, attachments:(h.attachments||[]).map(a=>({name:a.name,url:a.url})) })) };
  } catch(err) { return { ok:false, error:err.message }; }
});

ipcMain.handle("pronote:homework:toggle", async(_, { id, status }) => {
  if(!sessionHandle) return { ok:false, error:"Non connecté" };
  try { const { assignmentStatus } = require("pawnote"); await assignmentStatus(sessionHandle, id, status); return { ok:true }; }
  catch(err) { return { ok:false, error:err.message }; }
});

// ══ NEWS ══
ipcMain.handle("pronote:news", async() => {
  if(!sessionHandle) return { ok:false, error:"Non connecté" };
  try {
    const { news: pNews } = require("pawnote");
    const res = await pNews(sessionHandle);
    const items = res?.items||res||[];
    return { ok:true, news:items.map(n => ({ id:n.id, title:n.title||"", content:n.content||"", author:n.author||"", category:n.category?.name||n.category||"", createdAt:n.creationDate?.toISOString()||null, acknowledged:n.read||false, attachments:(n.attachments||[]).map(a=>({name:a.name,url:a.url})) })) };
  } catch(err) { return { ok:false, error:err.message }; }
});

// ══ ATTENDANCE ══
ipcMain.handle("pronote:attendance", async(_, { periodName }) => {
  if(!sessionHandle) return { ok:false, error:"Non connecté" };
  try {
    const { notebook, TabLocation } = require("pawnote");
    const attTab = sessionHandle.user.resources[0].tabs.get(TabLocation.Notebook);
    if(!attTab) return { ok:false, error:"Vie scolaire non disponible" };
    const period = periodName ? attTab.periods.find(p=>p.name===periodName) : attTab.periods[0];
    const att = await notebook(sessionHandle, period);
    return { ok:true,
      delays:(att.delays||[]).map(d=>({id:d.id,givenAt:d.date?.toISOString(),reason:d.reason||"",justified:d.justified||false,duration:d.minutes||0})),
      absences:(att.absences||[]).map(a=>({id:a.id,from:a.startDate?.toISOString(),to:a.endDate?.toISOString(),reason:a.reason||"",justified:a.justified||false,timeMissed:(a.hoursMissed||0)*60+(a.minutesMissed||0)})),
      punishments:(att.punishments||[]).map(p=>({id:p.id,givenAt:p.dateGiven?.toISOString(),givenBy:p.giver||"",nature:p.title||"",reason:p.reasons?.join(", ")||"",duration:p.durationMinutes||0})),
      observations:(att.observations||[]).map(o=>({id:o.id,givenAt:o.date?.toISOString(),sectionName:o.name||"",subjectName:o.subject?.name||"",reason:o.reason||""})),
    };
  } catch(err) { return { ok:false, error:err.message }; }
});

// ══ CANTEEN ══
ipcMain.handle("pronote:canteen", async(_, { date }) => {
  if(!sessionHandle) return { ok:false, error:"Non connecté" };
  try {
    const { menus } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const wm = await menus(sessionHandle, d);
    if(!wm?.days?.length) return { ok:true, days:[] };
    const mF = f => (f||[]).map(x=>({name:x.name,allergens:(x.allergens||[]).map(a=>a.name)}));
    const mM = m => m ? { entry:mF(m.entry),main:mF(m.main),side:mF(m.side),cheese:mF(m.fromage),dessert:mF(m.dessert),drink:mF(m.drink) } : null;
    return { ok:true, days:wm.days.map(day=>({date:day.date?.toISOString(),lunch:mM(day.lunch),dinner:mM(day.dinner)})) };
  } catch(err) { return { ok:false, error:err.message }; }
});

ipcMain.handle("pronote:logout", async() => { sessionHandle = null; return { ok:true }; });
ipcMain.on("open-external", (_, url) => shell.openExternal(url));
