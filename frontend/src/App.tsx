import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import GapTasksPage from "./pages/GapTasksPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ReflectionsPage from "./pages/ReflectionsPage";
import TasksPage from "./pages/TasksPage";
import TimerPage from "./pages/TimerPage";
import WorkLogsPage from "./pages/WorkLogsPage";
import "./App.css";

type MenuItem = {
  path: string;
  label: string;
  description: string;
  icon: string;
};

const menuItems: MenuItem[] = [
  {
    path: "/dashboard",
    label: "ダッシュボード",
    description: "今日の状況と秘書提案",
    icon: "🏠",
  },
  {
    path: "/goals",
    label: "目標",
    description: "長期目標の管理",
    icon: "🎯",
  },
  {
    path: "/projects",
    label: "プロジェクト",
    description: "進捗と工数の確認",
    icon: "📁",
  },
  {
    path: "/tasks",
    label: "タスク",
    description: "TODOと優先度管理",
    icon: "✅",
  },
  {
    path: "/calendar",
    label: "カレンダー",
    description: "予定と実績タイムライン",
    icon: "📅",
  },
  {
    path: "/timer",
    label: "タイマー",
    description: "作業開始・中断・再開",
    icon: "⏱️",
  },
  {
    path: "/work-logs",
    label: "実績",
    description: "作業ログの集計",
    icon: "📊",
  },
  {
    path: "/reflections",
    label: "振り返り",
    description: "日次・完了時レビュー",
    icon: "📝",
  },
  {
    path: "/gap-tasks",
    label: "スキマタスク",
    description: "短時間でできる作業",
    icon: "🧩",
  },
];

function AppShell() {
  const location = useLocation();
  const currentMenuItem =
    menuItems.find((item) => location.pathname.startsWith(item.path)) ?? menuItems[0];

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="メインメニュー">
        <div className="app-brand">
          <span className="app-brand__mark">AI</span>
          <div>
            <p className="app-brand__name">Life Manager</p>
            <p className="app-brand__subtitle">行動管理AI秘書</p>
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
              <span className="app-menu__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <span className="app-menu__label">{item.label}</span>
                <span className="app-menu__description">{item.description}</span>
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main-area">
        <header className="app-header">
          <div>
            <p className="app-header__eyebrow">Freelance AI Secretary</p>
            <h1 className="app-header__title">{currentMenuItem.label}</h1>
            <p className="app-header__description">{currentMenuItem.description}</p>
          </div>
        </header>

        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/work-logs" element={<WorkLogsPage />} />
            <Route path="/reflections" element={<ReflectionsPage />} />
            <Route path="/gap-tasks" element={<GapTasksPage />} />
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
