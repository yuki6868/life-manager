import { useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
} from "../api/projects";
import { fetchGoals } from "../api/goals";
import type { Project } from "../api/projects";
import type { Goal } from "../api/goals";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("0");
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  async function loadData() {
    const [projectData, goalData] = await Promise.all([
      fetchProjects(),
      fetchGoals(),
    ]);

    setProjects(projectData);
    setGoals(goalData);

    if (!goalId && goalData.length > 0) {
      setGoalId(String(goalData[0].id));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!goalId || !title.trim()) return;

    const input = {
      goal_id: Number(goalId),
      title,
      description,
      estimated_minutes: Number(estimatedMinutes || 0),
    };

    if (editingProject) {
      await updateProject(editingProject.id, {
        ...input,
        actual_minutes: editingProject.actual_minutes,
        status: editingProject.status,
      });
    } else {
      await createProject(input);
    }

    resetForm();
    await loadData();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setEstimatedMinutes("0");
    setEditingProject(null);

    if (goals.length > 0) {
      setGoalId(String(goals[0].id));
    }
  }

  function handleEdit(project: Project) {
    setEditingProject(project);
    setGoalId(String(project.goal_id));
    setTitle(project.title);
    setDescription(project.description ?? "");
    setEstimatedMinutes(String(project.estimated_minutes));
  }

  async function handleDelete(id: number) {
    await deleteProject(id);
    await loadData();
  }

  function getGoalTitle(id: number) {
    return goals.find((goal) => goal.id === id)?.title ?? `目標ID: ${id}`;
  }

  return (
    <div style={{ padding: "32px" }}>
      <h1>プロジェクト管理</h1>

      {goals.length === 0 ? (
        <p>先に目標を作成してください。</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
          <div>
            <label>紐づける目標</label>
            <br />
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>プロジェクトタイトル</label>
            <br />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：MVP開発"
              style={{ width: "420px", padding: "8px" }}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>説明</label>
            <br />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="プロジェクトの詳細を書く"
              style={{ width: "420px", height: "90px", padding: "8px" }}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>予定工数（分）</label>
            <br />
            <input
              type="number"
              min="0"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            />
          </div>

          <button type="submit" style={{ marginTop: "16px" }}>
            {editingProject ? "更新する" : "作成する"}
          </button>

          {editingProject && (
            <button
              type="button"
              onClick={resetForm}
              style={{ marginLeft: "8px" }}
            >
              キャンセル
            </button>
          )}
        </form>
      )}

      <h2>プロジェクト一覧</h2>

      {projects.length === 0 ? (
        <p>まだプロジェクトがありません。</p>
      ) : (
        <div>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <h3>{project.title}</h3>
              <p>{project.description || "説明なし"}</p>
              <p>目標: {getGoalTitle(project.goal_id)}</p>
              <p>状態: {project.status}</p>
              <p>予定工数: {project.estimated_minutes}分</p>
              <p>実績工数: {project.actual_minutes}分</p>

              <button onClick={() => handleEdit(project)}>編集</button>
              <button
                onClick={() => handleDelete(project.id)}
                style={{ marginLeft: "8px" }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}