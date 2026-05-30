import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import GapTasksPage from "./pages/GapTasksPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ReflectionsPage from "./pages/ReflectionsPage";
import TasksPage from "./pages/TasksPage";
import TimerPage from "./pages/TimerPage";
import SettingsPage from "./pages/SettingsPage";
import WeekCalendarPage from "./pages/WeekCalendarPage";
import WorkLogsPage from "./pages/WorkLogsPage";
import { APP_SETTINGS_UPDATED_EVENT, type EnergyLevel, readEnergyLevel, readFocusMode } from "./utils/appSettings";
import "./App.css";

type MenuItem = {
  path: string;
  label: string;
  icon: string;
  badge?: string;
};


const energyLevelLabels: Record<EnergyLevel, string> = {
  low: "低め 😌",
  normal: "元気 🙂",
  high: "高集中 🔥",
};

const energyLevelBarCounts: Record<EnergyLevel, number> = {
  low: 1,
  normal: 3,
  high: 4,
};

const menuItems: MenuItem[] = [
  { path: "/dashboard", label: "ダッシュボード", icon: "⌂" },
  { path: "/calendar", label: "カレンダー", icon: "□" },
  { path: "/projects", label: "プロジェクト", icon: "▧" },
  { path: "/tasks", label: "タスク", icon: "☷" },
  { path: "/timer", label: "タイマー", icon: "◷" },
  { path: "/work-logs", label: "工数・進捗", icon: "▥" },
  { path: "/reflections", label: "振り返り", icon: "✓" },
  { path: "/gap-tasks", label: "スキマタスク", icon: "♢" },
  { path: "/goals", label: "目標", icon: "◎" },
  { path: "/settings", label: "設定", icon: "⚙" },
];

function AppShell() {
  const location = useLocation();
  const isDashboard = location.pathname === "/" || location.pathname.startsWith("/dashboard");
  const [focusMode, setFocusMode] = useState(readFocusMode);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>(readEnergyLevel);

  useEffect(() => {
    function syncSettings() {
      setFocusMode(readFocusMode());
      setEnergyLevel(readEnergyLevel());
    }

    syncSettings();
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, syncSettings);
    window.addEventListener("storage", syncSettings);

    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  const activeEnergyBars = useMemo(() => energyLevelBarCounts[energyLevel], [energyLevel]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="メインメニュー">
        <div className="app-brand">
          <span className="app-brand__mark" aria-hidden="true">✓</span>
          <div>
            <p className="app-brand__name">AI秘書</p>
            <p className="app-brand__subtitle">行動管理</p>
          </div>
        </div>

        <nav className="app-menu">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "app-menu__link app-menu__link--active" : "app-menu__link"
              }
            >
              <span className="app-menu__icon" aria-hidden="true">{item.icon}</span>
              <span className="app-menu__label">{item.label}</span>
              {item.badge && <span className="app-menu__badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={focusMode ? "app-sidebar-card" : "app-sidebar-card app-sidebar-card--muted"}>
          <p>集中モード</p>
          <strong>{focusMode ? "ON" : "OFF"} / {energyLevelLabels[energyLevel]}</strong>
          <span>{focusMode ? "設定画面と同期中" : "集中モードは無効です"}</span>
          <div className="app-energy-bars" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <i key={index} className={index < activeEnergyBars && focusMode ? "app-energy-bars__bar app-energy-bars__bar--active" : "app-energy-bars__bar"} />
            ))}
          </div>
          <NavLink to="/settings">変更する</NavLink>
        </div>
      </aside>

      <div className="app-main-area">
        {!isDashboard && (
          <header className="app-header">
            <div>
              <p className="app-header__eyebrow">AI Secretary</p>
              <h1 className="app-header__title">
                {menuItems.find((item) => location.pathname.startsWith(item.path))?.label ?? "AI秘書"}
              </h1>
            </div>
          </header>
        )}

        <main className={isDashboard ? "app-content app-content--dashboard" : "app-content"}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/calendar/week" element={<WeekCalendarPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/work-logs" element={<WorkLogsPage />} />
            <Route path="/reflections" element={<ReflectionsPage />} />
            <Route path="/gap-tasks" element={<GapTasksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
