const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

let win;
let pronoteSession = null; // stores the active Pawnote instance

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
  win.on("closed", () => { win = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!win) createWindow(); });

// ── PRONOTE LOGIN ──
ipcMain.handle("pronote:login", async (_, { url, username, password, cas }) => {
  try {
    const pawnote = require("pawnote");

    pronoteSession = await pawnote.authenticateWithCredentials({
      url,
      username,
      password,
      cas: cas || undefined,
    });

    const user = pronoteSession.user;
    return {
      ok: true,
      user: {
        name: user.name,
        class: user.studentClass?.name || "",
        school: pronoteSession.schoolName || "",
        avatar: user.avatar || null,
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── TIMETABLE ──
ipcMain.handle("pronote:timetable", async (_, { date }) => {
  if (!pronoteSession) return { ok: false, error: "Non connecté" };
  try {
    const pawnote = require("pawnote");
    const day = date ? new Date(date) : new Date();
    const timetable = await pronoteSession.readTimetable(
      pawnote.Period.fromDate(pronoteSession, day)
    );
    const lessons = timetable.lessons.map(l => ({
      start: l.startDate?.toISOString(),
      end: l.endDate?.toISOString(),
      subject: l.subject?.name || "Cours",
      teacher: l.teacher?.name || "",
      room: l.room?.name || "",
      color: l.subject?.color || "#22c55e",
      isCancelled: l.isCancelled || false,
      isDetention: l.isDetention || false,
    }));
    return { ok: true, lessons };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── GRADES ──
ipcMain.handle("pronote:grades", async () => {
  if (!pronoteSession) return { ok: false, error: "Non connecté" };
  try {
    const periods = pronoteSession.readPeriodsForGrades();
    const period = periods[0];
    const overview = await pronoteSession.readGradesOverview(period);
    const grades = overview.grades.map(g => ({
      subject: g.subject?.name || "Matière",
      title: g.comment || "",
      value: typeof g.student === "number" ? g.student : null,
      outOf: typeof g.outOf === "number" ? g.outOf : 20,
      average: typeof g.average === "number" ? g.average : null,
      date: g.date?.toISOString() || null,
      color: g.subject?.color || "#22c55e",
    }));
    const subjectAverages = overview.averages.map(a => ({
      subject: a.subject?.name || "",
      student: typeof a.student === "number" ? a.student : null,
      class: typeof a.class === "number" ? a.class : null,
      color: a.subject?.color || "#22c55e",
    }));
    return { ok: true, grades, subjectAverages };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── HOMEWORK ──
ipcMain.handle("pronote:homework", async () => {
  if (!pronoteSession) return { ok: false, error: "Non connecté" };
  try {
    const now = new Date();
    const inTwoWeeks = new Date(now);
    inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
    const homeworks = await pronoteSession.readHomework(now, inTwoWeeks);
    const list = homeworks.map(h => ({
      subject: h.subject?.name || "Matière",
      description: h.description || "",
      due: h.deadline?.toISOString() || null,
      done: h.done || false,
      id: h.id,
    }));
    return { ok: true, homeworks: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── TOGGLE HOMEWORK DONE ──
ipcMain.handle("pronote:homework:toggle", async (_, { id, done }) => {
  if (!pronoteSession) return { ok: false, error: "Non connecté" };
  try {
    await pronoteSession.patchHomeworkStatus(id, done);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── NEWS ──
ipcMain.handle("pronote:news", async () => {
  if (!pronoteSession) return { ok: false, error: "Non connecté" };
  try {
    const news = await pronoteSession.readNews();
    const list = news.map(n => ({
      title: n.title || "",
      content: n.content || "",
      author: n.author || "",
      date: n.date?.toISOString() || null,
      category: n.category || "",
    }));
    return { ok: true, news: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── LOGOUT ──
ipcMain.handle("pronote:logout", async () => {
  pronoteSession = null;
  return { ok: true };
});

ipcMain.on("open-external", (_, url) => shell.openExternal(url));
