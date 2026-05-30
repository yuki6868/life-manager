import { useEffect, useMemo, useState } from "react";
import {
  createGoal,
  deleteGoal,
  fetchGoals,
  updateGoal,
  updateGoalStatus,
} from "../api/goals";
import type { Goal } from "../api/goals";

type GoalTab = "all" | "personal" | "team" | "okr";
type GoalStatusFilter = "all" | "active" | "completed" | "paused" | "cancelled" | "overdue";
type PeriodFilter = "all" | "thisMonth" | "next30" | "expired";

const GOAL_STATUS_OPTIONS = [
  { value: "active", label: "進行中" },
  { value: "completed", label: "達成" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeTab, setActiveTab] = useState<GoalTab>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  async function loadGoals() {
    const data = await fetchGoals();
    setGoals(data);
    setSelectedGoalId((currentId) => {
      if (data.length === 0) return null;
      if (currentId && data.some((goal) => goal.id === currentId)) return currentId;
      return data[0].id;
    });
  }

  useEffect(() => {
    loadGoals();
  }, []);

  const stats = useMemo(() => buildGoalStats(goals), [goals]);

  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      if (activeTab !== "all" && !matchesGoalTab(goal, activeTab)) return false;
      if (statusFilter === "overdue") {
        if (!isGoalOverdue(goal)) return false;
      } else if (statusFilter !== "all" && goal.status !== statusFilter) {
        return false;
      }
      if (!matchesPeriod(goal, periodFilter)) return false;
      return true;
    });
  }, [activeTab, goals, periodFilter, statusFilter]);

  const selectedGoal = useMemo(() => {
    if (filteredGoals.length === 0) return null;
    return filteredGoals.find((goal) => goal.id === selectedGoalId) ?? filteredGoals[0];
  }, [filteredGoals, selectedGoalId]);

  function openCreateForm() {
    setEditingGoal(null);
    setTitle("");
    setDescription("");
    setTargetDate("");
    setIsFormOpen(true);
  }

  function openEditForm(goal: Goal) {
    setEditingGoal(goal);
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setTargetDate(toDateInputValue(goal.target_date));
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingGoal(null);
    setTitle("");
    setDescription("");
    setTargetDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingGoal) {
      await updateGoal(editingGoal.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
        status: editingGoal.status,
      });
    } else {
      await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
      });
    }

    closeForm();
    await loadGoals();
  }

  async function handleStatusChange(goal: Goal, status: string) {
    await updateGoalStatus(goal.id, status);
    await loadGoals();
  }

  async function handleDelete(goal: Goal) {
    const ok = window.confirm(`「${goal.title}」を削除しますか？`);
    if (!ok) return;
    await deleteGoal(goal.id);
    await loadGoals();
  }

  function handleExport() {
    const csv = buildGoalsCsv(goals);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "goals.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="goals-page">
      <header className="goals-hero">
        <div>
          <h1>目標管理</h1>
          <p>目標の進捗を可視化し、達成に向けて行動を計画・実行しましょう。</p>
        </div>
        <div className="goals-hero__actions">
          <button className="goals-button goals-button--ghost" type="button" onClick={handleExport} disabled={goals.length === 0}>
            ⬇ エクスポート
          </button>
          <button className="goals-button goals-button--primary" type="button" onClick={openCreateForm}>
            ＋ 目標を追加
          </button>
        </div>
      </header>

      <section className="goal-summary-grid" aria-label="目標サマリー">
        <SummaryCard icon="◎" label="全体の進捗" value={`${stats.averageProgress}%`} note={`${goals.length}件の目標`} meter={stats.averageProgress} />
        <SummaryCard icon="✓" label="達成済みの目標" value={`${stats.completed}件`} note={`全体の${stats.completedRate}%`} />
        <SummaryCard icon="🔥" label="進行中の目標" value={`${stats.active}件`} note={`全体の${stats.activeRate}%`} />
        <SummaryCard icon="⏰" label="期限超過の目標" value={`${stats.overdue}件`} note={`全体の${stats.overdueRate}%`} />
      </section>

      <div className="goals-toolbar">
        <nav className="goals-tabs" aria-label="目標カテゴリ">
          <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>すべての目標</TabButton>
          <TabButton active={activeTab === "personal"} onClick={() => setActiveTab("personal")}>個人目標</TabButton>
          <TabButton active={activeTab === "team"} onClick={() => setActiveTab("team")}>チーム目標</TabButton>
          <TabButton active={activeTab === "okr"} onClick={() => setActiveTab("okr")}>OKR</TabButton>
        </nav>

        <div className="goals-filters">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}>
            <option value="all">期間: すべて</option>
            <option value="thisMonth">期間: 今月</option>
            <option value="next30">期間: 30日以内</option>
            <option value="expired">期間: 期限超過</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as GoalStatusFilter)}>
            <option value="all">ステータス: すべて</option>
            <option value="active">ステータス: 進行中</option>
            <option value="completed">ステータス: 達成</option>
            <option value="paused">ステータス: 保留</option>
            <option value="cancelled">ステータス: 中止</option>
            <option value="overdue">ステータス: 期限超過</option>
          </select>
          <div className="goals-view-switch" aria-label="表示切り替え">
            <button type="button" className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")}>☰</button>
            <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")}>▦</button>
          </div>
        </div>
      </div>

      <main className="goals-board">
        <section className="goals-list-panel">
          <div className="goals-panel-header">
            <h2>目標一覧</h2>
            <span>全 {filteredGoals.length} 件</span>
          </div>

          {filteredGoals.length === 0 ? (
            <EmptyGoals onCreate={openCreateForm} />
          ) : (
            <div className={viewMode === "grid" ? "goal-card-grid" : "goal-row-list"}>
              {filteredGoals.map((goal) => (
                <GoalListItem
                  key={goal.id}
                  goal={goal}
                  selected={selectedGoal?.id === goal.id}
                  compact={viewMode === "grid"}
                  onSelect={() => setSelectedGoalId(goal.id)}
                  onEdit={() => openEditForm(goal)}
                  onDelete={() => handleDelete(goal)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="goal-detail-panel">
          {selectedGoal ? (
            <GoalDetail
              goal={selectedGoal}
              onEdit={() => openEditForm(selectedGoal)}
              onDelete={() => handleDelete(selectedGoal)}
              onStatusChange={(status) => handleStatusChange(selectedGoal, status)}
            />
          ) : (
            <div className="goal-detail-empty">
              <h2>表示する目標がありません</h2>
              <p>目標を追加すると、ここに詳細と進捗が表示されます。</p>
              <button className="goals-button goals-button--primary" type="button" onClick={openCreateForm}>目標を追加</button>
            </div>
          )}
        </aside>
      </main>

      {isFormOpen && (
        <div className="goals-modal-backdrop" role="presentation" onMouseDown={closeForm}>
          <form className="goals-modal" onSubmit={handleSubmit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="goals-modal__header">
              <div>
                <h2>{editingGoal ? "目標を編集" : "目標を追加"}</h2>
                <p>実データとして保存されます。未入力の説明や期限は空のまま登録できます。</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="閉じる">×</button>
            </div>

            <label>
              目標タイトル
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：個人開発アプリをMVP公開する" autoFocus />
            </label>

            <label>
              説明
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="目標の背景や達成条件を書く" />
            </label>

            <label>
              期限
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </label>

            {editingGoal && (
              <label>
                状態
                <select value={editingGoal.status} onChange={(e) => setEditingGoal({ ...editingGoal, status: e.target.value })}>
                  {GOAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}

            <div className="goals-modal__actions">
              <button className="goals-button goals-button--ghost" type="button" onClick={closeForm}>キャンセル</button>
              <button className="goals-button goals-button--primary" type="submit">{editingGoal ? "更新する" : "作成する"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, note, meter }: { icon: string; label: string; value: string; note: string; meter?: number }) {
  return (
    <article className="goal-summary-card">
      <div className="goal-summary-card__icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {typeof meter === "number" && <span className="goal-summary-card__meter"><i style={{ width: `${meter}%` }} /></span>}
        <small>{note}</small>
      </div>
    </article>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick}>{children}</button>;
}

function GoalListItem({ goal, selected, compact, onSelect, onEdit, onDelete }: { goal: Goal; selected: boolean; compact: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  const progress = getGoalProgress(goal);
  return (
    <article className={`goal-list-item ${selected ? "is-selected" : ""} ${compact ? "goal-list-item--compact" : ""}`} onClick={onSelect}>
      <div className={`goal-status-dot goal-status-dot--${goal.status}`} />
      <div className="goal-list-item__body">
        <h3>{goal.title}</h3>
        <p>{goal.description || "説明なし"}</p>
        <span>{getGoalStatusLabel(goal.status)}{goal.target_date ? `・期限 ${formatDate(goal.target_date)}` : "・期限なし"}</span>
      </div>
      <div className="goal-list-item__progress">
        <strong>{progress}%</strong>
        <span><i style={{ width: `${progress}%` }} /></span>
      </div>
      <div className="goal-list-item__actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onEdit}>編集</button>
        <button type="button" onClick={onDelete}>削除</button>
      </div>
    </article>
  );
}

function GoalDetail({ goal, onEdit, onDelete, onStatusChange }: { goal: Goal; onEdit: () => void; onDelete: () => void; onStatusChange: (status: string) => void }) {
  const progress = getGoalProgress(goal);
  return (
    <div className="goal-detail">
      <div className="goal-detail__top">
        <span>{getGoalStatusLabel(goal.status)}</span>
        {isGoalOverdue(goal) && <span className="is-danger">期限超過</span>}
      </div>
      <h2>{goal.title}</h2>
      <p>{goal.description || "説明なし"}</p>

      <div className="goal-detail__progress">
        <div>
          <span>進捗</span>
          <strong>{progress}%</strong>
        </div>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div>

      <dl className="goal-detail__meta">
        <div><dt>期限</dt><dd>{goal.target_date ? formatDate(goal.target_date) : "未設定"}</dd></div>
        <div><dt>残り日数</dt><dd>{getRemainingDaysLabel(goal)}</dd></div>
        <div><dt>状態</dt><dd>{getGoalStatusLabel(goal.status)}</dd></div>
        <div><dt>目標ID</dt><dd>{goal.id}</dd></div>
      </dl>

      <div className="goal-detail__status-actions">
        {GOAL_STATUS_OPTIONS.map((option) => (
          <button key={option.value} type="button" disabled={goal.status === option.value} onClick={() => onStatusChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>

      <div className="goal-detail__actions">
        <button className="goals-button goals-button--ghost" type="button" onClick={onEdit}>編集</button>
        <button className="goals-button goals-button--danger" type="button" onClick={onDelete}>削除</button>
      </div>
    </div>
  );
}

function EmptyGoals({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="goals-empty">
      <strong>まだ目標がありません。</strong>
      <p>目標を追加すると、進捗・期限・状態をこの画面で管理できます。</p>
      <button className="goals-button goals-button--primary" type="button" onClick={onCreate}>目標を追加</button>
    </div>
  );
}

function buildGoalStats(goals: Goal[]) {
  const total = goals.length;
  const completed = goals.filter((goal) => goal.status === "completed").length;
  const active = goals.filter((goal) => goal.status === "active").length;
  const overdue = goals.filter(isGoalOverdue).length;
  const averageProgress = total === 0 ? 0 : Math.round(goals.reduce((sum, goal) => sum + getGoalProgress(goal), 0) / total);
  return {
    averageProgress,
    completed,
    active,
    overdue,
    completedRate: getRate(completed, total),
    activeRate: getRate(active, total),
    overdueRate: getRate(overdue, total),
  };
}

function getRate(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function getGoalProgress(goal: Goal) {
  if (goal.status === "completed") return 100;
  if (goal.status === "cancelled") return 0;
  if (goal.status === "paused") return 25;
  if (!goal.target_date) return 50;

  const today = startOfDay(new Date());
  const target = startOfDay(new Date(goal.target_date));
  const remaining = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (remaining < 0) return 25;
  if (remaining <= 7) return 70;
  if (remaining <= 30) return 55;
  return 40;
}

function isGoalOverdue(goal: Goal) {
  if (!goal.target_date || goal.status === "completed" || goal.status === "cancelled") return false;
  return startOfDay(new Date(goal.target_date)).getTime() < startOfDay(new Date()).getTime();
}

function matchesPeriod(goal: Goal, filter: PeriodFilter) {
  if (filter === "all") return true;
  if (filter === "expired") return isGoalOverdue(goal);
  if (!goal.target_date) return false;

  const target = startOfDay(new Date(goal.target_date));
  const today = startOfDay(new Date());
  if (filter === "next30") {
    const end = addDays(today, 30);
    return target >= today && target <= end;
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return target >= monthStart && target <= monthEnd;
}

function matchesGoalTab(goal: Goal, tab: Exclude<GoalTab, "all">) {
  const text = `${goal.title} ${goal.description ?? ""}`.toLowerCase();
  if (tab === "okr") return text.includes("okr") || text.includes("key result") || text.includes("kr");
  if (tab === "team") return text.includes("チーム") || text.includes("team");
  return !text.includes("チーム") && !text.includes("team") && !text.includes("okr");
}

function getGoalStatusLabel(status: string) {
  return GOAL_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function getRemainingDaysLabel(goal: Goal) {
  if (!goal.target_date) return "未設定";
  const diff = Math.ceil((startOfDay(new Date(goal.target_date)).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}日超過`;
  if (diff === 0) return "今日まで";
  return `あと${diff}日`;
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDate(value: string) {
  return value.slice(0, 10).replaceAll("-", "/");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildGoalsCsv(goals: Goal[]) {
  const rows = [["id", "title", "description", "status", "target_date"], ...goals.map((goal) => [
    String(goal.id),
    goal.title,
    goal.description ?? "",
    goal.status,
    goal.target_date ?? "",
  ])];
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
}
