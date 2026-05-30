import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createGapTask,
  deleteGapTask,
  fetchGapTasks,
  fetchNextGapTaskSuggestions,
  updateGapTask,
  updateGapTaskStatus,
} from "../api/gapTasks";
import type { GapTask, GapTaskSuggestion } from "../api/gapTasks";
import { createWorkLog } from "../api/workLogs";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const ENERGY_LEVEL_OPTIONS = [
  { value: "high", label: "高集中" },
  { value: "medium", label: "普通" },
  { value: "low", label: "疲れていても可能" },
];

const GAP_TASK_STATUS_OPTIONS = [
  { value: "todo", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

const TIME_BUCKETS = [
  { key: "under5", label: "5分以内", min: 0, max: 5 },
  { key: "5to15", label: "5〜15分", min: 6, max: 15 },
  { key: "15to30", label: "15〜30分", min: 16, max: 30 },
  { key: "over30", label: "30分以上", min: 31, max: Number.POSITIVE_INFINITY },
];

type TimerStatus = "idle" | "running" | "paused" | "stopped";
type TaskTab = "suggested" | "favorite" | "completed";
type SortKey = "recommended" | "short" | "priority";

type GapTaskSettings = {
  dailyTargetMinutes: number;
  excludeFocusMode: boolean;
  preferredEnergyLevel: string;
};

const DEFAULT_GAP_TASK_SETTINGS: GapTaskSettings = {
  dailyTargetMinutes: 60,
  excludeFocusMode: false,
  preferredEnergyLevel: "",
};

const GAP_TASK_SETTINGS_STORAGE_KEY = "life-manager-gap-task-settings";

export default function GapTasksPage() {
  const [gapTasks, setGapTasks] = useState<GapTask[]>([]);
  const [suggestion, setSuggestion] = useState<GapTaskSuggestion | null>(null);
  const [suggestionEnergyLevel, setSuggestionEnergyLevel] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredMinutes, setRequiredMinutes] = useState("15");
  const [priority, setPriority] = useState("medium");
  const [energyLevel, setEnergyLevel] = useState("medium");
  const [gapTaskStatus, setGapTaskStatus] = useState("todo");
  const [editingGapTask, setEditingGapTask] = useState<GapTask | null>(null);
  const [activeGapTask, setActiveGapTask] = useState<GapTask | null>(null);
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [runningStartedAtMs, setRunningStartedAtMs] = useState<number | null>(null);
  const [elapsedBeforePauseMs, setElapsedBeforePauseMs] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workMemo, setWorkMemo] = useState("");
  const [isSavingWorkLog, setIsSavingWorkLog] = useState(false);
  const [timerMessage, setTimerMessage] = useState("");
  const [timerErrorMessage, setTimerErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TaskTab>("suggested");
  const [selectedBucketKey, setSelectedBucketKey] = useState(TIME_BUCKETS[0].key);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [showForm, setShowForm] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GapTaskSettings>(() => readGapTaskSettings());
  const [settingsDraft, setSettingsDraft] = useState<GapTaskSettings>(() => readGapTaskSettings());
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<number[]>(() => readFavoriteGapTaskIds());

  async function loadGapTasks() {
    const data = await fetchGapTasks();
    setGapTasks(data);
  }

  async function loadGapTaskSuggestions() {
    const data = await fetchNextGapTaskSuggestions(
      suggestionEnergyLevel || undefined,
    );
    setSuggestion(data);
  }

  useEffect(() => {
    loadGapTasks();
  }, []);

  useEffect(() => {
    loadGapTaskSuggestions();
  }, [suggestionEnergyLevel]);

  useEffect(() => {
    if (timerStatus !== "running" || runningStartedAtMs === null) return;

    const intervalId = window.setInterval(() => {
      const elapsedMs = elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);
      setElapsedSeconds(Math.floor(elapsedMs / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [elapsedBeforePauseMs, runningStartedAtMs, timerStatus]);

  useEffect(() => {
    window.localStorage.setItem("life-manager-gap-task-favorites", JSON.stringify(favoriteTaskIds));
  }, [favoriteTaskIds]);

  useEffect(() => {
    window.localStorage.setItem(GAP_TASK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (settings.preferredEnergyLevel) {
      setSuggestionEnergyLevel(settings.preferredEnergyLevel);
    }
  }, [settings]);

  function openSettings() {
    setSettingsDraft(settings);
    setShowSettings(true);
  }

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    const normalizedSettings = {
      ...settingsDraft,
      dailyTargetMinutes: Math.max(1, Number(settingsDraft.dailyTargetMinutes || DEFAULT_GAP_TASK_SETTINGS.dailyTargetMinutes)),
    };
    setSettings(normalizedSettings);
    if (normalizedSettings.preferredEnergyLevel) {
      setCategoryFilter(normalizedSettings.preferredEnergyLevel);
    }
    setShowSettings(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;

    const input = {
      title,
      description,
      required_minutes: Math.max(1, Number(requiredMinutes || 1)),
      priority,
      energy_level: energyLevel,
    };

    if (editingGapTask) {
      await updateGapTask(editingGapTask.id, {
        ...input,
        status: gapTaskStatus,
      });
    } else {
      await createGapTask(input);
    }

    resetForm();
    setShowForm(false);
    await refreshGapTaskData();
  }

  async function refreshGapTaskData() {
    await Promise.all([loadGapTasks(), loadGapTaskSuggestions()]);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setRequiredMinutes("15");
    setPriority("medium");
    setEnergyLevel("medium");
    setGapTaskStatus("todo");
    setEditingGapTask(null);
  }

  function handleEdit(gapTask: GapTask) {
    setEditingGapTask(gapTask);
    setTitle(gapTask.title);
    setDescription(gapTask.description ?? "");
    setRequiredMinutes(String(gapTask.required_minutes));
    setPriority(gapTask.priority);
    setEnergyLevel(gapTask.energy_level);
    setGapTaskStatus(gapTask.status);
    setShowForm(true);
  }

  async function handleStatusChange(gapTask: GapTask, status: string) {
    await updateGapTaskStatus(gapTask.id, status);
    await refreshGapTaskData();
  }

  async function handleDelete(id: number) {
    await deleteGapTask(id);
    setFavoriteTaskIds((ids) => ids.filter((taskId) => taskId !== id));
    if (activeGapTask?.id === id) {
      resetTimerState();
    }
    await refreshGapTaskData();
  }

  function toggleFavorite(id: number) {
    setFavoriteTaskIds((ids) =>
      ids.includes(id) ? ids.filter((taskId) => taskId !== id) : [...ids, id],
    );
  }

  async function handleStartGapTaskTimer(gapTask: GapTask) {
    if (timerStatus === "running" || timerStatus === "paused" || isSavingWorkLog) {
      return;
    }

    const now = new Date();
    setActiveGapTask(gapTask);
    setTimerStatus("running");
    setStartedAt(now);
    setEndedAt(null);
    setRunningStartedAtMs(now.getTime());
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
    setWorkMemo(gapTask.description ?? "");
    setTimerMessage("");
    setTimerErrorMessage("");

    if (gapTask.status !== "in_progress") {
      await updateGapTaskStatus(gapTask.id, "in_progress");
      await refreshGapTaskData();
    }
  }

  function handlePauseTimer() {
    if (runningStartedAtMs === null) return;

    const nextElapsedBeforePauseMs =
      elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);

    setTimerStatus("paused");
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(nextElapsedBeforePauseMs);
    setElapsedSeconds(Math.floor(nextElapsedBeforePauseMs / 1000));
  }

  function handleResumeTimer() {
    setTimerStatus("running");
    setRunningStartedAtMs(Date.now());
  }

  async function handleStopTimer() {
    if (!activeGapTask || !startedAt) return;

    const now = new Date();
    const finalElapsedMs =
      timerStatus === "running" && runningStartedAtMs !== null
        ? elapsedBeforePauseMs + (now.getTime() - runningStartedAtMs)
        : elapsedBeforePauseMs;
    const finalElapsedSeconds = Math.floor(finalElapsedMs / 1000);
    const durationMinutes = Math.max(1, Math.ceil(finalElapsedSeconds / 60));

    setTimerStatus("stopped");
    setEndedAt(now);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(finalElapsedMs);
    setElapsedSeconds(finalElapsedSeconds);
    setIsSavingWorkLog(true);
    setTimerMessage("");
    setTimerErrorMessage("");

    try {
      await createWorkLog({
        gap_task_id: activeGapTask.id,
        started_at: toApiDateTime(startedAt),
        ended_at: toApiDateTime(now),
        duration_minutes: durationMinutes,
        memo: workMemo.trim() || `スキマタスク: ${activeGapTask.title}`,
      });
      await updateGapTaskStatus(activeGapTask.id, "completed");
      setTimerMessage(`スキマタスクの実績を保存しました（${durationMinutes}分）`);
      await refreshGapTaskData();
    } catch (error) {
      console.error(error);
      setTimerErrorMessage("スキマタスクの実績保存に失敗しました。");
    } finally {
      setIsSavingWorkLog(false);
    }
  }

  async function handleCancelTimer() {
    if (activeGapTask && timerStatus !== "stopped") {
      await updateGapTaskStatus(activeGapTask.id, "paused");
      await refreshGapTaskData();
    }
    resetTimerState();
  }

  function resetTimerState() {
    setActiveGapTask(null);
    setTimerStatus("idle");
    setStartedAt(null);
    setEndedAt(null);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
    setWorkMemo("");
    setTimerMessage("");
    setTimerErrorMessage("");
  }

  const isTimerActive = timerStatus === "running" || timerStatus === "paused";
  const availableMinutes = suggestion?.available_minutes ?? 0;
  const activeTasks = gapTasks.filter((task) => task.status !== "cancelled");
  const completedTasks = gapTasks.filter((task) => task.status === "completed");
  const suggestedTaskIds = new Set((suggestion?.suggested_tasks ?? []).map((task) => task.id));

  const bucketCounts = useMemo(() => {
    return TIME_BUCKETS.reduce<Record<string, number>>((acc, bucket) => {
      acc[bucket.key] = activeTasks.filter((task) => isTaskInBucket(task, bucket.key)).length;
      return acc;
    }, {});
  }, [activeTasks]);

  const selectedBucket = TIME_BUCKETS.find((bucket) => bucket.key === selectedBucketKey) ?? TIME_BUCKETS[0];

  const visibleTasks = useMemo(() => {
    let tasks = [...gapTasks];

    if (activeTab === "suggested") {
      const suggested = suggestion?.suggested_tasks ?? [];
      tasks = suggested.length > 0 ? suggested : tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
    }

    if (activeTab === "favorite") {
      tasks = tasks.filter((task) => favoriteTaskIds.includes(task.id));
    }

    if (activeTab === "completed") {
      tasks = tasks.filter((task) => task.status === "completed");
    }

    tasks = tasks.filter((task) => isTaskInBucket(task, selectedBucketKey));

    if (categoryFilter) {
      tasks = tasks.filter((task) => task.energy_level === categoryFilter || task.priority === categoryFilter);
    }

    return sortGapTasks(tasks, sortKey, suggestedTaskIds);
  }, [activeTab, categoryFilter, favoriteTaskIds, gapTasks, selectedBucketKey, sortKey, suggestedTaskIds, suggestion]);

  const weeklyCompleted = completedTasks.filter((task) => isWithinLastDays(task.updated_at, 7)).length;
  const completedToday = completedTasks.filter((task) => isToday(task.updated_at)).length;
  const todayCompletedMinutes = completedTasks
    .filter((task) => isToday(task.updated_at))
    .reduce((sum, task) => sum + task.required_minutes, 0);
  const targetMinutes = settings.dailyTargetMinutes;
  const targetProgress = Math.min(100, Math.round((todayCompletedMinutes / targetMinutes) * 100));
  const upcomingTaskBuckets = TIME_BUCKETS.map((bucket) => ({
    ...bucket,
    tasks: activeTasks
      .filter((task) => task.status !== "completed" && isTaskInBucket(task, bucket.key))
      .sort((a, b) => a.required_minutes - b.required_minutes),
  })).filter((bucket) => bucket.tasks.length > 0);

  return (
    <div className="gap-tasks-page">
      <header className="gap-tasks-hero">
        <div>
          <div className="gap-tasks-title-row">
            <h1>すきまタスク</h1>
            <span className="gap-tasks-help" title="すきま時間に合う小さなタスクを提案します。">?</span>
          </div>
          <p>まとまった時間が取れないときに取り組めるタスクを提案します。</p>
        </div>
        <div className="gap-tasks-hero-actions">
          <button type="button" className="gap-ghost-button" onClick={openSettings}>
            ⚙ 設定
          </button>
          <button type="button" className="gap-primary-button" onClick={refreshGapTaskData}>
            ↻ 提案を更新
          </button>
        </div>
      </header>

      <section className="gap-summary-grid" aria-label="すきまタスクのサマリー">
        <SummaryCard icon="⌛" tone="purple" label="現在のすきま時間" value={`${availableMinutes}分`} sub={suggestion?.next_event_title ? "次の予定まで" : "今日の残り時間"} />
        <SummaryCard
          icon="◔"
          tone="blue"
          label="今日のすきま時間合計"
          value={`${todayCompletedMinutes || availableMinutes || 0}分`}
          sub={`目標: ${targetMinutes}分`}
          progress={targetProgress}
        />
        <SummaryCard icon="✓" tone="green" label="完了したすきまタスク" value={`${completedToday}件`} sub="今日" />
        <SummaryCard icon="🔥" tone="orange" label="この週の完了数" value={`${weeklyCompleted}件`} sub="直近7日" />
      </section>

      {isTimerActive || activeGapTask ? (
        <section className="gap-active-timer-card">
          <div>
            <p className="gap-card-kicker">実行中のすきまタスク</p>
            <h2>{activeGapTask?.title ?? "スキマタスク"}</h2>
            <p>{activeGapTask?.description || "実績保存すると工数・進捗にも反映されます。"}</p>
          </div>
          <div className="gap-active-timer-panel">
            <strong>{formatElapsed(elapsedSeconds)}</strong>
            <div className="gap-active-timer-actions">
              <button type="button" onClick={handlePauseTimer} disabled={timerStatus !== "running"}>一時停止</button>
              <button type="button" onClick={handleResumeTimer} disabled={timerStatus !== "paused"}>再開</button>
              <button type="button" onClick={handleStopTimer} disabled={!isTimerActive || isSavingWorkLog}>完了して保存</button>
              <button type="button" onClick={handleCancelTimer} disabled={timerStatus === "running" || isSavingWorkLog}>保留</button>
            </div>
            <textarea value={workMemo} onChange={(e) => setWorkMemo(e.target.value)} placeholder="実績メモ" disabled={isSavingWorkLog} />
            <span>開始: {formatDate(startedAt)} / 停止: {formatDate(endedAt)}</span>
          </div>
        </section>
      ) : null}

      {timerMessage && <div className="gap-alert gap-alert--success">{timerMessage}</div>}
      {timerErrorMessage && <div className="gap-alert gap-alert--error">{timerErrorMessage}</div>}

      {showSettings && (
        <section className="gap-settings-modal" role="dialog" aria-modal="true" aria-label="すきまタスク設定">
          <form className="gap-settings-modal-card" onSubmit={handleSaveSettings}>
            <div className="gap-settings-modal-header">
              <div>
                <p className="gap-card-kicker">設定</p>
                <h2>すきまタスクの設定</h2>
              </div>
              <button type="button" onClick={() => setShowSettings(false)} aria-label="設定を閉じる">×</button>
            </div>
            <label>
              1日のすきま時間目標（分）
              <input
                type="number"
                min="1"
                value={settingsDraft.dailyTargetMinutes}
                onChange={(e) => setSettingsDraft((value) => ({ ...value, dailyTargetMinutes: Number(e.target.value) }))}
              />
            </label>
            <label>
              優先して提案する集中度
              <select
                value={settingsDraft.preferredEnergyLevel}
                onChange={(e) => setSettingsDraft((value) => ({ ...value, preferredEnergyLevel: e.target.value }))}
              >
                <option value="">指定しない</option>
                {ENERGY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="gap-settings-check-label">
              <input
                type="checkbox"
                checked={settingsDraft.excludeFocusMode}
                onChange={(e) => setSettingsDraft((value) => ({ ...value, excludeFocusMode: e.target.checked }))}
              />
              集中モード中はスキマタスク提案を控える
            </label>
            <div className="gap-form-actions">
              <button type="submit" className="gap-primary-button">保存する</button>
              <button type="button" className="gap-ghost-button" onClick={() => setShowSettings(false)}>キャンセル</button>
            </div>
          </form>
        </section>
      )}

      <div className="gap-toolbar">
        <div className="gap-tabs" role="tablist" aria-label="タスク表示切り替え">
          <button type="button" className={activeTab === "suggested" ? "is-active" : ""} onClick={() => setActiveTab("suggested")}>提案中 ({suggestion?.suggested_tasks.length ?? activeTasks.length})</button>
          <button type="button" className={activeTab === "favorite" ? "is-active" : ""} onClick={() => setActiveTab("favorite")}>お気に入り ({favoriteTaskIds.length})</button>
          <button type="button" className={activeTab === "completed" ? "is-active" : ""} onClick={() => setActiveTab("completed")}>完了済み ({completedTasks.length})</button>
        </div>
        <div className="gap-filters">
          <label>
            時間で絞り込む:
            <select value={selectedBucketKey} onChange={(e) => setSelectedBucketKey(e.target.value)}>
              {TIME_BUCKETS.map((bucket) => <option key={bucket.key} value={bucket.key}>{bucket.label}</option>)}
            </select>
          </label>
          <label>
            カテゴリ:
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setSuggestionEnergyLevel(ENERGY_LEVEL_OPTIONS.some((option) => option.value === e.target.value) ? e.target.value : ""); }}>
              <option value="">すべて</option>
              {ENERGY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>優先度: {option.label}</option>)}
            </select>
          </label>
          <label>
            並び替え:
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="recommended">おすすめ順</option>
              <option value="short">短い順</option>
              <option value="priority">優先度順</option>
            </select>
          </label>
        </div>
      </div>

      <div className="gap-main-layout">
        <aside className="gap-left-column">
          <section className="gap-side-card gap-time-buckets">
            <h2>すきま時間で選ぶ</h2>
            {TIME_BUCKETS.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                className={bucket.key === selectedBucketKey ? "is-active" : ""}
                onClick={() => setSelectedBucketKey(bucket.key)}
              >
                <strong>{bucket.label}</strong>
                <span>{bucketCounts[bucket.key] ?? 0}件</span>
              </button>
            ))}
          </section>

          <section className="gap-side-card">
            <h2>時間ができたときのおすすめ</h2>
            {upcomingTaskBuckets.length === 0 ? (
              <p className="gap-side-empty">未完了のスキマタスクがありません。</p>
            ) : upcomingTaskBuckets.map((bucket) => {
              const firstTask = bucket.tasks[0];
              return (
                <button key={bucket.key} type="button" className="gap-suggestion-row" onClick={() => setSelectedBucketKey(bucket.key)}>
                  <span>{bucket.label}</span>
                  <div>
                    <strong>{firstTask.title}</strong>
                    <small>{bucket.tasks.length}件 / 最短 {firstTask.required_minutes}分</small>
                  </div>
                  <b>›</b>
                </button>
              );
            })}
          </section>
        </aside>

        <section className="gap-task-board">
          <div className="gap-section-header">
            <div>
              <h2>おすすめタスク</h2>
              <p>{selectedBucket.label}でできるタスクを表示しています。{suggestion?.next_event_title ? ` 次の予定: ${suggestion.next_event_title}（${formatDateTime(suggestion.next_event_start_time)}）` : ""}</p>
            </div>
            <button type="button" className="gap-outline-button" onClick={() => { resetForm(); setShowForm(true); }}>＋ 追加</button>
          </div>

          {showForm && (
            <form className="gap-task-form" onSubmit={handleSubmit}>
              <div className="gap-form-grid">
                <label>タイトル<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：連絡対応を10分だけ進める" /></label>
                <label>必要時間<input type="number" min="1" value={requiredMinutes} onChange={(e) => setRequiredMinutes(e.target.value)} /></label>
                <label>優先度<select value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label>エネルギー<select value={energyLevel} onChange={(e) => setEnergyLevel(e.target.value)}>{ENERGY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                {editingGapTask && <label>状態<select value={gapTaskStatus} onChange={(e) => setGapTaskStatus(e.target.value)}>{GAP_TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
              </div>
              <label>説明<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="空き時間にやる内容を書く" /></label>
              <div className="gap-form-actions">
                <button type="submit" className="gap-primary-button">{editingGapTask ? "更新する" : "作成する"}</button>
                <button type="button" className="gap-ghost-button" onClick={() => { resetForm(); setShowForm(false); }}>キャンセル</button>
              </div>
            </form>
          )}

          {visibleTasks.length === 0 ? (
            <div className="gap-empty-state">
              <strong>この条件に合うスキマタスクはありません。</strong>
              <p>短いタスクを追加するか、時間・カテゴリの条件を変えてください。</p>
              <button type="button" className="gap-primary-button" onClick={() => setShowForm(true)}>スキマタスクを追加</button>
            </div>
          ) : (
            <div className="gap-task-table">
              <div className="gap-task-table-head">
                <span>タスク</span>
                <span>目安時間</span>
                <span>カテゴリ</span>
                <span>アクション</span>
              </div>
              {visibleTasks.map((gapTask) => (
                <article key={gapTask.id} className="gap-task-row">
                  <div className="gap-task-main">
                    <button type="button" className="gap-check" onClick={() => handleStatusChange(gapTask, gapTask.status === "completed" ? "todo" : "completed")} aria-label="完了切り替え">
                      {gapTask.status === "completed" ? "✓" : ""}
                    </button>
                    <button type="button" className={favoriteTaskIds.includes(gapTask.id) ? "gap-star is-active" : "gap-star"} onClick={() => toggleFavorite(gapTask.id)} aria-label="お気に入り切り替え">★</button>
                    <span className={`gap-task-icon gap-task-icon--${getTaskTone(gapTask)}`}>{getTaskIcon(gapTask)}</span>
                    <div>
                      <h3>{gapTask.title}</h3>
                      <p>{gapTask.description || "説明なし"}</p>
                    </div>
                  </div>
                  <div className="gap-time-cell">◷ {gapTask.required_minutes}分</div>
                  <div><span className={`gap-chip gap-chip--${getTaskTone(gapTask)}`}>{getCategoryLabel(gapTask)}</span></div>
                  <div className="gap-row-actions">
                    <button type="button" onClick={() => handleStartGapTaskTimer(gapTask)} disabled={isTimerActive || isSavingWorkLog || gapTask.status === "completed" || gapTask.status === "cancelled"}>開始する</button>
                    <button type="button" onClick={() => handleEdit(gapTask)}>編集</button>
                    <button type="button" onClick={() => handleDelete(gapTask.id)}>⋮</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="gap-right-column">
          {showTip && (
            <section className="gap-side-card gap-tip-card">
              <button type="button" onClick={() => setShowTip(false)} aria-label="閉じる">×</button>
              <h2>すきまタスクのコツ</h2>
              <ul>
                <li>短い時間でも積み重ねることで大きな成果になります</li>
                <li>5分でもできるタスクから始めてみましょう</li>
                <li>完了したタスクは達成感につながります</li>
              </ul>
            </section>
          )}

          <section className="gap-side-card gap-settings-card">
            <h2>すきまタスクの設定</h2>
            <SettingsRow icon="🔒" title="集中モードの除外設定" text={settings.excludeFocusMode ? "集中モード中は提案を控えます" : "集中モード中も提案します"} />
            <SettingsRow icon="🚩" title="集中度の優先設定" text={settings.preferredEnergyLevel ? getOptionLabel(ENERGY_LEVEL_OPTIONS, settings.preferredEnergyLevel) : "指定なし"} />
            <SettingsRow icon="⏱" title="1日の目標設定" text={`${settings.dailyTargetMinutes}分`} />
            <button type="button" onClick={openSettings}>設定を開く ›</button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
  sub,
  progress,
}: {
  icon: string;
  tone: string;
  label: string;
  value: string;
  sub: string;
  progress?: number;
}) {
  return (
    <div className="gap-summary-card">
      <span className={`gap-summary-icon gap-summary-icon--${tone}`}>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {progress !== undefined && <div className="gap-progress"><span style={{ width: `${progress}%` }} /></div>}
        <small>{sub}</small>
      </div>
    </div>
  );
}

function SettingsRow({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="gap-settings-row">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "未定";

  return new Date(value).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: Date | null) {
  if (!value) return "-";

  return value.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function toApiDateTime(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
}

function getOptionLabel(options: { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function isTaskInBucket(task: GapTask, bucketKey: string) {
  const bucket = TIME_BUCKETS.find((item) => item.key === bucketKey);
  if (!bucket) return true;
  return task.required_minutes >= bucket.min && task.required_minutes <= bucket.max;
}

function sortGapTasks(tasks: GapTask[], sortKey: SortKey, suggestedTaskIds: Set<number>) {
  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };

  return [...tasks].sort((a, b) => {
    if (sortKey === "short") return a.required_minutes - b.required_minutes;
    if (sortKey === "priority") return (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);

    const suggestedDiff = Number(suggestedTaskIds.has(b.id)) - Number(suggestedTaskIds.has(a.id));
    if (suggestedDiff !== 0) return suggestedDiff;
    const priorityDiff = (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return a.required_minutes - b.required_minutes;
  });
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function isWithinLastDays(value: string, days: number) {
  const date = new Date(value).getTime();
  return Number.isFinite(date) && Date.now() - date <= days * 24 * 60 * 60 * 1000;
}

function readFavoriteGapTaskIds() {
  try {
    const raw = window.localStorage.getItem("life-manager-gap-task-favorites");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function readGapTaskSettings(): GapTaskSettings {
  try {
    const raw = window.localStorage.getItem(GAP_TASK_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      dailyTargetMinutes: Math.max(1, Number(parsed.dailyTargetMinutes ?? DEFAULT_GAP_TASK_SETTINGS.dailyTargetMinutes)),
      excludeFocusMode: Boolean(parsed.excludeFocusMode ?? DEFAULT_GAP_TASK_SETTINGS.excludeFocusMode),
      preferredEnergyLevel: typeof parsed.preferredEnergyLevel === "string" ? parsed.preferredEnergyLevel : DEFAULT_GAP_TASK_SETTINGS.preferredEnergyLevel,
    };
  } catch {
    return DEFAULT_GAP_TASK_SETTINGS;
  }
}

function getTaskIcon(task: GapTask) {
  if (task.energy_level === "low") return "☕";
  if (task.priority === "high") return "▣";
  if (task.required_minutes <= 5) return "✎";
  if (task.required_minutes <= 15) return "✉";
  return "📘";
}

function getTaskTone(task: GapTask) {
  if (task.priority === "high") return "green";
  if (task.energy_level === "low") return "orange";
  if (task.required_minutes <= 5) return "pink";
  if (task.required_minutes <= 15) return "purple";
  return "blue";
}

function getCategoryLabel(task: GapTask) {
  if (task.priority === "high") return "計画・振り返り";
  if (task.energy_level === "low") return "軽作業";
  const energyLabel = getOptionLabel(ENERGY_LEVEL_OPTIONS, task.energy_level);
  if (task.required_minutes <= 5) return "思考・アイデア";
  if (task.required_minutes <= 15) return "コミュニケーション";
  return energyLabel === task.energy_level ? "学習" : energyLabel;
}
