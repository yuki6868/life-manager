import { useEffect, useState } from "react";
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  updateTaskStatus,
} from "../api/tasks";
import { fetchProjects } from "../api/projects";
import type { Task } from "../api/tasks";
import type { Project } from "../api/projects";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("0");
  const [energyLevel, setEnergyLevel] = useState("medium");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  async function loadData() {
    const [taskData, projectData] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
    ]);

    setTasks(taskData);
    setProjects(projectData);

    if (!projectId && projectData.length > 0) {
      setProjectId(String(projectData[0].id));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!projectId || !title.trim()) return;

    const input = {
      project_id: Number(projectId),
      title,
      description,
      priority,
      estimated_minutes: Number(estimatedMinutes || 0),
      energy_level: energyLevel,
    };

    if (editingTask) {
      await updateTask(editingTask.id, {
        ...input,
        actual_minutes: editingTask.actual_minutes,
        status: taskStatus,
      });
    } else {
      await createTask(input);
    }

    resetForm();
    await loadData();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setEstimatedMinutes("0");
    setEnergyLevel("medium");
    setTaskStatus("todo");
    setEditingTask(null);

    if (projects.length > 0) {
      setProjectId(String(projects[0].id));
    }
  }

  function handleEdit(task: Task) {
    setEditingTask(task);
    setProjectId(String(task.project_id));
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setEstimatedMinutes(String(task.estimated_minutes));
    setEnergyLevel(task.energy_level);
    setTaskStatus(task.status);
  }

  async function handleStatusChange(task: Task, status: string) {
    await updateTaskStatus(task.id, status);
    await loadData();
  }

  async function handleDelete(id: number) {
    await deleteTask(id);
    await loadData();
  }

  function getProjectTitle(id: number) {
    return projects.find((project) => project.id === id)?.title ?? `プロジェクトID: ${id}`;
  }

  return (
    <div className="landscape-page landscape-form-list-page" style={{ padding: "32px" }}>
      <h1>タスク管理</h1>

      {projects.length === 0 ? (
        <p>先にプロジェクトを作成してください。</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
          <div>
            <label>紐づけるプロジェクト</label>
            <br />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>タスクタイトル</label>
            <br />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：API設計をする"
              style={{ width: "420px", padding: "8px" }}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>説明</label>
            <br />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="タスクの詳細を書く"
              style={{ width: "420px", height: "90px", padding: "8px" }}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>優先度</label>
            <br />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
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

          <div style={{ marginTop: "12px" }}>
            <label>エネルギーレベル</label>
            <br />
            <select
              value={energyLevel}
              onChange={(e) => setEnergyLevel(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              <option value="high">高集中</option>
              <option value="medium">普通</option>
              <option value="low">疲れていても可能</option>
            </select>
          </div>

          {editingTask && (
            <div style={{ marginTop: "12px" }}>
              <label>状態</label>
              <br />
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value)}
                style={{ width: "420px", padding: "8px" }}
              >
                <option value="todo">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="completed">完了</option>
                <option value="paused">保留</option>
                <option value="cancelled">中止</option>
              </select>
            </div>
          )}

          <button type="submit" style={{ marginTop: "16px" }}>
            {editingTask ? "更新する" : "作成する"}
          </button>

          {editingTask && (
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

      <h2>タスク一覧</h2>

      {tasks.length === 0 ? (
        <p>まだタスクがありません。</p>
      ) : (
        <div>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <h3>{task.title}</h3>
              <p>{task.description || "説明なし"}</p>
              <p>プロジェクト: {getProjectTitle(task.project_id)}</p>
              <p>優先度: {task.priority}</p>
              <p>予定工数: {task.estimated_minutes}分</p>
              <p>実績工数: {task.actual_minutes}分</p>
              <p>エネルギー: {task.energy_level}</p>
              <p>状態: {getTaskStatusLabel(task.status)}</p>

              <StatusActionButtons
                currentStatus={task.status}
                options={TASK_STATUS_OPTIONS}
                onChange={(status) => handleStatusChange(task, status)}
              />

              <button onClick={() => handleEdit(task)}>編集</button>
              <button
                onClick={() => handleDelete(task.id)}
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

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

function getTaskStatusLabel(status: string) {
  return TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function StatusActionButtons({
  currentStatus,
  onChange,
  options,
}: {
  currentStatus: string;
  onChange: (status: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.value === currentStatus}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
