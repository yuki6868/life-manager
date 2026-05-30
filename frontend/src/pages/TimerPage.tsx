import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createWorkLog } from "../api/workLogs";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import { createUrgentTask, fetchTasks, updateTaskStatus } from "../api/tasks";
import type { Task } from "../api/tasks";

type TimerStatus = "idle" | "running" | "paused" | "stopped";

type InterruptedTimerSnapshot = {
  selectedTaskId: string;
  selectedCalendarEventId: string;
  startedAt: Date | null;
  elapsedBeforePauseMs: number;
  memo: string;
};

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatDateTime(date: Date | null) {
  if (!date) return "-";

  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toApiDateTime(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
}

function clampScore(value: number) {
  if (Number.isNaN(value)) return 5;
  return Math.min(5, Math.max(1, value));
}

export default function TimerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState("");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [runningStartedAtMs, setRunningStartedAtMs] = useState<number | null>(null);
  const [elapsedBeforePauseMs, setElapsedBeforePauseMs] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [interruptedTimerSnapshot, setInterruptedTimerSnapshot] =
    useState<InterruptedTimerSnapshot | null>(null);
  const [urgentTitle, setUrgentTitle] = useState("");
  const [urgentDescription, setUrgentDescription] = useState("");
  const [urgentEstimatedMinutes, setUrgentEstimatedMinutes] = useState("15");
  const [urgentEnergyLevel, setUrgentEnergyLevel] = useState("medium");
  const [urgentUrgency, setUrgentUrgency] = useState("5");
  const [urgentImportance, setUrgentImportance] = useState("5");
  const [urgentInterruptionReason, setUrgentInterruptionReason] = useState("");
  const [isCreatingUrgentTask, setIsCreatingUrgentTask] = useState(false);
  const [urgentMessage, setUrgentMessage] = useState("");
  const [urgentErrorMessage, setUrgentErrorMessage] = useState("");

  useEffect(() => {
    Promise.all([fetchTasks(), fetchCalendarEvents()]).then(([taskData, eventData]) => {
      setTasks(taskData);
      setCalendarEvents(eventData);
    });
  }, []);

  useEffect(() => {
    if (status !== "running" || runningStartedAtMs === null) return;

    const intervalId = window.setInterval(() => {
      const elapsedMs = elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);
      setElapsedSeconds(Math.floor(elapsedMs / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [elapsedBeforePauseMs, runningStartedAtMs, status]);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === Number(selectedTaskId)) ?? null;
  }, [selectedTaskId, tasks]);

  const selectableCalendarEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => event.status !== "cancelled")
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [calendarEvents]);

  const selectedCalendarEvent = useMemo(() => {
    return (
      calendarEvents.find((event) => event.id === Number(selectedCalendarEventId)) ??
      null
    );
  }, [calendarEvents, selectedCalendarEventId]);

  const canStart = status === "idle" || status === "stopped";
  const canPause = status === "running";
  const canResume = status === "paused";
  const canStop = status === "running" || status === "paused";
  const isTimerActive = status === "running" || status === "paused";
  const selectedTaskIsUrgent = selectedTask?.task_type === "urgent";


  function handleSelectCalendarEvent(eventId: string) {
    setSelectedCalendarEventId(eventId);

    const event = calendarEvents.find((item) => item.id === Number(eventId));
    if (event?.task_id) {
      setSelectedTaskId(String(event.task_id));
    }
  }

  function getPlannedMinutes(event: CalendarEvent | null) {
    if (!event) return null;

    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  function formatDifferenceMinutes(value: number | null | undefined) {
    if (value === null || value === undefined) return "";
    if (value === 0) return "予定どおり";
    return value > 0 ? `予定より${value}分超過` : `予定より${Math.abs(value)}分短縮`;
  }

  function getCurrentElapsedBeforePauseMs() {
    if (status === "running" && runningStartedAtMs !== null) {
      return elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);
    }

    return elapsedBeforePauseMs;
  }

  function resetUrgentForm() {
    setUrgentTitle("");
    setUrgentDescription("");
    setUrgentEstimatedMinutes("15");
    setUrgentEnergyLevel("medium");
    setUrgentUrgency("5");
    setUrgentImportance("5");
    setUrgentInterruptionReason("");
  }

  async function handleCreateAndStartUrgentTask(e: FormEvent) {
    e.preventDefault();

    if (!urgentTitle.trim() || isCreatingUrgentTask || isSaving) return;

    setIsCreatingUrgentTask(true);
    setUrgentMessage("");
    setUrgentErrorMessage("");
    setSaveMessage("");
    setErrorMessage("");

    try {
      const wasTimerActive = isTimerActive;
      const interruptedElapsedMs = getCurrentElapsedBeforePauseMs();

      if (wasTimerActive) {
        setInterruptedTimerSnapshot({
          selectedTaskId,
          selectedCalendarEventId,
          startedAt,
          elapsedBeforePauseMs: interruptedElapsedMs,
          memo,
        });

        if (selectedTaskId) {
          await updateTaskStatus(Number(selectedTaskId), "paused");
        }
      }

      const urgentTask = await createUrgentTask({
        title: urgentTitle.trim(),
        description: urgentDescription.trim() || undefined,
        estimated_minutes: Math.max(1, Number(urgentEstimatedMinutes || 1)),
        energy_level: urgentEnergyLevel,
        status: "in_progress",
        urgency: clampScore(Number(urgentUrgency || 5)),
        importance: clampScore(Number(urgentImportance || 5)),
        interruption_reason: urgentInterruptionReason.trim() || null,
      });

      const now = new Date();
      setSelectedTaskId(String(urgentTask.id));
      setSelectedCalendarEventId("");
      setStatus("running");
      setStartedAt(now);
      setEndedAt(null);
      setRunningStartedAtMs(now.getTime());
      setElapsedBeforePauseMs(0);
      setElapsedSeconds(0);
      setMemo(
        urgentInterruptionReason.trim()
          ? `緊急対応: ${urgentInterruptionReason.trim()}`
          : `緊急対応: ${urgentTask.title}`,
      );
      resetUrgentForm();
      setUrgentMessage(
        wasTimerActive
          ? "現在のタスクを中断し、緊急タスクを開始しました。"
          : "緊急タスクを開始しました。",
      );

      const taskData = await fetchTasks();
      setTasks(taskData);
    } catch (error) {
      console.error(error);
      setUrgentErrorMessage("緊急タスクの開始に失敗しました。");
    } finally {
      setIsCreatingUrgentTask(false);
    }
  }

  async function handleResumeInterruptedTask() {
    if (!interruptedTimerSnapshot) return;

    const snapshot = interruptedTimerSnapshot;
    const now = Date.now();

    setSelectedTaskId(snapshot.selectedTaskId);
    setSelectedCalendarEventId(snapshot.selectedCalendarEventId);
    setStartedAt(snapshot.startedAt);
    setEndedAt(null);
    setElapsedBeforePauseMs(snapshot.elapsedBeforePauseMs);
    setElapsedSeconds(Math.floor(snapshot.elapsedBeforePauseMs / 1000));
    setRunningStartedAtMs(now);
    setMemo(snapshot.memo);
    setStatus("running");
    setInterruptedTimerSnapshot(null);
    setUrgentMessage("中断していた元タスクを再開しました。");
    setSaveMessage("");
    setErrorMessage("");

    if (snapshot.selectedTaskId) {
      await updateTaskStatus(Number(snapshot.selectedTaskId), "in_progress");
      const taskData = await fetchTasks();
      setTasks(taskData);
    }
  }

  function handleStart() {
    const now = new Date();

    setSaveMessage("");
    setErrorMessage("");
    setStatus("running");
    setStartedAt(now);
    setEndedAt(null);
    setRunningStartedAtMs(now.getTime());
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
    setMemo("");
    setSaveMessage("");
    setErrorMessage("");
  }

  function handlePause() {
    if (runningStartedAtMs === null) return;

    const nextElapsedBeforePauseMs =
      elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);

    setStatus("paused");
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(nextElapsedBeforePauseMs);
    setElapsedSeconds(Math.floor(nextElapsedBeforePauseMs / 1000));
  }

  function handleResume() {
    setStatus("running");
    setRunningStartedAtMs(Date.now());
  }

  async function handleStop() {
    if (!startedAt) return;

    const now = new Date();
    const finalElapsedMs =
      status === "running" && runningStartedAtMs !== null
        ? elapsedBeforePauseMs + (now.getTime() - runningStartedAtMs)
        : elapsedBeforePauseMs;
    const finalElapsedSeconds = Math.floor(finalElapsedMs / 1000);
    const durationMinutes = Math.max(1, Math.ceil(finalElapsedSeconds / 60));

    setStatus("stopped");
    setEndedAt(now);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(finalElapsedMs);
    setElapsedSeconds(finalElapsedSeconds);
    setIsSaving(true);
    setSaveMessage("");
    setErrorMessage("");

    try {
      const savedLog = await createWorkLog({
        task_id: selectedTaskId ? Number(selectedTaskId) : null,
        calendar_event_id: selectedCalendarEventId ? Number(selectedCalendarEventId) : null,
        started_at: toApiDateTime(startedAt),
        ended_at: toApiDateTime(now),
        duration_minutes: durationMinutes,
        memo: memo.trim() || null,
      });

      if (selectedTaskId && selectedTaskIsUrgent) {
        await updateTaskStatus(Number(selectedTaskId), "completed");
      }

      const comparisonMessage = savedLog.difference_minutes !== null && savedLog.difference_minutes !== undefined
        ? ` / ${formatDifferenceMinutes(savedLog.difference_minutes)}`
        : "";
      const resumeMessage = interruptedTimerSnapshot
        ? " / 元タスクを再開できます"
        : "";
      setSaveMessage(`実績を保存しました（${durationMinutes}分${comparisonMessage}${resumeMessage}）`);
      const [taskData, eventData] = await Promise.all([
        fetchTasks(),
        fetchCalendarEvents(),
      ]);
      setTasks(taskData);
      setCalendarEvents(eventData);
    } catch (error) {
      console.error(error);
      setErrorMessage("実績保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setStatus("idle");
    setStartedAt(null);
    setEndedAt(null);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
    setMemo("");
    setSelectedCalendarEventId("");
    setInterruptedTimerSnapshot(null);
    setSaveMessage("");
    setErrorMessage("");
    setUrgentMessage("");
    setUrgentErrorMessage("");
  }

  return (
    <section
      style={{
        padding: "32px",
        borderTop: "1px solid #ddd",
      }}
    >
      <h1>タイマー</h1>
      <p style={{ color: "#666" }}>
        作業の開始・一時停止・再開・停止を管理します。停止時に作業ログへ保存し、タスク・プロジェクトの実績時間を更新します。
      </p>

      <section
        style={{
          display: "grid",
          gap: "12px",
          maxWidth: "620px",
          padding: "20px",
          border: "1px solid #ffd2d2",
          borderRadius: "12px",
          background: "#fff7f7",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ margin: 0 }}>緊急タスク割り込み</h2>
        <p style={{ color: "#666", margin: 0 }}>
          突然入ったタスクを登録し、現在のタイマーが動いている場合は中断してから緊急タスクを開始します。
        </p>

        {interruptedTimerSnapshot && status === "stopped" && (
          <div
            style={{
              padding: "12px",
              border: "1px solid #ffd28a",
              borderRadius: "10px",
              background: "#fff9ec",
            }}
          >
            <strong>中断中の元タスクがあります。</strong>
            <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
              経過時間 {formatElapsed(Math.floor(interruptedTimerSnapshot.elapsedBeforePauseMs / 1000))}
            </div>
            <button
              type="button"
              onClick={handleResumeInterruptedTask}
              disabled={isSaving || isCreatingUrgentTask}
              style={{ marginTop: "8px" }}
            >
              元タスクを再開
            </button>
          </div>
        )}

        <form onSubmit={handleCreateAndStartUrgentTask} style={{ display: "grid", gap: "10px" }}>
          <label>
            緊急タスク名
            <input
              value={urgentTitle}
              onChange={(e) => setUrgentTitle(e.target.value)}
              placeholder="例：急ぎの連絡対応"
              disabled={isCreatingUrgentTask || isSaving}
              style={{ display: "block", width: "100%", padding: "8px" }}
            />
          </label>

          <label>
            割り込み理由
            <textarea
              value={urgentInterruptionReason}
              onChange={(e) => setUrgentInterruptionReason(e.target.value)}
              placeholder="例：クライアントから至急確認依頼が来た"
              disabled={isCreatingUrgentTask || isSaving}
              style={{ display: "block", width: "100%", padding: "8px", minHeight: "64px" }}
            />
          </label>

          <label>
            詳細メモ
            <textarea
              value={urgentDescription}
              onChange={(e) => setUrgentDescription(e.target.value)}
              placeholder="緊急タスクの内容を書く"
              disabled={isCreatingUrgentTask || isSaving}
              style={{ display: "block", width: "100%", padding: "8px", minHeight: "64px" }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            <label>
              見積分
              <input
                type="number"
                min="1"
                value={urgentEstimatedMinutes}
                onChange={(e) => setUrgentEstimatedMinutes(e.target.value)}
                disabled={isCreatingUrgentTask || isSaving}
                style={{ display: "block", width: "100%", padding: "8px" }}
              />
            </label>
            <label>
              緊急度
              <input
                type="number"
                min="1"
                max="5"
                value={urgentUrgency}
                onChange={(e) => setUrgentUrgency(e.target.value)}
                disabled={isCreatingUrgentTask || isSaving}
                style={{ display: "block", width: "100%", padding: "8px" }}
              />
            </label>
            <label>
              重要度
              <input
                type="number"
                min="1"
                max="5"
                value={urgentImportance}
                onChange={(e) => setUrgentImportance(e.target.value)}
                disabled={isCreatingUrgentTask || isSaving}
                style={{ display: "block", width: "100%", padding: "8px" }}
              />
            </label>
            <label>
              エネルギー
              <select
                value={urgentEnergyLevel}
                onChange={(e) => setUrgentEnergyLevel(e.target.value)}
                disabled={isCreatingUrgentTask || isSaving}
                style={{ display: "block", width: "100%", padding: "8px" }}
              >
                <option value="high">高集中</option>
                <option value="medium">普通</option>
                <option value="low">低め</option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={!urgentTitle.trim() || isCreatingUrgentTask || isSaving}
          >
            {isTimerActive ? "現在タスクを中断して緊急タスク開始" : "緊急タスク追加して開始"}
          </button>
        </form>

        {urgentMessage && <div style={{ color: "#0a7f35" }}>{urgentMessage}</div>}
        {urgentErrorMessage && <div style={{ color: "#b00020" }}>{urgentErrorMessage}</div>}
      </section>

      <div
        style={{
          display: "grid",
          gap: "16px",
          maxWidth: "620px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <label>
          紐づける予定
          <select
            value={selectedCalendarEventId}
            onChange={(e) => handleSelectCalendarEvent(e.target.value)}
            disabled={status === "running" || status === "paused"}
            style={{ display: "block", width: "100%", padding: "8px" }}
          >
            <option value="">予定に紐づけない</option>
            {selectableCalendarEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} / {event.start_time.slice(0, 16).replace("T", " ")} / {event.status}
              </option>
            ))}
          </select>
        </label>

        {selectedCalendarEvent && (
          <div
            style={{
              padding: "12px",
              background: "#fff9ec",
              border: "1px solid #ffe1a8",
              borderRadius: "10px",
            }}
          >
            <strong>予定: {selectedCalendarEvent.title}</strong>
            <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
              計画時間 {getPlannedMinutes(selectedCalendarEvent)}分 / 状態 {selectedCalendarEvent.status}
            </div>
          </div>
        )}

        <label>
          作業タスク
          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            disabled={status === "running" || status === "paused"}
            style={{ display: "block", width: "100%", padding: "8px" }}
          >
            <option value="">タスクを選択しない</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>

        {selectedTask && (
          <div
            style={{
              padding: "12px",
              background: "#f7fbff",
              border: "1px solid #d9f3ff",
              borderRadius: "10px",
            }}
          >
            <strong>{selectedTask.title}</strong>
            <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
              見積 {selectedTask.estimated_minutes}分 / 優先度 {selectedTask.priority} / エネルギー {selectedTask.energy_level}
            </div>
            {selectedTask.task_type === "urgent" && (
              <div style={{ fontSize: "13px", color: "#b00020", marginTop: "4px" }}>
                緊急タスク / 緊急度 {selectedTask.urgency ?? "-"} / 重要度 {selectedTask.importance ?? "-"}
                {selectedTask.interruption_reason ? ` / 理由: ${selectedTask.interruption_reason}` : ""}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            fontSize: "48px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textAlign: "center",
          }}
        >
          {formatElapsed(elapsedSeconds)}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px",
          }}
        >
          <button type="button" onClick={handleStart} disabled={!canStart}>
            開始
          </button>
          <button type="button" onClick={handlePause} disabled={!canPause}>
            一時停止
          </button>
          <button type="button" onClick={handleResume} disabled={!canResume}>
            再開
          </button>
          <button type="button" onClick={handleStop} disabled={!canStop || isSaving}>
            停止して保存
          </button>
        </div>

        <label>
          実績メモ
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={isSaving}
            placeholder="例：API実装、エラー調査など"
            style={{ display: "block", width: "100%", padding: "8px", minHeight: "72px" }}
          />
        </label>

        {saveMessage && <div style={{ color: "#0a7f35" }}>{saveMessage}</div>}
        {errorMessage && <div style={{ color: "#b00020" }}>{errorMessage}</div>}

        <button type="button" onClick={handleReset} disabled={status === "running" || isSaving}>
          リセット
        </button>

        <div style={{ color: "#666", fontSize: "14px" }}>
          <div>状態: {status}</div>
          <div>開始: {formatDateTime(startedAt)}</div>
          <div>停止: {formatDateTime(endedAt)}</div>
        </div>
      </div>
    </section>
  );
}
