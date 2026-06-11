const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const API_PORT = Number(process.env.LIFE_MANAGER_API_PORT || 8000);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const isDev = !app.isPackaged;

let mainWindow = null;
let backendProcess = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
    socket.connect(port, host);
  });
}

async function waitForBackend(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(API_PORT)) {
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

function startBackend() {
  const { command, args, cwd } = getBackendCommand();

  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      FRONTEND_ORIGIN: "null",
      LIFE_MANAGER_API_PORT: String(API_PORT),
    },
    stdio: isDev ? "inherit" : "pipe",
  });

  backendProcess.on("exit", (code) => {
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

app.whenReady().then(async () => {
  startBackend();

  const backendReady = await waitForBackend();
  if (!backendReady) {
    dialog.showErrorBox(
      "Life Managerを起動できませんでした",
      `バックエンドAPIに接続できませんでした。${API_BASE_URL}/health を確認してください。`,
    );
  }

  await createWindow();
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
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
