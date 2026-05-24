const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

let win;
let session = null; // pawnote SessionHandle

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
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!win) createWindow(); });

// Pronote custom fetcher — exact same User-Agent as the real Papillon app
const customFetcher = async (options) => {
  const response = await fetch(options.url, {
    method: options.method,
    headers: {
      ...options.headers,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 PRONOTE Mobile APP Version/2.0.11"
    },
    body: options.method !== "GET" ? options.content : undefined,
    redirect: options.redirect,
  });
  const content = await response.text();
  return { content, status: response.status, headers: response.headers };
};

// ── LOGIN WITH TOKEN (restore session) ──
ipcMain.handle("pronote:loginToken", async (_, { url, username, token, deviceUUID, kind }) => {
  try {
    const { createSessionHandle, loginToken, AccountKind } = require("pawnote");
    session = createSessionHandle(customFetcher);
    const refresh = await loginToken(session, {
      url,
      kind: kind || AccountKind.STUDENT,
      username,
      token,
      deviceUUID,
    });
    const user = session.user.resources[0];
    return {
      ok: true,
      token: refresh.token,
      user: {
        name: session.user.name,
        class: user.className || "",
        school: user.establishmentName || "",
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── LOGIN WITH QR CODE ──
ipcMain.handle("pronote:loginQR", async (_, { qrData, pin, deviceUUID }) => {
  try {
    const { createSessionHandle, loginQrCode, AccountKind } = require("pawnote");
    session = createSessionHandle(customFetcher);

    const parsed = JSON.parse(qrData);
    const refresh = await loginQrCode(session, {
      qr: {
        jeton: parsed.jeton,
        login: parsed.login,
        url: parsed.url,
      },
      pin,
      deviceUUID,
    });

    const user = session.user.resources[0];
    return {
      ok: true,
      token: refresh.token,
      url: refresh.url,
      kind: refresh.kind,
      username: refresh.username,
      user: {
        name: session.user.name,
        class: user.className || "",
        school: user.establishmentName || "",
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── TIMETABLE ──
ipcMain.handle("pronote:timetable", async (_, { date }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { timetableFromWeek, parseTimetable, translateToWeekNumber } = require("pawnote");
    const d = date ? new Date(date) : new Date();
    const weekNumber = translateToWeekNumber(d, session.instance.firstMonday);
    const timetable = await timetableFromWeek(session, weekNumber);
    parseTimetable(session, timetable, {
      withSuperposedCanceledClasses: false,
      withCanceledClasses: true,
      withPlannedClasses: true,
    });

    const lessons = timetable.classes
      .filter(c => c.is === "lesson" || c.is === "detention")
      .map(c => ({
        from: c.startDate?.toISOString(),
        to: c.endDate?.toISOString(),
        subject: c.is === "lesson" ? (c.subject?.name || "Cours") : "Retenue",
        teacher: c.is === "lesson" ? (c.teacherNames?.join(", ") || "") : "",
        room: c.is === "lesson" ? (c.classrooms?.join(", ") || "") : "",
        color: c.backgroundColor || "#22c55e",
        isCancelled: c.is === "lesson" ? (c.isCancelled || false) : false,
        isDetention: c.is === "detention",
        notes: c.notes || "",
      }));

    return { ok: true, lessons };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── GRADES ──
ipcMain.handle("pronote:grades", async () => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { gradesOverview, GradeKind, TabLocation } = require("pawnote");

    const gradeTab = session.user.resources[0].tabs.get(TabLocation.Grades);
    if (!gradeTab) return { ok: false, error: "Onglet notes non disponible" };

    const period = gradeTab.periods[0];
    const overview = await gradesOverview(session, period);

    const mapScore = (g) => {
      if (!g) return null;
      if (g.kind === GradeKind.Grade) return g.points ?? null;
      return null;
    };

    const grades = overview.grades.map(g => ({
      subject: g.subject?.name || "Matière",
      description: g.comment || "",
      value: mapScore(g.value),
      outOf: mapScore(g.outOf) ?? 20,
      average: mapScore(g.average),
      min: mapScore(g.min),
      max: mapScore(g.max),
      coefficient: g.coefficient ?? 1,
      date: g.date?.toISOString() || null,
      valueStatus: g.value?.kind !== GradeKind.Grade ? (g.value?.kind === GradeKind.Absent ? "Abs." : "N.Not.") : null,
    }));

    const subjects = overview.subjectsAverages.map(a => ({
      name: a.subject?.name || "",
      student: mapScore(a.student),
      classAverage: mapScore(a.class_average),
    }));

    const overall = mapScore(overview.overallAverage);
    const classAvg = mapScore(overview.classAverage);

    return { ok: true, grades, subjects, overall, classAvg };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── HOMEWORK ──
ipcMain.handle("pronote:homework", async (_, { weekOffset = 0 }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { assignmentsFromWeek, translateToWeekNumber } = require("pawnote");
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    const weekNumber = translateToWeekNumber(d, session.instance.firstMonday);
    const homeworks = await assignmentsFromWeek(session, weekNumber);

    const list = homeworks.map(h => ({
      id: h.id,
      subject: h.subject?.name || "Matière",
      content: h.description || "",
      dueDate: h.deadline?.toISOString() || null,
      done: h.done || false,
      attachments: (h.attachments || []).map(a => ({ name: a.name, url: a.url })),
    }));

    return { ok: true, homeworks: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── TOGGLE HOMEWORK ──
ipcMain.handle("pronote:homework:toggle", async (_, { id, done }) => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { assignmentStatus } = require("pawnote");
    await assignmentStatus(session, id, done);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── NEWS ──
ipcMain.handle("pronote:news", async () => {
  if (!session) return { ok: false, error: "Non connecté" };
  try {
    const { newsItems, TabLocation } = require("pawnote");
    const newsTab = session.user.resources[0].tabs.get(TabLocation.News);
    if (!newsTab) return { ok: false, error: "Actualités non disponibles" };
    const items = await newsItems(session);
    const list = items.map(n => ({
      id: n.id,
      title: n.title || "",
      content: n.content || "",
      author: n.author || "",
      date: n.date?.toISOString() || null,
      read: n.acknowledged || false,
    }));
    return { ok: true, news: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── LOGOUT ──
ipcMain.handle("pronote:logout", async () => {
  session = null;
  return { ok: true };
});

ipcMain.on("open-external", (_, url) => shell.openExternal(url));
