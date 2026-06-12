const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const API_PORT = Number(process.env.LIFE_MANAGER_API_PORT || process.env.API_PORT || 8000);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const isDev = !app.isPackaged;

let mainWindow = null;
let backendProcess = null;
let backendLogStream = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDesktopDataDir() {
  if (process.env.LIFE_MANAGER_DATA_DIR) {
    return path.resolve(process.env.LIFE_MANAGER_DATA_DIR);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "LifeManagerData");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "LifeManagerData");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "LifeManagerData");
}

function ensureDesktopDataDir() {
  const dataDir = getDesktopDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  return dataDir;
}

function writeBackendLog(message) {
  if (!backendLogStream) {
    return;
  }
  backendLogStream.write(`[${new Date().toISOString()}] ${message}\n`);
}

function requestJson(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

async function isBackendReady() {
  const healthUrls = [`${API_BASE_URL}/health`, `${API_BASE_URL}/api/health`];

  for (const url of healthUrls) {
    const health = await requestJson(url);
    if (health && (health.status === "ok" || health.ok === true || health.raw)) {
      return true;
    }
  }
  return false;
}

async function waitForBackend(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendReady()) {
      return true;
    }
    await wait(300);
  }
  return false;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function getExistingCommand(candidates) {
  return candidates.find((candidate) => fileExists(candidate.command) && (!candidate.cwd || fileExists(candidate.cwd)));
}

function getBackendCommand() {
  if (isDev) {
    const backendDir = path.join(__dirname, "..", "backend");
    const runServerPath = path.join(backendDir, "run_server.py");

    if (fileExists(runServerPath)) {
      return {
        command: process.env.PYTHON || "python3",
        args: [runServerPath],
        cwd: backendDir,
      };
    }

    return {
      command: process.env.PYTHON || "python3",
      args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
      cwd: backendDir,
    };
  }

  const executableNames = process.platform === "win32"
    ? ["life-manager-backend.exe", "competitive-debug-backend.exe", "backend.exe"]
    : ["life-manager-backend", "competitive-debug-backend", "backend"];

  const backendDirs = [
    path.join(process.resourcesPath, "backend"),
    path.join(process.resourcesPath, "app.asar.unpacked", "backend"),
    path.join(process.resourcesPath, "app", "backend"),
  ];

  const executableCandidates = backendDirs.flatMap((backendDir) =>
    executableNames.map((executableName) => ({
      command: path.join(backendDir, executableName),
      args: ["--host", "127.0.0.1", "--port", String(API_PORT)],
      cwd: backendDir,
    })),
  );

  const runServerCandidates = backendDirs.map((backendDir) => ({
    command: process.env.PYTHON || "python3",
    args: [path.join(backendDir, "run_server.py")],
    cwd: backendDir,
  }));

  const command = getExistingCommand(executableCandidates) || getExistingCommand(runServerCandidates);
  if (command) {
    return command;
  }

  return {
    command: "",
    args: [],
    cwd: process.resourcesPath,
    error: `backend executable/run_server.py not found. searched: ${backendDirs.join(", ")}`,
  };
}

function openBackendLogStream() {
  if (isDev) {
    return null;
  }

  const dataDir = ensureDesktopDataDir();
  const logPath = path.join(dataDir, "logs", "backend.log");
  return fs.createWriteStream(logPath, { flags: "a" });
}

function startBackend() {
  const { command, args, cwd, error } = getBackendCommand();
  backendLogStream = openBackendLogStream();

  if (error || !command) {
    writeBackendLog(error || "backend command is empty");
    throw new Error(error || "backend command is empty");
  }

  writeBackendLog(`start backend: ${command} ${args.join(" ")}`);
  writeBackendLog(`cwd: ${cwd}`);
  writeBackendLog(`resourcesPath: ${process.resourcesPath}`);
  writeBackendLog(`appPath: ${app.getAppPath()}`);

  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      FRONTEND_ORIGIN: "null",
      LIFE_MANAGER_API_PORT: String(API_PORT),
      API_PORT: String(API_PORT),
      LIFE_MANAGER_API_BASE_URL: API_BASE_URL,
      VITE_API_BASE_URL: API_BASE_URL,
      LIFE_MANAGER_DATA_DIR: getDesktopDataDir(),
    },
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  backendProcess.on("error", (err) => {
    writeBackendLog(`backend spawn error: ${err.message}`);
  });

  if (!isDev && backendLogStream) {
    backendProcess.stdout?.pipe(backendLogStream, { end: false });
    backendProcess.stderr?.pipe(backendLogStream, { end: false });
  }

  backendProcess.on("exit", (code) => {
    writeBackendLog(`backend exited: ${code}`);
    if (code !== 0 && mainWindow) {
      console.error(`Backend exited with code ${code}`);
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    title: "Life Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.LIFE_MANAGER_FRONTEND_URL || "http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    ensureDesktopDataDir();

    if (!(await isBackendReady())) {
      try {
        startBackend();
      } catch (err) {
        dialog.showErrorBox(
          "バックエンドを起動できませんでした",
          `${err instanceof Error ? err.message : String(err)}\n\nログ: ${path.join(getDesktopDataDir(), "logs", "backend.log")}`,
        );
      }
    }

    const backendReady = await waitForBackend();
    if (!backendReady) {
      dialog.showErrorBox(
        "バックエンドAPIに接続できませんでした",
        `${API_BASE_URL}/health または ${API_BASE_URL}/api/health を確認してください。\n\nログ: ${path.join(getDesktopDataDir(), "logs", "backend.log")}`,
      );
    }

    await createWindow();
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (backendLogStream) {
    backendLogStream.end();
    backendLogStream = null;
  }
}

app.on("window-all-closed", () => {
  // macOSではウィンドウを閉じてもアプリ本体は終了しない。
  // ここでbackendを止めると、Dockから再表示したときにfrontendだけ起動してAPI/DBを読めなくなる。
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (!(await isBackendReady())) {
    try {
      startBackend();
      const backendReady = await waitForBackend();
      if (!backendReady) {
        dialog.showErrorBox(
          "バックエンドAPIに接続できませんでした",
          `${API_BASE_URL}/health または ${API_BASE_URL}/api/health を確認してください。\n\nログ: ${path.join(getDesktopDataDir(), "logs", "backend.log")}`,
        );
      }
    } catch (err) {
      dialog.showErrorBox(
        "バックエンドを起動できませんでした",
        `${err instanceof Error ? err.message : String(err)}\n\nログ: ${path.join(getDesktopDataDir(), "logs", "backend.log")}`,
      );
    }
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on("will-quit", () => {
  stopBackend();
});
