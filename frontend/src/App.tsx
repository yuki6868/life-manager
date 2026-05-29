import CalendarPage from "./pages/CalendarPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import TasksPage from "./pages/TasksPage";

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
    </>
  );
}

export default App;