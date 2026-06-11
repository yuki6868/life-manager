const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const checks = [];

function addCheck(label, relativePath, executable = false) {
  const fullPath = path.join(root, relativePath);
  const exists = fs.existsSync(fullPath);
  let ok = exists;

  if (exists && executable && process.platform !== "win32") {
    const mode = fs.statSync(fullPath).mode;
    ok = Boolean(mode & 0o111);
  }

  checks.push({ label, relativePath, ok });
}

const backendBinary = process.platform === "win32"
  ? "backend/dist/life-manager-backend.exe"
  : "backend/dist/life-manager-backend";

addCheck("Electron main", "electron/main.cjs");
addCheck("Electron preload", "electron/preload.cjs");
addCheck("Frontend build", "frontend/dist/index.html");
addCheck("Desktop backend binary", backendBinary, true);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "NG"} ${check.label}: ${check.relativePath}`);
}

if (failed.length > 0) {
  console.error("\n配布前チェックに失敗しました。先に `npm run desktop:build` を実行してください。");
  process.exit(1);
}

console.log("\n配布前チェック OK。次は `npm run desktop:dist:dir` で .app を作れます。");
