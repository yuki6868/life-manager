import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import TasksPage from "./pages/TasksPage";
import TimerPage from "./pages/TimerPage";
import WorkLogsPage from "./pages/WorkLogsPage";

function App() {
  return (
    <>
      <DashboardPage />
      <hr />
      <GoalsPage />
      <hr />
      <ProjectsPage />
      <hr />
      <TasksPage />
      <hr />
      <CalendarPage />
      <hr />
      <TimerPage />
      <hr />
      <WorkLogsPage />
    </>
  );
}

export default App;