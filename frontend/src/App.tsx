import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import GapTasksPage from "./pages/GapTasksPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ReflectionsPage from "./pages/ReflectionsPage";
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
      <hr />
      <ReflectionsPage />
      <hr />
      <GapTasksPage />
    </>
  );
}

export default App;