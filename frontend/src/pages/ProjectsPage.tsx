import { useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
} from "../api/projects";
import { fetchGoals } from "../api/goals";
import {
  createProjectReflection,
  deleteProjectReflection,
  fetchProjectReflections,
  updateProjectReflection,
} from "../api/projectReflections";
import type { Project } from "../api/projects";
import type { ProjectReflection } from "../api/projectReflections";
import type { Goal } from "../api/goals";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState("");
  const [projectReflections, setProjectReflections] = useState<ProjectReflection[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("0");
  const [projectStatus, setProjectStatus] = useState("active");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [completionProject, setCompletionProject] = useState<Project | null>(null);
  const [differenceReason, setDifferenceReason] = useState("");
  const [nextImprovement, setNextImprovement] = useState("");
  const [completionError, setCompletionError] = useState("");

  async function loadData() {
    const [projectData, goalData, reflectionData] = await Promise.all([
      fetchProjects(),
      fetchGoals(),
      fetchProjectReflections(),
    ]);

    setProjects(projectData);
    setGoals(goalData);
    setProjectReflections(reflectionData);

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
        status: projectStatus,
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
    setProjectStatus("active");
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
    setProjectStatus(project.status);
  }

  async function handleDelete(id: number) {
    await deleteProject(id);
    await loadData();
  }

  function getGoalTitle(id: number) {
    return goals.find((goal) => goal.id === id)?.title ?? `目標ID: ${id}`;
  }

  function getProjectReflection(projectId: number) {
    return projectReflections.find((reflection) => reflection.project_id === projectId);
  }

  function openCompletionReflection(project: Project) {
    const reflection = getProjectReflection(project.id);
    setCompletionProject(project);
    setDifferenceReason(reflection?.difference_reason ?? "");
    setNextImprovement(reflection?.next_improvement ?? "");
    setCompletionError("");
  }

  async function handleSaveCompletionReflection(e: React.FormEvent) {
    e.preventDefault();

    if (!completionProject) return;

    const existingReflection = getProjectReflection(completionProject.id);
    const input = {
      project_id: completionProject.id,
      estimated_minutes: completionProject.estimated_minutes,
      actual_minutes: completionProject.actual_minutes,
      difference_minutes:
        completionProject.actual_minutes - completionProject.estimated_minutes,
      difference_reason: differenceReason || null,
      next_improvement: nextImprovement || null,
    };

    try {
      setCompletionError("");

      if (existingReflection) {
        await updateProjectReflection(existingReflection.id, input);
      } else {
        await createProjectReflection(input);
      }

      setCompletionProject(null);
      setDifferenceReason("");
      setNextImprovement("");
      await loadData();
    } catch (error) {
      console.error(error);
      setCompletionError("プロジェクト完了時振り返りの保存に失敗しました。");
    }
  }

  async function handleDeleteCompletionReflection(projectId: number) {
    const reflection = getProjectReflection(projectId);
    if (!reflection) return;

    await deleteProjectReflection(reflection.id);
    await loadData();
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

          {editingProject && (
            <div style={{ marginTop: "12px" }}>
              <label>状態</label>
              <br />
              <select
                value={projectStatus}
                onChange={(e) => setProjectStatus(e.target.value)}
                style={{ width: "420px", padding: "8px" }}
              >
                <option value="active">進行中</option>
                <option value="completed">完了</option>
                <option value="paused">保留</option>
              </select>
            </div>
          )}

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

              <ProjectCompletionReflectionCard
                actualMinutes={project.actual_minutes}
                estimatedMinutes={project.estimated_minutes}
                reflection={getProjectReflection(project.id)}
                onDelete={() => handleDeleteCompletionReflection(project.id)}
                onEdit={() => openCompletionReflection(project)}
              />

              <button onClick={() => handleEdit(project)}>編集</button>
              <button
                onClick={() => openCompletionReflection(project)}
                style={{ marginLeft: "8px" }}
              >
                完了時振り返り
              </button>
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

      {completionProject && (
        <section
          style={{
            marginTop: "32px",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: "12px",
            background: "#fff",
          }}
        >
          <h2>プロジェクト完了時振り返り</h2>
          <p style={{ color: "#666" }}>{completionProject.title}</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <SummaryBox
              label="予想工数"
              value={formatProjectMinutes(completionProject.estimated_minutes)}
            />
            <SummaryBox
              label="実績工数"
              value={formatProjectMinutes(completionProject.actual_minutes)}
            />
            <SummaryBox
              label="差異"
              value={formatSignedMinutes(
                completionProject.actual_minutes - completionProject.estimated_minutes
              )}
            />
          </div>

          <form onSubmit={handleSaveCompletionReflection}>
            <label>差異理由</label>
            <br />
            <textarea
              value={differenceReason}
              onChange={(e) => setDifferenceReason(e.target.value)}
              placeholder="例：調査時間を見積もりに入れていなかった"
              style={{ width: "100%", minHeight: "90px", padding: "8px" }}
            />

            <div style={{ marginTop: "12px" }}>
              <label>次回改善点</label>
              <br />
              <textarea
                value={nextImprovement}
                onChange={(e) => setNextImprovement(e.target.value)}
                placeholder="例：実装前に不明点調査の時間を30分確保する"
                style={{ width: "100%", minHeight: "90px", padding: "8px" }}
              />
            </div>

            {completionError && <p style={{ color: "#b00020" }}>{completionError}</p>}

            <button type="submit" style={{ marginTop: "16px" }}>
              保存する
            </button>
            <button
              type="button"
              onClick={() => setCompletionProject(null)}
              style={{ marginLeft: "8px" }}
            >
              キャンセル
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function formatProjectMinutes(minutes: number) {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const remainingMinutes = absMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}分`;
  }

  return `${hours}時間${remainingMinutes}分`;
}

function formatSignedMinutes(minutes: number) {
  if (minutes === 0) {
    return "差異なし";
  }

  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatProjectMinutes(minutes)}`;
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        background: "#fafafa",
      }}
    >
      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectCompletionReflectionCard({
  actualMinutes,
  estimatedMinutes,
  onDelete,
  onEdit,
  reflection,
}: {
  actualMinutes: number;
  estimatedMinutes: number;
  onDelete: () => void;
  onEdit: () => void;
  reflection?: ProjectReflection;
}) {
  if (!reflection) {
    return (
      <div
        style={{
          margin: "16px 0",
          padding: "12px",
          border: "1px dashed #ccc",
          borderRadius: "8px",
          color: "#666",
        }}
      >
        完了時振り返りはまだありません。
      </div>
    );
  }

  const differenceMinutes = actualMinutes - estimatedMinutes;

  return (
    <div
      style={{
        margin: "16px 0",
        padding: "12px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        background: "#fafafa",
      }}
    >
      <h4 style={{ marginTop: 0 }}>完了時振り返り</h4>
      <p>差異: {formatSignedMinutes(differenceMinutes)}</p>
      <p>差異理由: {reflection.difference_reason || "未入力"}</p>
      <p>次回改善点: {reflection.next_improvement || "未入力"}</p>
      <button type="button" onClick={onEdit}>
        振り返りを編集
      </button>
      <button type="button" onClick={onDelete} style={{ marginLeft: "8px" }}>
        振り返りを削除
      </button>
    </div>
  );
}
