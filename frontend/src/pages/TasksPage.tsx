import { useEffect, useMemo, useState } from "react";
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

type TaskFormState = {
  projectId: string;
  title: string;
  description: string;
  priority: string;
  estimatedMinutes: string;
  energyLevel: string;
  status: string;
};

const DEFAULT_FORM: TaskFormState = {
  projectId: "",
  title: "",
  description: "",
  priority: "medium",
  estimatedMinutes: "30",
  energyLevel: "medium",
  status: "todo",
};

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

const TASK_PRIORITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const TASK_ENERGY_OPTIONS = [
  { value: "high", label: "高集中" },
  { value: "medium", label: "普通" },
  { value: "low", label: "低集中" },
];

const KANBAN_COLUMNS = [
  { value: "todo", title: "TODO", label: "未着手", note: "これから着手するタスク" },
  { value: "in_progress", title: "DOING", label: "進行中", note: "いま進めているタスク" },
  { value: "completed", title: "DONE", label: "完了", note: "完了したタスク" },
];

const EXTRA_STATUS_COLUMNS = [
  { value: "paused", title: "PAUSED", label: "保留", note: "一時停止中のタスク" },
  { value: "cancelled", title: "CANCELLED", label: "中止", note: "中止したタスク" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortKey, setSortKey] = useState("newest");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormState>(DEFAULT_FORM);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  async function loadData() {
    const [taskData, projectData] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
    ]);

    setTasks(taskData);
    setProjects(projectData);

    if (taskData.length > 0) {
      setSelectedTaskId((current) => {
        if (current && taskData.some((task) => task.id === current)) return current;
        return taskData[0].id;
      });
    } else {
      setSelectedTaskId(null);
    }

    setForm((current) => ({
      ...current,
      projectId: current.projectId || (projectData[0] ? String(projectData[0].id) : ""),
    }));
  }

  useEffect(() => {
    loadData();
  }, []);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return tasks
      .filter((task) => {
        const projectTitle = projectMap.get(task.project_id)?.title ?? "";
        const matchesSearch =
          !normalizedSearch ||
          task.title.toLowerCase().includes(normalizedSearch) ||
          (task.description ?? "").toLowerCase().includes(normalizedSearch) ||
          projectTitle.toLowerCase().includes(normalizedSearch);
        const matchesStatus = statusFilter === "all" || task.status === statusFilter;
        const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
        return matchesSearch && matchesStatus && matchesPriority;
      })
      .sort((a, b) => {
        if (sortKey === "priority") return priorityRank(a.priority) - priorityRank(b.priority);
        if (sortKey === "estimate") return b.estimated_minutes - a.estimated_minutes;
        return b.id - a.id;
      });
  }, [priorityFilter, projectMap, searchText, sortKey, statusFilter, tasks]);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null;
  }, [filteredTasks, selectedTaskId, tasks]);

  const boardColumns = useMemo(() => {
    const columns = [...KANBAN_COLUMNS, ...EXTRA_STATUS_COLUMNS];
    if (statusFilter === "all") return columns;
    return columns.filter((column) => column.value === statusFilter);
  }, [statusFilter]);

  const activeCount = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const urgentCount = tasks.filter((task) => task.task_type === "urgent" || task.priority === "high").length;
  const totalEstimatedMinutes = tasks.reduce((sum, task) => sum + task.estimated_minutes, 0);

  function openCreateModal() {
    setEditingTask(null);
    setForm({
      ...DEFAULT_FORM,
      projectId: projects[0] ? String(projects[0].id) : "",
    });
    setIsModalOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setForm({
      projectId: String(task.project_id),
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      estimatedMinutes: String(task.estimated_minutes),
      energyLevel: task.energy_level,
      status: task.status,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingTask(null);
    setForm(DEFAULT_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.projectId || !form.title.trim()) return;

    const input = {
      project_id: Number(form.projectId),
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      estimated_minutes: Number(form.estimatedMinutes || 0),
      energy_level: form.energyLevel,
    };

    if (editingTask) {
      const updated = await updateTask(editingTask.id, {
        ...input,
        actual_minutes: editingTask.actual_minutes,
        status: form.status,
        task_type: editingTask.task_type,
        urgency: editingTask.urgency,
        importance: editingTask.importance,
        occurred_at: editingTask.occurred_at,
        interruption_reason: editingTask.interruption_reason,
      });
      setSelectedTaskId(updated.id);
    } else {
      const created = await createTask(input);
      setSelectedTaskId(created.id);
    }

    closeModal();
    await loadData();
  }

  async function handleStatusChange(task: Task, status: string) {
    const updated = await updateTaskStatus(task.id, status);
    setSelectedTaskId(updated.id);
    await loadData();
  }

  async function handleDropToStatus(status: string) {
    if (!draggingTaskId) return;

    const draggedTask = tasks.find((task) => task.id === draggingTaskId);
    setDraggingTaskId(null);

    if (!draggedTask || draggedTask.status === status) return;
    await handleStatusChange(draggedTask, status);
  }

  async function handleDelete(task: Task) {
    const ok = window.confirm(`「${task.title}」を削除しますか？`);
    if (!ok) return;

    await deleteTask(task.id);
    await loadData();
  }

  function getProjectTitle(id: number) {
    return projectMap.get(id)?.title ?? `プロジェクトID: ${id}`;
  }

  return (
    <div className="tasks-screen">
      <header className="tasks-header">
        <div>
          <p className="tasks-header__eyebrow">Task Control</p>
          <h1>タスク</h1>
        </div>
        <div className="tasks-header__actions">
          <label className="tasks-search">
            <span>⌕</span>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="タスク・説明・プロジェクトを検索..."
            />
          </label>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="all">優先度すべて</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="newest">新しい順</option>
            <option value="priority">優先度順</option>
            <option value="estimate">予定工数順</option>
          </select>
          <button className="tasks-primary-button" type="button" onClick={openCreateModal} disabled={projects.length === 0}>
            ＋ タスクを追加
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <section className="tasks-empty-state">
          <h2>先にプロジェクトを作成してください</h2>
          <p>タスクはプロジェクトに紐づけて管理します。プロジェクト画面でプロジェクトを作成すると、ここからタスクを追加できます。</p>
        </section>
      ) : (
        <>
          <section className="tasks-kpi-grid">
            <TaskKpiCard label="アクティブ" value={`${activeCount}件`} note="未完了・進行中・保留" />
            <TaskKpiCard label="高優先" value={`${urgentCount}件`} note="高優先または緊急タスク" />
            <TaskKpiCard label="完了" value={`${completedCount}件`} note="完了済みタスク" />
            <TaskKpiCard label="予定工数" value={formatMinutes(totalEstimatedMinutes)} note="登録済みタスク合計" />
          </section>

          <main className="tasks-layout">
            <section className="tasks-list-card">
              <div className="tasks-tabs">
                <button className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")} type="button">
                  すべて <span>{tasks.length}</span>
                </button>
                {TASK_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={statusFilter === option.value ? "is-active" : ""}
                    onClick={() => setStatusFilter(option.value)}
                    type="button"
                  >
                    {option.label} <span>{tasks.filter((task) => task.status === option.value).length}</span>
                  </button>
                ))}
              </div>

              <div className="tasks-kanban-board" aria-label="タスク看板">
                {boardColumns.map((column) => {
                  const columnTasks = filteredTasks.filter((task) => task.status === column.value);

                  return (
                    <section
                      key={column.value}
                      className={`tasks-kanban-column tasks-kanban-column--${column.value}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleDropToStatus(column.value)}
                    >
                      <div className="tasks-kanban-column__header">
                        <div>
                          <p>{column.label}</p>
                          <h2>{column.title}</h2>
                          <small>{column.note}</small>
                        </div>
                        <span>{columnTasks.length}</span>
                      </div>

                      <div className="tasks-kanban-column__body">
                        {columnTasks.length === 0 ? (
                          <div className="tasks-kanban-empty">この列のタスクはありません。</div>
                        ) : (
                          columnTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              draggable
                              className={`tasks-kanban-card ${selectedTask?.id === task.id ? "is-selected" : ""} ${draggingTaskId === task.id ? "is-dragging" : ""}`}
                              onClick={() => setSelectedTaskId(task.id)}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", String(task.id));
                                setDraggingTaskId(task.id);
                                setSelectedTaskId(task.id);
                              }}
                              onDragEnd={() => setDraggingTaskId(null)}
                            >
                              <span className="tasks-kanban-card__topline">
                                <PriorityBadge priority={task.priority} />
                                <span>{formatMinutes(task.estimated_minutes)}</span>
                              </span>
                              <strong>{task.title}</strong>
                              <small>{task.description || "説明なし"}</small>
                              <span className="tasks-kanban-card__footer">
                                <TaskProjectPill title={getProjectTitle(task.project_id)} />
                                <span>{getEnergyLabel(task.energy_level)}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>

            <aside className="tasks-detail-card">
              {selectedTask ? (
                <>
                  <div className="tasks-detail-card__header">
                    <div>
                      <p>{getProjectTitle(selectedTask.project_id)}</p>
                      <h2>{selectedTask.title}</h2>
                    </div>
                    <button type="button" onClick={() => setSelectedTaskId(null)}>×</button>
                  </div>

                  <div className="tasks-detail-card__badges">
                    <StatusBadge status={selectedTask.status} />
                    <PriorityBadge priority={selectedTask.priority} />
                    <span className="task-pill">{getEnergyLabel(selectedTask.energy_level)}</span>
                    {selectedTask.task_type === "urgent" && <span className="task-pill task-pill--danger">緊急</span>}
                  </div>

                  <dl className="tasks-detail-grid">
                    <div>
                      <dt>予定工数</dt>
                      <dd>{formatMinutes(selectedTask.estimated_minutes)}</dd>
                    </div>
                    <div>
                      <dt>実績工数</dt>
                      <dd>{formatMinutes(selectedTask.actual_minutes)}</dd>
                    </div>
                    <div>
                      <dt>重要度</dt>
                      <dd>{selectedTask.importance ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>緊急度</dt>
                      <dd>{selectedTask.urgency ?? "-"}</dd>
                    </div>
                  </dl>

                  <section className="tasks-detail-section">
                    <h3>説明</h3>
                    <p>{selectedTask.description || "説明はまだありません。"}</p>
                  </section>

                  {selectedTask.interruption_reason && (
                    <section className="tasks-detail-section">
                      <h3>割り込み理由</h3>
                      <p>{selectedTask.interruption_reason}</p>
                    </section>
                  )}

                  <section className="tasks-detail-section">
                    <h3>ステータス変更</h3>
                    <StatusActionButtons
                      currentStatus={selectedTask.status}
                      options={TASK_STATUS_OPTIONS}
                      onChange={(status) => handleStatusChange(selectedTask, status)}
                    />
                  </section>

                  <div className="tasks-detail-actions">
                    <button type="button" onClick={() => openEditModal(selectedTask)}>編集</button>
                    <button type="button" className="danger" onClick={() => handleDelete(selectedTask)}>削除</button>
                  </div>
                </>
              ) : (
                <div className="tasks-detail-empty">
                  <h2>タスクを選択</h2>
                  <p>左の一覧からタスクを選ぶと、詳細・ステータス変更・編集ができます。</p>
                </div>
              )}
            </aside>
          </main>
        </>
      )}

      {isModalOpen && (
        <TaskModal
          form={form}
          projects={projects}
          editingTask={editingTask}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function TaskModal({
  form,
  projects,
  editingTask,
  onChange,
  onClose,
  onSubmit,
}: {
  form: TaskFormState;
  projects: Project[];
  editingTask: Task | null;
  onChange: (form: TaskFormState) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  function patchForm(patch: Partial<TaskFormState>) {
    onChange({ ...form, ...patch });
  }

  return (
    <div className="task-modal-backdrop" role="dialog" aria-modal="true">
      <form className="task-modal" onSubmit={onSubmit}>
        <div className="task-modal__header">
          <div>
            <p>{editingTask ? "Edit Task" : "New Task"}</p>
            <h2>{editingTask ? "タスクを編集" : "タスクを追加"}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <label>
          タスク名
          <input
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
            placeholder="例：API設計書のレビュー"
            autoFocus
          />
        </label>

        <label>
          説明
          <textarea
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
            placeholder="目的、完了条件、メモなど"
          />
        </label>

        <div className="task-modal__grid">
          <label>
            プロジェクト
            <select value={form.projectId} onChange={(e) => patchForm({ projectId: e.target.value })}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
          </label>

          <label>
            予定工数（分）
            <input
              type="number"
              min="0"
              value={form.estimatedMinutes}
              onChange={(e) => patchForm({ estimatedMinutes: e.target.value })}
            />
          </label>

          <label>
            優先度
            <select value={form.priority} onChange={(e) => patchForm({ priority: e.target.value })}>
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            エネルギー
            <select value={form.energyLevel} onChange={(e) => patchForm({ energyLevel: e.target.value })}>
              {TASK_ENERGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {editingTask && (
            <label>
              ステータス
              <select value={form.status} onChange={(e) => patchForm({ status: e.target.value })}>
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="task-modal__actions">
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="submit" disabled={!form.projectId || !form.title.trim()}>
            {editingTask ? "更新する" : "作成する"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskKpiCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="tasks-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function TaskProjectPill({ title }: { title: string }) {
  return <span className="task-project-pill">{title}</span>;
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
    <div className="tasks-status-actions">
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

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-badge priority-badge--${priority}`}>{getPriorityLabel(priority)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-badge--${status}`}>{getTaskStatusLabel(status)}</span>;
}

function getTaskStatusLabel(status: string) {
  return TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function getPriorityLabel(priority: string) {
  return TASK_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

function getEnergyLabel(energyLevel: string) {
  return TASK_ENERGY_OPTIONS.find((option) => option.value === energyLevel)?.label ?? energyLevel;
}

function priorityRank(priority: string) {
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0分";
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}
