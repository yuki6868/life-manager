import { useEffect, useMemo, useState } from "react";
import { createWorkLog } from "../api/workLogs";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";

type TimerStatus = "idle" | "running" | "paused" | "stopped";

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

      const comparisonMessage = savedLog.difference_minutes !== null && savedLog.difference_minutes !== undefined
        ? ` / ${formatDifferenceMinutes(savedLog.difference_minutes)}`
        : "";
      setSaveMessage(`実績を保存しました（${durationMinutes}分${comparisonMessage}）`);
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
    setSaveMessage("");
    setErrorMessage("");
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
