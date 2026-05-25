const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

let win;
let session = null;

// Exact same fetcher as the real Papillon app
const customFetcher = async (options) => {
  const response = await fetch(options.url, {
    method: options.method,
    headers: {
      ...options.headers,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 PRONOTE Mobile APP Version/2.0.11"
    },
    body: options.method !== "GET" ? options.content : void 0,
    redirect: options.redirect,
  });
  const content = await response.text();
  return { content, status: response.status, get headers() { return response.headers; } };
};

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640,
    title: "Papillon", icon: path.join(__dirname, "../assets/icon.ico"),
    backgroundColor: "#0f1a14", autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!win) createWindow(); });

// ── LOGIN QR ──
ipcMain.handle("pronote:loginQR", async (_, { qrData, pin, deviceUUID }) => {
  try {
    const { createSessionHandle, loginQrCode } = require("pawnote");
    session = createSessionHandle(customFetcher);
    const parsed = JSON.parse(qrData);
    const refresh = await loginQrCode(session, {
      qr: { jeton: parsed.jeton, login: parsed.login, url: parsed.url },
      pin, deviceUUID,
    });
    const user = session.user.resources[0];
    return {
      ok: true, token: refresh.token, url: refresh.url,
      kind: refresh.kind, username: refresh.username,
      user: { name: session.user.name, class: user.studentClass?.name || "", school: user.establishmentName || "" }
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── LOGIN TOKEN ──
ipcMain.handle("pronote:loginToken", async (_, { url, username, token, deviceUUID, kind }) => {
  try {
    const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
    session = createSessionHandle(customFetcher);
    const refresh = await loginToken(session, {
      url, kind: kind || AccountKind.STUDENT, username, token, deviceUUID,
    });
    const user = session.user.resources[0];
    return {
      ok: true, token: refresh.token,
      user: { name: session.user.name, class: user.studentClass?.name || "", school: user.establishmentName || "" }
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── GET PERIODS ──
ipcMain.handle("pronote:periods", async (_, { tab }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { TabLocation } = require("pawnote");
    const tabMap = { grades: TabLocation.Grades, attendance: TabLocation.Notebook };
    const t = session.user.resources[0].tabs.get(tabMap[tab]);
    if (!t) return { ok: false, error: "Onglet non disponible" };
    return { ok: true, periods: t.periods.map(p => ({ id: p.id, name: p.name, start: p.startDate?.toISOString(), end: p.endDate?.toISOString() })) };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── TIMETABLE ──
ipcMain.handle("pronote:timetable", async (_, { date }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { timetableFromWeek, parseTimetable, translateToWeekNumber } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const weekNumber = translateToWeekNumber(d, session.instance.firstMonday);
    const timetable = await timetableFromWeek(session, weekNumber);
    parseTimetable(session, timetable, { withSuperposedCanceledClasses: false, withCanceledClasses: true, withPlannedClasses: true });

    const lessons = timetable.classes.map(c => {
      const base = { from: c.startDate?.toISOString(), to: c.endDate?.toISOString(), color: c.backgroundColor || "#22c55e", notes: c.notes || "" };
      if (c.is === "lesson") return { ...base, type: "lesson", id: c.id, subject: c.subject?.name || "Cours", teacher: c.teacherNames?.join(", ") || "", room: c.classrooms?.join(", ") || "", group: c.groupNames?.join(", ") || "", isCancelled: c.isCancelled || false, isTest: c.test || false, status: c.status || null, resourceId: c.lessonResourceID || null };
      if (c.is === "detention") return { ...base, type: "detention", id: c.id, subject: c.title || "Retenue", room: c.classrooms?.join(", ") || "" };
      if (c.is === "activity") return { ...base, type: "activity", id: c.id, subject: c.title || "Activité" };
      return null;
    }).filter(Boolean);

    return { ok: true, lessons };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── GRADES ──
ipcMain.handle("pronote:grades", async (_, { periodName }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { gradesOverview, GradeKind, TabLocation } = require("pawnote");
    const gradeTab = session.user.resources[0].tabs.get(TabLocation.Grades);
    if (!gradeTab) return { ok: false, error: "Notes non disponibles" };

    const period = periodName ? gradeTab.periods.find(p => p.name === periodName) : gradeTab.periods[0];
    if (!period) return { ok: false, error: "Période non trouvée" };

    const overview = await gradesOverview(session, period);

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
      max: mapScore(a.max), min: mapScore(a.min),
      grades: allGrades.filter(g => g.subjectId === a.subject?.id),
    }));

    return {
      ok: true, subjects,
      overall: mapScore(overview.overallAverage),
      classAverage: mapScore(overview.classAverage),
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── HOMEWORK ──
ipcMain.handle("pronote:homework", async (_, { weekOffset = 0 }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { assignmentsFromWeek, translateToWeekNumber } = require("pawnote");
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    // Go to Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const weekNumber = translateToWeekNumber(d, session.instance.firstMonday);
    const homeworks = await assignmentsFromWeek(session, weekNumber);
    return {
      ok: true, homeworks: homeworks.map(h => ({
        id: h.id, subject: h.subject?.name || "Matière", content: h.description || "",
        dueDate: h.deadline?.toISOString() || null, isDone: h.done || false,
        returnKind: h.return?.kind || 0,
        attachments: (h.attachments || []).map(a => ({ name: a.name, url: a.url, type: a.kind })),
      }))
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── TOGGLE HOMEWORK ──
ipcMain.handle("pronote:homework:toggle", async (_, { id, status }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { assignmentStatus } = require("pawnote");
    await assignmentStatus(session, id, status);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── NEWS ──
ipcMain.handle("pronote:news", async () => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { news: PawnoteNews, newsInformationAcknowledge } = require("pawnote");
    const response = await PawnoteNews(session);
    const items = response?.items || response || [];
    return {
      ok: true, news: items.map(n => ({
        id: n.id, title: n.title || "", content: n.content || "",
        author: n.author || "", category: n.category?.name || n.category || "",
        createdAt: n.creationDate?.toISOString() || null, acknowledged: n.read || false,
        attachments: (n.attachments || []).map(a => ({ name: a.name, url: a.url, type: a.kind })),
        hasQuestion: !!n.question,
      }))
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── ACKNOWLEDGE NEWS ──
ipcMain.handle("pronote:news:ack", async (_, { newsRef }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { newsInformationAcknowledge } = require("pawnote");
    await newsInformationAcknowledge(session, newsRef);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── ATTENDANCE ──
ipcMain.handle("pronote:attendance", async (_, { periodName }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { notebook, TabLocation } = require("pawnote");
    const attendanceTab = session.user.resources[0].tabs.get(TabLocation.Notebook);
    if (!attendanceTab) return { ok: false, error: "Vie scolaire non disponible" };

    const period = periodName
      ? attendanceTab.periods.find(p => p.name === periodName)
      : attendanceTab.periods[0];
    if (!period) return { ok: false, error: "Période non trouvée" };

    const attendance = await notebook(session, period);
    return {
      ok: true,
      delays: (attendance.delays || []).map(d => ({ id: d.id, givenAt: d.date?.toISOString(), reason: d.reason || "", justified: d.justified || false, duration: d.minutes || 0 })),
      absences: (attendance.absences || []).map(a => ({ id: a.id, from: a.startDate?.toISOString(), to: a.endDate?.toISOString(), reason: a.reason || "", justified: a.justified || false, timeMissed: (a.hoursMissed || 0) * 60 + (a.minutesMissed || 0) })),
      punishments: (attendance.punishments || []).map(p => ({ id: p.id, givenAt: p.dateGiven?.toISOString(), givenBy: p.giver || "", nature: p.title || "", reason: p.reasons?.join(", ") || "", duration: p.durationMinutes || 0, exclusion: p.exclusion || false })),
      observations: (attendance.observations || []).map(o => ({ id: o.id, givenAt: o.date?.toISOString(), sectionName: o.name || "", subjectName: o.subject?.name || "", reason: o.reason || "" })),
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── CANTEEN ──
ipcMain.handle("pronote:canteen", async (_, { date }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { menus } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const weeklyMenu = await menus(session, d);
    if (!weeklyMenu?.days?.length) return { ok: true, days: [] };
    const mapFood = (foods) => (foods || []).map(f => ({ name: f.name, allergens: (f.allergens || []).map(a => a.name) }));
    const mapMeal = (meal) => meal ? { entry: mapFood(meal.entry), main: mapFood(meal.main), side: mapFood(meal.side), cheese: mapFood(meal.fromage), dessert: mapFood(meal.dessert), drink: mapFood(meal.drink) } : null;
    return {
      ok: true, days: weeklyMenu.days.map(day => ({
        date: day.date?.toISOString(),
        lunch: mapMeal(day.lunch),
        dinner: mapMeal(day.dinner),
      }))
    };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ── LOGOUT ──
ipcMain.handle("pronote:logout", async () => { session = null; return { ok: true }; });
ipcMain.on("open-external", (_, url) => shell.openExternal(url));
