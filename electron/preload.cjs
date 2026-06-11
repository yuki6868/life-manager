const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("lifeManagerDesktop", {
  apiBaseUrl: process.env.LIFE_MANAGER_API_BASE_URL || "http://127.0.0.1:8000",
});
