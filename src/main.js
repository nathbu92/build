const { app, BrowserWindow, Menu, ipcMain, shell, session: electronSession } = require("electron");
const path = require("path");

let mainWin;
let pronoteWin = null;
let sessionHandle = null;
let pendingLoginResolve = null;

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

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1380, height: 860, minWidth: 1100, minHeight: 700,
    title: "Papillon", icon: path.join(__dirname, "../assets/icon.ico"),
    backgroundColor: "#0f1a14", autoHideMenuBar: true, frame: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(null);
  mainWin.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!mainWin) createWindow(); });

// ── SEARCH SCHOOLS (pawnote geolocation) ──
ipcMain.handle("pronote:search", async (_, { query, lat, lon }) => {
  try {
    const { geolocation } = require("pawnote");
    let schools = [];
    if (lat && lon) {
      schools = await geolocation({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
    } else if (query) {
      // Try geolocation with city name via nominatim
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
        headers: { "User-Agent": "Papillon/8.4.2" }
      });
      const geoData = await geoRes.json();
      if (geoData?.[0]) {
        schools = await geolocation({ latitude: parseFloat(geoData[0].lat), longitude: parseFloat(geoData[0].lon) });
      }
    }
    return { ok: true, schools: schools.map(s => ({ name: s.name, url: s.url, distance: s.distance })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── PRONOTE WEBVIEW LOGIN ──
ipcMain.handle("pronote:openWebview", async (_, { url, schoolName }) => {
  return new Promise((resolve) => {
    pendingLoginResolve = resolve;
    const deviceUUID = require("crypto").randomUUID();
    const infoMobileURL = url + (url.endsWith("/") ? "" : "/") + "InfoMobileApp.json?id=0D264427-EEFC-4810-A9E9-346942A862A4";

    // Use a separate session (incognito-like)
    const loginSession = electronSession.fromPartition(`pronote-login-${Date.now()}`, { cache: false });

    pronoteWin = new BrowserWindow({
      width: 420, height: 700, parent: mainWin, modal: true,
      title: `Connexion — ${schoolName || "Pronote"}`,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false, contextIsolation: false,
        session: loginSession,
        userAgent: "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
      },
    });

    // Inject JS to intercept login state
    const INJECT_HOOK = `
      window.hookAccesDepuisAppli = function() {
        this.passerEnModeValidationAppliMobile('', '${deviceUUID}');
      };
      try {
        window.GInterface.passerEnModeValidationAppliMobile('', '${deviceUUID}', '', '', '{"model":"random","platform":"android"}');
      } catch(e) {}
    `;

    const INJECT_LOGIN_STATE = `
      (function() {
        setInterval(function() {
          const state = window && window.loginState ? window.loginState : undefined;
          if (state && state.status === 0) {
            window.electronLoginData = JSON.stringify({ login: state.login, mdp: state.mdp, deviceUUID: '${deviceUUID}', url: '${url}' });
            document.title = 'PAPILLON_LOGIN:' + window.electronLoginData;
          }
        }, 800);
      })();
    `;

    const INJECT_JSON = (schoolUrl, uuid, expires) => `
      (function() {
        try {
          const json = JSON.parse(document.body.innerText);
          const jeton = json && json.CAS && json.CAS.jetonCAS;
          document.cookie = "appliMobile=; expires=${new Date(0).toUTCString()}";
          if (jeton) {
            document.cookie = "validationAppliMobile=" + jeton + "; expires=${expires}";
            document.cookie = "uuidAppliMobile=${uuid}; expires=${expires}";
            document.cookie = "ielang=1036; expires=${new Date(Date.now() + 365*24*60*60*1000).toUTCString()}";
          }
          window.location.assign("${schoolUrl}/mobile.eleve.html?fd=1");
        } catch(e) {}
      })();
    `;

    pronoteWin.loadURL(infoMobileURL);

    pronoteWin.webContents.on("did-finish-load", () => {
      const currentURL = pronoteWin.webContents.getURL();
      pronoteWin.webContents.executeJavaScript(INJECT_HOOK).catch(() => {});
      if (currentURL === infoMobileURL || currentURL.includes("InfoMobileApp")) {
        const exp = new Date(Date.now() + 5*60*1000).toUTCString();
        pronoteWin.webContents.executeJavaScript(INJECT_JSON(url, deviceUUID, exp)).catch(() => {});
      } else if (currentURL.includes("mobile.eleve.html")) {
        pronoteWin.webContents.executeJavaScript(INJECT_HOOK).catch(() => {});
        pronoteWin.webContents.executeJavaScript(INJECT_LOGIN_STATE).catch(() => {});
      }
    });

    // Intercept title change to get login data
    pronoteWin.webContents.on("page-title-updated", async (evt, title) => {
      if (!title.startsWith("PAPILLON_LOGIN:")) return;
      try {
        const data = JSON.parse(title.replace("PAPILLON_LOGIN:", ""));
        const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
        sessionHandle = createSessionHandle(customFetcher);
        const refresh = await loginToken(sessionHandle, {
          url: data.url, kind: AccountKind.STUDENT,
          username: data.login, token: data.mdp, deviceUUID: data.deviceUUID,
        });
        const user = sessionHandle.user.resources[0];
        pronoteWin.close();
        pronoteWin = null;
        resolve({ ok: true, token: refresh.token, url: refresh.url, kind: refresh.kind, username: refresh.username,
          user: { name: sessionHandle.user.name, class: user.studentClass?.name || user.className || "", school: user.establishmentName || "" }
        });
      } catch (err) {
        pronoteWin.close();
        pronoteWin = null;
        resolve({ ok: false, error: err.message });
      }
    });

    pronoteWin.on("closed", () => {
      pronoteWin = null;
      if (pendingLoginResolve) { pendingLoginResolve({ ok: false, error: "Fenêtre fermée" }); pendingLoginResolve = null; }
    });
  });
});

// ── LOGIN TOKEN (reconnect) ──
ipcMain.handle("pronote:loginToken", async (_, { url, username, token, deviceUUID, kind }) => {
  try {
    const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
    sessionHandle = createSessionHandle(customFetcher);
    const refresh = await loginToken(sessionHandle, { url, kind: kind || AccountKind.STUDENT, username, token, deviceUUID });
    const user = sessionHandle.user.resources[0];
    return { ok: true, token: refresh.token, user: { name: sessionHandle.user.name, class: user.studentClass?.name || user.className || "", school: user.establishmentName || "" } };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── ECOLEDIRECTE LOGIN ──
ipcMain.handle("ed:login", async (_, { username, password }) => {
  try {
    const { Client } = require("@blockshub/blocksdirecte");
    const client = new Client();
    const tokens = await client.auth.loginUsername(username, password, undefined, undefined, true, require("crypto").randomUUID());
    if (!tokens) throw new Error("Connexion échouée");
    client.auth.setAccount(0);
    const auth = client.auth.getAccount();
    return { ok: true, user: { name: auth.prenom + " " + auth.nom, class: "", school: auth.nomEtablissement || "" }, token: auth.accessToken, username };
  } catch (err) {
    if (err.constructor?.name === "Require2FA" || err.message?.includes("2FA")) {
      return { ok: false, needs2FA: true, token2FA: err.token };
    }
    return { ok: false, error: err.message };
  }
});

// ── PERIODS ──
ipcMain.handle("pronote:periods", async (_, { tab }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { TabLocation } = require("pawnote");
    const tabMap = { grades: TabLocation.Grades, attendance: TabLocation.Notebook };
    const t = sessionHandle.user.resources[0].tabs.get(tabMap[tab]);
    if (!t) return { ok: false, error: "Onglet non disponible" };
    return { ok: true, periods: t.periods.map(p => ({ id: p.id, name: p.name, start: p.startDate?.toISOString(), end: p.endDate?.toISOString() })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── TIMETABLE ──
ipcMain.handle("pronote:timetable", async (_, { date }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { timetableFromWeek, parseTimetable, translateToWeekNumber } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const weekNumber = translateToWeekNumber(d, sessionHandle.instance.firstMonday);
    const timetable = await timetableFromWeek(sessionHandle, weekNumber);
    parseTimetable(sessionHandle, timetable, { withSuperposedCanceledClasses: false, withCanceledClasses: true, withPlannedClasses: true });
    const lessons = timetable.classes.map(c => {
      const base = { from: c.startDate?.toISOString(), to: c.endDate?.toISOString(), color: c.backgroundColor || "#22c55e", notes: c.notes || "" };
      if (c.is === "lesson") return { ...base, type: "lesson", id: c.id, subject: c.subject?.name || "Cours", teacher: c.teacherNames?.join(", ") || "", room: c.classrooms?.join(", ") || "", group: c.groupNames?.join(", ") || "", isCancelled: c.isCancelled || false, isTest: c.test || false, status: c.status || null };
      if (c.is === "detention") return { ...base, type: "detention", id: c.id, subject: c.title || "Retenue", room: c.classrooms?.join(", ") || "" };
      if (c.is === "activity") return { ...base, type: "activity", id: c.id, subject: c.title || "Activité" };
      return null;
    }).filter(Boolean);
    return { ok: true, lessons };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── GRADES ──
ipcMain.handle("pronote:grades", async (_, { periodName }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { gradesOverview, GradeKind, TabLocation } = require("pawnote");
    const gradeTab = sessionHandle.user.resources[0].tabs.get(TabLocation.Grades);
    if (!gradeTab) return { ok: false, error: "Notes non disponibles" };
    const period = periodName ? gradeTab.periods.find(p => p.name === periodName) : gradeTab.periods[0];
    const overview = await gradesOverview(sessionHandle, period);
    const mapScore = (g) => {
      if (!g) return { value: 0, disabled: true, status: "—" };
      switch (g.kind) {
        case GradeKind.Grade: return { value: g.points ?? 0, disabled: false };
        case GradeKind.NotGraded: return { value: 0, disabled: true, status: "N. Not." };
        case GradeKind.Absent: return { value: 0, disabled: true, status: "Abs." };
        case GradeKind.AbsentZero: return { value: 0, disabled: false, status: "Abs.*" };
        case GradeKind.Exempted: return { value: 0, disabled: true, status: "Disp." };
        case GradeKind.Unreturned: return { value: 0, disabled: true, status: "N. Rendu" };
        case GradeKind.UnreturnedZero: return { value: 0, disabled: false, status: "N. Rendu*" };
        default: return { value: 0, disabled: true, status: "—" };
      }
    };
    const allGrades = overview.grades.map(g => ({
      id: g.id, subjectId: g.subject?.id, subjectName: g.subject?.name || "Matière",
      description: g.comment || "", givenAt: g.date?.toISOString() || null,
      outOf: mapScore(g.outOf), coefficient: g.coefficient ?? 1,
      studentScore: mapScore(g.value), averageScore: mapScore(g.average),
      minScore: mapScore(g.min), maxScore: mapScore(g.max),
      isBonus: g.isBonus || false, isOptional: g.isOptional || false,
    }));
    const subjects = overview.subjectsAverages.map(a => ({
      id: a.subject?.id, name: a.subject?.name || "",
      studentAverage: mapScore(a.student), classAverage: mapScore(a.class_average),
      grades: allGrades.filter(g => g.subjectId === a.subject?.id),
    }));
    return { ok: true, subjects, overall: mapScore(overview.overallAverage), classAverage: mapScore(overview.classAverage) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── HOMEWORK ──
ipcMain.handle("pronote:homework", async (_, { weekOffset = 0 }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { assignmentsFromWeek, translateToWeekNumber } = require("pawnote");
    const d = new Date(); d.setDate(d.getDate() + weekOffset * 7);
    const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    const weekNumber = translateToWeekNumber(d, sessionHandle.instance.firstMonday);
    const homeworks = await assignmentsFromWeek(sessionHandle, weekNumber);
    return { ok: true, homeworks: homeworks.map(h => ({ id: h.id, subject: h.subject?.name || "Matière", content: h.description || "", dueDate: h.deadline?.toISOString() || null, isDone: h.done || false, attachments: (h.attachments || []).map(a => ({ name: a.name, url: a.url })) })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── TOGGLE HOMEWORK ──
ipcMain.handle("pronote:homework:toggle", async (_, { id, status }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try { const { assignmentStatus } = require("pawnote"); await assignmentStatus(sessionHandle, id, status); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

// ── NEWS ──
ipcMain.handle("pronote:news", async () => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { news: pNews } = require("pawnote");
    const response = await pNews(sessionHandle);
    const items = response?.items || response || [];
    return { ok: true, news: items.map(n => ({ id: n.id, title: n.title || "", content: n.content || "", author: n.author || "", category: n.category?.name || n.category || "", createdAt: n.creationDate?.toISOString() || null, acknowledged: n.read || false, attachments: (n.attachments || []).map(a => ({ name: a.name, url: a.url })) })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── ATTENDANCE ──
ipcMain.handle("pronote:attendance", async (_, { periodName }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { notebook, TabLocation } = require("pawnote");
    const attendanceTab = sessionHandle.user.resources[0].tabs.get(TabLocation.Notebook);
    if (!attendanceTab) return { ok: false, error: "Vie scolaire non disponible" };
    const period = periodName ? attendanceTab.periods.find(p => p.name === periodName) : attendanceTab.periods[0];
    const att = await notebook(sessionHandle, period);
    return {
      ok: true,
      delays: (att.delays || []).map(d => ({ id: d.id, givenAt: d.date?.toISOString(), reason: d.reason || "", justified: d.justified || false, duration: d.minutes || 0 })),
      absences: (att.absences || []).map(a => ({ id: a.id, from: a.startDate?.toISOString(), to: a.endDate?.toISOString(), reason: a.reason || "", justified: a.justified || false, timeMissed: (a.hoursMissed || 0) * 60 + (a.minutesMissed || 0) })),
      punishments: (att.punishments || []).map(p => ({ id: p.id, givenAt: p.dateGiven?.toISOString(), givenBy: p.giver || "", nature: p.title || "", reason: p.reasons?.join(", ") || "", duration: p.durationMinutes || 0 })),
      observations: (att.observations || []).map(o => ({ id: o.id, givenAt: o.date?.toISOString(), sectionName: o.name || "", subjectName: o.subject?.name || "", reason: o.reason || "" })),
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── CANTEEN ──
ipcMain.handle("pronote:canteen", async (_, { date }) => {
  if (!sessionHandle) return { ok: false, error: "Non connecté" };
  try {
    const { menus } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const weeklyMenu = await menus(sessionHandle, d);
    if (!weeklyMenu?.days?.length) return { ok: true, days: [] };
    const mapFood = (foods) => (foods || []).map(f => ({ name: f.name, allergens: (f.allergens || []).map(a => a.name) }));
    const mapMeal = (meal) => meal ? { entry: mapFood(meal.entry), main: mapFood(meal.main), side: mapFood(meal.side), cheese: mapFood(meal.fromage), dessert: mapFood(meal.dessert), drink: mapFood(meal.drink) } : null;
    return { ok: true, days: weeklyMenu.days.map(day => ({ date: day.date?.toISOString(), lunch: mapMeal(day.lunch), dinner: mapMeal(day.dinner) })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── LOGOUT ──
ipcMain.handle("pronote:logout", async () => { sessionHandle = null; return { ok: true }; });
ipcMain.on("open-external", (_, url) => shell.openExternal(url));
