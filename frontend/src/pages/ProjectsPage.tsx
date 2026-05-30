import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
  updateProjectStatus,
} from "../api/projects";
import { fetchGoals } from "../api/goals";
import {
  createProjectReflection,
  deleteProjectReflection,
  fetchProjectReflections,
  updateProjectReflection,
} from "../api/projectReflections";
import { createTask, fetchTasks, updateTaskStatus } from "../api/tasks";
import type { Project } from "../api/projects";
import type { ProjectReflection } from "../api/projectReflections";
import type { Goal } from "../api/goals";
import type { Task } from "../api/tasks";

const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
];

type ProjectFilter = "all" | "active" | "paused" | "completed" | "cancelled";
type ProjectTab = "overview" | "tasks" | "work" | "reflection";

type ProjectFormState = {
  goalId: string;
  title: string;
  description: string;
  estimatedMinutes: string;
  status: string;
};

type TaskFormState = {
  title: string;
  description: string;
  estimatedMinutes: string;
  priority: string;
  energyLevel: string;
};

const emptyTaskForm: TaskFormState = {
  title: "",
  description: "",
  estimatedMinutes: "30",
  priority: "medium",
  energyLevel: "medium",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectReflections, setProjectReflections] = useState<ProjectReflection[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    goalId: "",
    title: "",
    description: "",
    estimatedMinutes: "60",
    status: "active",
  });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [completionProject, setCompletionProject] = useState<Project | null>(null);
  const [differenceReason, setDifferenceReason] = useState("");
  const [nextImprovement, setNextImprovement] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadData() {
    const [projectData, goalData, taskData, reflectionData] = await Promise.all([
      fetchProjects(),
      fetchGoals(),
      fetchTasks(),
      fetchProjectReflections(),
    ]);

    setProjects(projectData);
    setGoals(goalData);
    setTasks(taskData);
    setProjectReflections(reflectionData);

    setProjectForm((current) => ({
      ...current,
      goalId: current.goalId || (goalData[0] ? String(goalData[0].id) : ""),
    }));

    setSelectedProjectId((currentId) => {
      if (currentId && projectData.some((project) => project.id === currentId)) {
        return currentId;
      }
      return projectData[0]?.id ?? null;
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return projects.filter((project) => {
      const statusMatches = filter === "all" || project.status === filter;
      const queryMatches =
        !normalizedQuery ||
        project.title.toLowerCase().includes(normalizedQuery) ||
        (project.description ?? "").toLowerCase().includes(normalizedQuery);
      return statusMatches && queryMatches;
    });
  }, [filter, projects, query]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? null;
  }, [filteredProjects, projects, selectedProjectId]);

  const selectedProjectTasks = useMemo(() => {
    if (!selectedProject) return [];
    return tasks.filter((task) => task.project_id === selectedProject.id);
  }, [selectedProject, tasks]);

  const projectStats = useMemo(() => {
    const totalEstimated = selectedProject?.estimated_minutes ?? 0;
    const totalActual = selectedProject?.actual_minutes ?? 0;
    const progress = calculateProgress(totalActual, totalEstimated);
    const completedTasks = selectedProjectTasks.filter((task) => task.status === "completed").length;
    const inProgressTasks = selectedProjectTasks.filter((task) => task.status === "in_progress").length;
    const todoTasks = selectedProjectTasks.filter((task) => task.status !== "completed" && task.status !== "in_progress").length;
    return { totalEstimated, totalActual, progress, completedTasks, inProgressTasks, todoTasks };
  }, [selectedProject, selectedProjectTasks]);

  const counts = useMemo(() => {
    return {
      all: projects.length,
      active: projects.filter((project) => project.status === "active").length,
      paused: projects.filter((project) => project.status === "paused").length,
      completed: projects.filter((project) => project.status === "completed").length,
      cancelled: projects.filter((project) => project.status === "cancelled").length,
    };
  }, [projects]);

  function getGoalTitle(id: number) {
    return goals.find((goal) => goal.id === id)?.title ?? `目標ID: ${id}`;
  }

  function getProjectReflection(projectId: number) {
    return projectReflections.find((reflection) => reflection.project_id === projectId);
  }

  function openCreateProjectModal() {
    setEditingProject(null);
    setProjectForm({
      goalId: goals[0] ? String(goals[0].id) : "",
      title: "",
      description: "",
      estimatedMinutes: "60",
      status: "active",
    });
    setFormError("");
    setIsProjectModalOpen(true);
  }

  function openEditProjectModal(project: Project) {
    setEditingProject(project);
    setProjectForm({
      goalId: String(project.goal_id),
      title: project.title,
      description: project.description ?? "",
      estimatedMinutes: String(project.estimated_minutes),
      status: project.status,
    });
    setFormError("");
    setIsProjectModalOpen(true);
  }

  async function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!projectForm.goalId) {
      setFormError("先に目標を作成してください。");
      return;
    }

    if (!projectForm.title.trim()) {
      setFormError("プロジェクト名を入力してください。");
      return;
    }

    const input = {
      goal_id: Number(projectForm.goalId),
      title: projectForm.title.trim(),
      description: projectForm.description.trim(),
      estimated_minutes: Number(projectForm.estimatedMinutes || 0),
    };

    if (editingProject) {
      await updateProject(editingProject.id, {
        ...input,
        actual_minutes: editingProject.actual_minutes,
        status: projectForm.status,
      });
    } else {
      const createdProject = await createProject(input);
      setSelectedProjectId(createdProject.id);
    }

    setIsProjectModalOpen(false);
    setEditingProject(null);
    await loadData();
  }

  async function handleStatusChange(project: Project, status: string) {
    const updatedProject = await updateProjectStatus(project.id, status);
    setSelectedProjectId(updatedProject.id);

    if (status === "completed") {
      openCompletionReflection({ ...project, status });
    }

    await loadData();
  }

  async function handleDelete(project: Project) {
    const ok = window.confirm(`「${project.title}」を削除しますか？`);
    if (!ok) return;

    await deleteProject(project.id);
    await loadData();
  }

  function openCreateTaskModal() {
    if (!selectedProject) return;
    setTaskForm(emptyTaskForm);
    setFormError("");
    setIsTaskModalOpen(true);
  }

  async function handleTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject) return;

    if (!taskForm.title.trim()) {
      setFormError("タスク名を入力してください。");
      return;
    }

    await createTask({
      project_id: selectedProject.id,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      priority: taskForm.priority,
      estimated_minutes: Number(taskForm.estimatedMinutes || 0),
      energy_level: taskForm.energyLevel,
      status: "todo",
      task_type: "normal",
    });

    setIsTaskModalOpen(false);
    setTaskForm(emptyTaskForm);
    await loadData();
  }

  async function handleTaskStatusChange(task: Task, status: string) {
    await updateTaskStatus(task.id, status);
    await loadData();
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
      difference_minutes: completionProject.actual_minutes - completionProject.estimated_minutes,
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
    <div className="projects-page">
      <header className="projects-header">
        <div>
          <h1>プロジェクト</h1>
          <p>目標に紐づくプロジェクト、タスク、工数、振り返りを横画面で管理します。</p>
        </div>
        <div className="projects-header__actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="プロジェクトを検索..."
            className="projects-search"
          />
          <button type="button" className="projects-primary-button" onClick={openCreateProjectModal}>
            ＋ 新しいプロジェクト
          </button>
        </div>
      </header>

      <div className="projects-layout">
        <aside className="projects-list-panel">
          <div className="projects-filter-tabs">
            <ProjectFilterButton label="すべて" count={counts.all} value="all" current={filter} onClick={setFilter} />
            <ProjectFilterButton label="進行中" count={counts.active} value="active" current={filter} onClick={setFilter} />
            <ProjectFilterButton label="保留" count={counts.paused} value="paused" current={filter} onClick={setFilter} />
            <ProjectFilterButton label="完了" count={counts.completed} value="completed" current={filter} onClick={setFilter} />
          </div>

          {goals.length === 0 ? (
            <div className="projects-empty-card">
              <strong>先に目標を作成してください。</strong>
              <p>プロジェクトは目標に紐づけて管理します。</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="projects-empty-card">
              <strong>プロジェクトがありません。</strong>
              <p>右上の「新しいプロジェクト」から作成できます。</p>
              <button type="button" onClick={openCreateProjectModal}>プロジェクトを作成</button>
            </div>
          ) : (
            <div className="projects-list">
              {filteredProjects.map((project) => {
                const progress = calculateProgress(project.actual_minutes, project.estimated_minutes);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`project-list-card ${selectedProject?.id === project.id ? "project-list-card--active" : ""}`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <div className="project-list-card__top">
                      <span className={`status-dot status-dot--${project.status}`} />
                      <strong>{project.title}</strong>
                      <span className={`status-pill status-pill--${project.status}`}>{getProjectStatusLabel(project.status)}</span>
                    </div>
                    <p>{project.description || "説明なし"}</p>
                    <div className="project-progress-line"><span style={{ width: `${progress}%` }} /></div>
                    <div className="project-list-card__meta">
                      <span>目標：{getGoalTitle(project.goal_id)}</span>
                      <span>{formatProjectMinutes(project.actual_minutes)} / {formatProjectMinutes(project.estimated_minutes)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" className="projects-add-wide" onClick={openCreateProjectModal} disabled={goals.length === 0}>
            ＋ プロジェクトを追加
          </button>
        </aside>

        <main className="projects-detail-panel">
          {selectedProject ? (
            <>
              <section className="project-detail-hero">
                <div>
                  <div className="project-detail-title-row">
                    <span className={`status-dot status-dot--${selectedProject.status}`} />
                    <h2>{selectedProject.title}</h2>
                    <span className={`status-pill status-pill--${selectedProject.status}`}>{getProjectStatusLabel(selectedProject.status)}</span>
                  </div>
                  <div className="project-detail-meta">
                    <span>目標：{getGoalTitle(selectedProject.goal_id)}</span>
                    <span>想定：{formatProjectMinutes(selectedProject.estimated_minutes)}</span>
                    <span>実績：{formatProjectMinutes(selectedProject.actual_minutes)}</span>
                    <span>タスク：{selectedProjectTasks.length}件</span>
                  </div>
                </div>
                <div className="project-detail-actions">
                  <button type="button" onClick={() => openEditProjectModal(selectedProject)}>編集</button>
                  <button type="button" className="danger-button" onClick={() => handleDelete(selectedProject)}>削除</button>
                </div>
              </section>

              <nav className="project-detail-tabs">
                <ProjectTabButton label="概要" value="overview" current={activeTab} onClick={setActiveTab} />
                <ProjectTabButton label="タスク" value="tasks" current={activeTab} onClick={setActiveTab} />
                <ProjectTabButton label="工数" value="work" current={activeTab} onClick={setActiveTab} />
                <ProjectTabButton label="振り返り" value="reflection" current={activeTab} onClick={setActiveTab} />
              </nav>

              {activeTab === "overview" && (
                <div className="project-detail-grid">
                  <section className="project-card project-card--wide">
                    <h3>プロジェクトの概要</h3>
                    <p>{selectedProject.description || "説明はまだ登録されていません。"}</p>
                    <button type="button" className="text-button" onClick={() => openEditProjectModal(selectedProject)}>詳細を編集</button>
                  </section>
                  <ProjectProgressCard progress={projectStats.progress} stats={projectStats} />
                  <section className="project-card project-card--wide">
                    <div className="project-card-header">
                      <h3>タスク一覧</h3>
                      <button type="button" onClick={openCreateTaskModal}>＋ タスクを追加</button>
                    </div>
                    <TaskList tasks={selectedProjectTasks.slice(0, 5)} onStatusChange={handleTaskStatusChange} />
                  </section>
                  <WorkSummaryCard actualMinutes={projectStats.totalActual} estimatedMinutes={projectStats.totalEstimated} />
                </div>
              )}

              {activeTab === "tasks" && (
                <section className="project-card project-card--full">
                  <div className="project-card-header">
                    <h3>タスク一覧</h3>
                    <button type="button" onClick={openCreateTaskModal}>＋ タスクを追加</button>
                  </div>
                  <TaskList tasks={selectedProjectTasks} onStatusChange={handleTaskStatusChange} />
                </section>
              )}

              {activeTab === "work" && (
                <div className="project-detail-grid project-detail-grid--work">
                  <WorkSummaryCard actualMinutes={projectStats.totalActual} estimatedMinutes={projectStats.totalEstimated} />
                  <ProjectProgressCard progress={projectStats.progress} stats={projectStats} />
                </div>
              )}

              {activeTab === "reflection" && (
                <section className="project-card project-card--full">
                  <div className="project-card-header">
                    <h3>プロジェクト完了時振り返り</h3>
                    <button type="button" onClick={() => openCompletionReflection(selectedProject)}>振り返りを書く</button>
                  </div>
                  <ProjectCompletionReflectionCard
                    actualMinutes={selectedProject.actual_minutes}
                    estimatedMinutes={selectedProject.estimated_minutes}
                    reflection={getProjectReflection(selectedProject.id)}
                    onDelete={() => handleDeleteCompletionReflection(selectedProject.id)}
                    onEdit={() => openCompletionReflection(selectedProject)}
                  />
                </section>
              )}

              <section className="project-status-actions">
                <span>状態を変更</span>
                <StatusActionButtons
                  currentStatus={selectedProject.status}
                  options={PROJECT_STATUS_OPTIONS}
                  onChange={(status) => handleStatusChange(selectedProject, status)}
                />
              </section>
            </>
          ) : (
            <section className="projects-empty-detail">
              <h2>プロジェクトを選択してください</h2>
              <p>左の一覧から選択するか、新しいプロジェクトを作成してください。</p>
              <button type="button" className="projects-primary-button" onClick={openCreateProjectModal} disabled={goals.length === 0}>
                ＋ 新しいプロジェクト
              </button>
            </section>
          )}
        </main>
      </div>

      {isProjectModalOpen && (
        <ProjectFormModal
          editingProject={editingProject}
          form={projectForm}
          goals={goals}
          formError={formError}
          onChange={setProjectForm}
          onClose={() => setIsProjectModalOpen(false)}
          onSubmit={handleProjectSubmit}
        />
      )}

      {isTaskModalOpen && selectedProject && (
        <TaskFormModal
          projectTitle={selectedProject.title}
          form={taskForm}
          formError={formError}
          onChange={setTaskForm}
          onClose={() => setIsTaskModalOpen(false)}
          onSubmit={handleTaskSubmit}
        />
      )}

      {completionProject && (
        <CompletionReflectionModal
          project={completionProject}
          completionError={completionError}
          differenceReason={differenceReason}
          nextImprovement={nextImprovement}
          onClose={() => setCompletionProject(null)}
          onDifferenceReasonChange={setDifferenceReason}
          onNextImprovementChange={setNextImprovement}
          onSubmit={handleSaveCompletionReflection}
        />
      )}
    </div>
  );
}

function ProjectFilterButton({
  count,
  current,
  label,
  onClick,
  value,
}: {
  count: number;
  current: ProjectFilter;
  label: string;
  onClick: (value: ProjectFilter) => void;
  value: ProjectFilter;
}) {
  return (
    <button type="button" className={current === value ? "active" : ""} onClick={() => onClick(value)}>
      {label} <span>{count}</span>
    </button>
  );
}

function ProjectTabButton({
  current,
  label,
  onClick,
  value,
}: {
  current: ProjectTab;
  label: string;
  onClick: (value: ProjectTab) => void;
  value: ProjectTab;
}) {
  return (
    <button type="button" className={current === value ? "active" : ""} onClick={() => onClick(value)}>
      {label}
    </button>
  );
}

function ProjectFormModal({
  editingProject,
  form,
  formError,
  goals,
  onChange,
  onClose,
  onSubmit,
}: {
  editingProject: Project | null;
  form: ProjectFormState;
  formError: string;
  goals: Goal[];
  onChange: (form: ProjectFormState) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="project-modal-backdrop" role="dialog" aria-modal="true">
      <form className="project-modal" onSubmit={onSubmit}>
        <div className="project-modal__header">
          <div>
            <p>PROJECT</p>
            <h2>{editingProject ? "プロジェクトを編集" : "新しいプロジェクト"}</h2>
          </div>
          <button type="button" className="project-modal__close" onClick={onClose}>×</button>
        </div>

        <label>
          紐づける目標
          <select value={form.goalId} onChange={(e) => onChange({ ...form, goalId: e.target.value })}>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.title}</option>
            ))}
          </select>
        </label>

        <label>
          プロジェクト名
          <input value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="例：競馬AI 開発" autoFocus />
        </label>

        <label>
          説明
          <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="目的、範囲、やることをメモ" />
        </label>

        <div className="project-modal__grid">
          <label>
            予定工数（分）
            <input type="number" min="0" value={form.estimatedMinutes} onChange={(e) => onChange({ ...form, estimatedMinutes: e.target.value })} />
          </label>
          {editingProject && (
            <label>
              状態
              <select value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value })}>
                {PROJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {formError && <p className="project-form-error">{formError}</p>}

        <div className="project-modal__actions">
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="projects-primary-button">{editingProject ? "更新する" : "作成する"}</button>
        </div>
      </form>
    </div>
  );
}

function TaskFormModal({
  form,
  formError,
  onChange,
  onClose,
  onSubmit,
  projectTitle,
}: {
  form: TaskFormState;
  formError: string;
  onChange: (form: TaskFormState) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  projectTitle: string;
}) {
  return (
    <div className="project-modal-backdrop" role="dialog" aria-modal="true">
      <form className="project-modal" onSubmit={onSubmit}>
        <div className="project-modal__header">
          <div>
            <p>TASK</p>
            <h2>タスクを追加</h2>
            <small>{projectTitle}</small>
          </div>
          <button type="button" className="project-modal__close" onClick={onClose}>×</button>
        </div>
        <label>
          タスク名
          <input value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="例：API実装" autoFocus />
        </label>
        <label>
          説明
          <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="補足メモ" />
        </label>
        <div className="project-modal__grid">
          <label>
            予定時間（分）
            <input type="number" min="0" value={form.estimatedMinutes} onChange={(e) => onChange({ ...form, estimatedMinutes: e.target.value })} />
          </label>
          <label>
            優先度
            <select value={form.priority} onChange={(e) => onChange({ ...form, priority: e.target.value })}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label>
            エネルギー
            <select value={form.energyLevel} onChange={(e) => onChange({ ...form, energyLevel: e.target.value })}>
              <option value="high">高集中</option>
              <option value="medium">通常</option>
              <option value="low">低集中</option>
            </select>
          </label>
        </div>
        {formError && <p className="project-form-error">{formError}</p>}
        <div className="project-modal__actions">
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="projects-primary-button">追加する</button>
        </div>
      </form>
    </div>
  );
}

function CompletionReflectionModal({
  completionError,
  differenceReason,
  nextImprovement,
  onClose,
  onDifferenceReasonChange,
  onNextImprovementChange,
  onSubmit,
  project,
}: {
  completionError: string;
  differenceReason: string;
  nextImprovement: string;
  onClose: () => void;
  onDifferenceReasonChange: (value: string) => void;
  onNextImprovementChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  project: Project;
}) {
  return (
    <div className="project-modal-backdrop" role="dialog" aria-modal="true">
      <form className="project-modal project-modal--wide" onSubmit={onSubmit}>
        <div className="project-modal__header">
          <div>
            <p>RETROSPECTIVE</p>
            <h2>プロジェクト完了時振り返り</h2>
            <small>{project.title}</small>
          </div>
          <button type="button" className="project-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="project-summary-grid">
          <SummaryBox label="予想工数" value={formatProjectMinutes(project.estimated_minutes)} />
          <SummaryBox label="実績工数" value={formatProjectMinutes(project.actual_minutes)} />
          <SummaryBox label="差異" value={formatSignedMinutes(project.actual_minutes - project.estimated_minutes)} />
        </div>
        <label>
          差異理由
          <textarea value={differenceReason} onChange={(e) => onDifferenceReasonChange(e.target.value)} placeholder="例：調査時間を見積もりに入れていなかった" />
        </label>
        <label>
          次回改善点
          <textarea value={nextImprovement} onChange={(e) => onNextImprovementChange(e.target.value)} placeholder="例：実装前に不明点調査の時間を30分確保する" />
        </label>
        {completionError && <p className="project-form-error">{completionError}</p>}
        <div className="project-modal__actions">
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="projects-primary-button">保存する</button>
        </div>
      </form>
    </div>
  );
}

function ProjectProgressCard({
  progress,
  stats,
}: {
  progress: number;
  stats: {
    completedTasks: number;
    inProgressTasks: number;
    todoTasks: number;
    totalActual: number;
    totalEstimated: number;
  };
}) {
  return (
    <section className="project-card">
      <h3>進捗サマリー</h3>
      <div className="project-progress-donut" style={{ background: `conic-gradient(#2563eb ${progress * 3.6}deg, #e2e8f0 0deg)` }}>
        <div><strong>{progress}%</strong><span>進捗率</span></div>
      </div>
      <dl className="project-summary-list">
        <div><dt>完了タスク</dt><dd>{stats.completedTasks}</dd></div>
        <div><dt>進行中タスク</dt><dd>{stats.inProgressTasks}</dd></div>
        <div><dt>未着手タスク</dt><dd>{stats.todoTasks}</dd></div>
      </dl>
    </section>
  );
}

function WorkSummaryCard({ actualMinutes, estimatedMinutes }: { actualMinutes: number; estimatedMinutes: number }) {
  const difference = actualMinutes - estimatedMinutes;
  return (
    <section className="project-card">
      <h3>工数サマリー</h3>
      <strong className="project-work-main">{formatProjectMinutes(actualMinutes)} / {formatProjectMinutes(estimatedMinutes)}</strong>
      <p>実績 / 想定</p>
      <p>差異：{formatSignedMinutes(difference)}</p>
    </section>
  );
}

function TaskList({ tasks, onStatusChange }: { tasks: Task[]; onStatusChange: (task: Task, status: string) => void }) {
  if (tasks.length === 0) {
    return <p className="project-muted">このプロジェクトのタスクはまだありません。</p>;
  }

  return (
    <div className="project-task-list">
      {tasks.map((task) => (
        <div className="project-task-row" key={task.id}>
          <span className={`task-check task-check--${task.status}`}>✓</span>
          <div>
            <strong>{task.title}</strong>
            <p>{task.description || "説明なし"}</p>
          </div>
          <span>{formatProjectMinutes(task.actual_minutes)} / {formatProjectMinutes(task.estimated_minutes)}</span>
          <select value={task.status} onChange={(e) => onStatusChange(task, e.target.value)}>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      ))}
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
      <div className="project-reflection-empty">
        <strong>完了時振り返りはまだありません。</strong>
        <p>予定工数と実績工数の差異理由、次回改善点を残せます。</p>
        <button type="button" onClick={onEdit}>振り返りを書く</button>
      </div>
    );
  }

  const differenceMinutes = actualMinutes - estimatedMinutes;

  return (
    <div className="project-reflection-card">
      <p>差異：{formatSignedMinutes(differenceMinutes)}</p>
      <p>差異理由：{reflection.difference_reason || "未入力"}</p>
      <p>次回改善点：{reflection.next_improvement || "未入力"}</p>
      <button type="button" onClick={onEdit}>振り返りを編集</button>
      <button type="button" onClick={onDelete}>振り返りを削除</button>
    </div>
  );
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
    <div className="project-status-button-group">
      {options.map((option) => (
        <button key={option.value} type="button" disabled={option.value === currentStatus} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="project-summary-box">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function getProjectStatusLabel(status: string) {
  return PROJECT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function calculateProgress(actualMinutes: number, estimatedMinutes: number) {
  if (estimatedMinutes <= 0) return actualMinutes > 0 ? 100 : 0;
  return Math.min(100, Math.round((actualMinutes / estimatedMinutes) * 100));
}

function formatProjectMinutes(minutes: number) {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const remainingMinutes = absMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}分`;
  }

  return remainingMinutes === 0 ? `${hours}時間` : `${hours}時間${remainingMinutes}分`;
}

function formatSignedMinutes(minutes: number) {
  if (minutes === 0) return "差異なし";
  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatProjectMinutes(minutes)}`;
}
