const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const API_PORT = Number(process.env.LIFE_MANAGER_API_PORT || 8000);
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

function requestJson(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
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

async function isLifeManagerBackendReady() {
  const health = await requestJson(`${API_BASE_URL}/health`);
  return Boolean(health && health.status === "ok" && health.app === "Life Manager");
}

async function waitForBackend(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isLifeManagerBackendReady()) {
      return true;
    }
    await wait(300);
  }
  return false;
}

function getBackendCommand() {
  if (isDev) {
    return {
      command: process.env.PYTHON || "python3",
      args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
      cwd: path.join(__dirname, "..", "backend"),
    };
  }

  const executableName = process.platform === "win32" ? "life-manager-backend.exe" : "life-manager-backend";
  return {
    command: path.join(process.resourcesPath, "backend", executableName),
    args: ["--host", "127.0.0.1", "--port", String(API_PORT)],
    cwd: process.resourcesPath,
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
  const { command, args, cwd } = getBackendCommand();
  backendLogStream = openBackendLogStream();

  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      FRONTEND_ORIGIN: "null",
      LIFE_MANAGER_API_PORT: String(API_PORT),
      LIFE_MANAGER_API_BASE_URL: API_BASE_URL,
      LIFE_MANAGER_DATA_DIR: getDesktopDataDir(),
    },
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  if (!isDev && backendLogStream) {
    backendLogStream.write(`\n[${new Date().toISOString()}] start backend\n`);
    backendProcess.stdout?.pipe(backendLogStream, { end: false });
    backendProcess.stderr?.pipe(backendLogStream, { end: false });
  }

  backendProcess.on("exit", (code) => {
    if (!isDev && backendLogStream) {
      backendLogStream.write(`\n[${new Date().toISOString()}] backend exited: ${code}\n`);
    }
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

    if (!(await isLifeManagerBackendReady())) {
      startBackend();
    }

    const backendReady = await waitForBackend();
    if (!backendReady) {
      dialog.showErrorBox(
        "Life Managerを起動できませんでした",
        `バックエンドAPIに接続できませんでした。${API_BASE_URL}/health を確認してください。`,
      );
    }

    await createWindow();
  });
}

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (backendLogStream) {
    backendLogStream.end();
    backendLogStream = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
