import { useEffect, useState } from "react";
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

type TimerStatus = "idle" | "running" | "paused" | "stopped";

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
  }

  async function handleStatusChange(gapTask: GapTask, status: string) {
    await updateGapTaskStatus(gapTask.id, status);
    await refreshGapTaskData();
  }

  async function handleDelete(id: number) {
    await deleteGapTask(id);
    if (activeGapTask?.id === id) {
      resetTimerState();
    }
    await refreshGapTaskData();
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

  return (
    <div style={{ padding: "32px" }}>
      <h1>スキマタスク管理</h1>
      <p>
        5分〜30分程度の空き時間に進められる小さなタスクを登録します。
        必要時間・優先度・エネルギーレベル・状態を管理できます。
      </p>

      <section
        style={{
          border: "1px solid #cfe3ff",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
          background: "#f7fbff",
        }}
      >
        <h2>スキマタスクタイマー</h2>
        {activeGapTask ? (
          <>
            <p>
              実行中: <strong>{activeGapTask.title}</strong> / 目安 {activeGapTask.required_minutes}分
            </p>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                margin: "12px 0",
              }}
            >
              {formatElapsed(elapsedSeconds)}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={handlePauseTimer} disabled={timerStatus !== "running"}>
                一時停止
              </button>
              <button type="button" onClick={handleResumeTimer} disabled={timerStatus !== "paused"}>
                再開
              </button>
              <button
                type="button"
                onClick={handleStopTimer}
                disabled={!isTimerActive || isSavingWorkLog}
              >
                停止して実績保存
              </button>
              <button
                type="button"
                onClick={handleCancelTimer}
                disabled={timerStatus === "running" || isSavingWorkLog}
              >
                中断して保留
              </button>
            </div>
            <label style={{ display: "block", marginTop: "12px" }}>
              実績メモ
              <textarea
                value={workMemo}
                onChange={(e) => setWorkMemo(e.target.value)}
                disabled={isSavingWorkLog}
                style={{ display: "block", width: "420px", maxWidth: "100%", height: "72px", padding: "8px" }}
              />
            </label>
            <div style={{ color: "#666", fontSize: "14px", marginTop: "8px" }}>
              <div>状態: {timerStatus}</div>
              <div>開始: {formatDate(startedAt)}</div>
              <div>停止: {formatDate(endedAt)}</div>
            </div>
          </>
        ) : (
          <p>提案または一覧の「タイマー開始」からスキマタスクを開始できます。</p>
        )}
        {timerMessage && <div style={{ color: "#0a7f35", marginTop: "8px" }}>{timerMessage}</div>}
        {timerErrorMessage && <div style={{ color: "#b00020", marginTop: "8px" }}>{timerErrorMessage}</div>}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
          background: "#fafafa",
        }}
      >
        <h2>今できるスキマタスク提案</h2>
        <p>次の予定までの空き時間に入るタスクを、優先度順に表示します。</p>

        <div style={{ marginBottom: "12px" }}>
          <label>今のエネルギーレベルで絞り込み</label>
          <br />
          <select
            value={suggestionEnergyLevel}
            onChange={(e) => setSuggestionEnergyLevel(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
          >
            <option value="">指定なし</option>
            {ENERGY_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {suggestion ? (
          <>
            <p>
              空き時間: <strong>{suggestion.available_minutes}分</strong>
              {suggestion.next_event_title
                ? ` / 次の予定: ${suggestion.next_event_title}（${formatDateTime(
                    suggestion.next_event_start_time,
                  )}）`
                : " / 今日の残り時間で提案"}
            </p>

            {suggestion.suggested_tasks.length === 0 ? (
              <p>今の空き時間で実行できるスキマタスクはありません。</p>
            ) : (
              <div>
                {suggestion.suggested_tasks.map((gapTask) => (
                  <div
                    key={gapTask.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      padding: "12px",
                      marginBottom: "8px",
                      background: "#fff",
                    }}
                  >
                    <strong>{gapTask.title}</strong>
                    <p style={{ margin: "6px 0" }}>
                      {gapTask.required_minutes}分 / 優先度: {getOptionLabel(PRIORITY_OPTIONS, gapTask.priority)} /
                      エネルギー: {getOptionLabel(ENERGY_LEVEL_OPTIONS, gapTask.energy_level)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleStartGapTaskTimer(gapTask)}
                      disabled={isTimerActive || isSavingWorkLog}
                    >
                      タイマー開始
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p>スキマタスク提案を読み込み中です。</p>
        )}
      </section>

      <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
        <div>
          <label>スキマタスクタイトル</label>
          <br />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：連絡対応を10分だけ進める"
            style={{ width: "420px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>説明</label>
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="空き時間にやる内容を書く"
            style={{ width: "420px", height: "90px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>必要時間（分）</label>
          <br />
          <input
            type="number"
            min="1"
            value={requiredMinutes}
            onChange={(e) => setRequiredMinutes(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
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
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>エネルギーレベル</label>
          <br />
          <select
            value={energyLevel}
            onChange={(e) => setEnergyLevel(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
          >
            {ENERGY_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {editingGapTask && (
          <div style={{ marginTop: "12px" }}>
            <label>状態</label>
            <br />
            <select
              value={gapTaskStatus}
              onChange={(e) => setGapTaskStatus(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              {GAP_TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" style={{ marginTop: "16px" }}>
          {editingGapTask ? "更新する" : "作成する"}
        </button>

        {editingGapTask && (
          <button type="button" onClick={resetForm} style={{ marginLeft: "8px" }}>
            キャンセル
          </button>
        )}
      </form>

      <h2>スキマタスク一覧</h2>

      {gapTasks.length === 0 ? (
        <p>まだスキマタスクがありません。</p>
      ) : (
        <div>
          {gapTasks.map((gapTask) => (
            <div
              key={gapTask.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <h3>{gapTask.title}</h3>
              <p>{gapTask.description || "説明なし"}</p>
              <p>必要時間: {gapTask.required_minutes}分</p>
              <p>優先度: {getOptionLabel(PRIORITY_OPTIONS, gapTask.priority)}</p>
              <p>
                エネルギー: {getOptionLabel(ENERGY_LEVEL_OPTIONS, gapTask.energy_level)}
              </p>
              <p>状態: {getOptionLabel(GAP_TASK_STATUS_OPTIONS, gapTask.status)}</p>

              <button
                type="button"
                onClick={() => handleStartGapTaskTimer(gapTask)}
                disabled={isTimerActive || isSavingWorkLog || gapTask.status === "completed" || gapTask.status === "cancelled"}
                style={{ marginRight: "8px" }}
              >
                タイマー開始
              </button>

              <StatusActionButtons
                currentStatus={gapTask.status}
                options={GAP_TASK_STATUS_OPTIONS}
                onChange={(status) => handleStatusChange(gapTask, status)}
              />

              <button onClick={() => handleEdit(gapTask)}>編集</button>
              <button
                onClick={() => handleDelete(gapTask.id)}
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
