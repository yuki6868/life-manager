import CalendarPage from "./pages/CalendarPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import TasksPage from "./pages/TasksPage";
import TimerPage from "./pages/TimerPage";

function App() {
  return (
    <>
      <GoalsPage />
      <hr />
      <ProjectsPage />
      <hr />
      <TasksPage />
      <hr />
      <CalendarPage />
      <hr />
      <TimerPage />
    </>
  );
}

export default App;