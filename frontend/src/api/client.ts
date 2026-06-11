import axios from "axios";

declare global {
  interface Window {
    lifeManagerDesktop?: {
      apiBaseUrl?: string;
    };
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  window.lifeManagerDesktop?.apiBaseUrl ||
  "http://127.0.0.1:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
