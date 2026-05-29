import { useEffect, useMemo, useState } from "react";
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

export default function TimerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [runningStartedAtMs, setRunningStartedAtMs] = useState<number | null>(null);
  const [elapsedBeforePauseMs, setElapsedBeforePauseMs] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    fetchTasks().then(setTasks);
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

  const canStart = status === "idle" || status === "stopped";
  const canPause = status === "running";
  const canResume = status === "paused";
  const canStop = status === "running" || status === "paused";

  function handleStart() {
    const now = new Date();

    setStatus("running");
    setStartedAt(now);
    setEndedAt(null);
    setRunningStartedAtMs(now.getTime());
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
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

  function handleStop() {
    const now = new Date();
    const finalElapsedMs =
      status === "running" && runningStartedAtMs !== null
        ? elapsedBeforePauseMs + (now.getTime() - runningStartedAtMs)
        : elapsedBeforePauseMs;

    setStatus("stopped");
    setEndedAt(now);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(finalElapsedMs);
    setElapsedSeconds(Math.floor(finalElapsedMs / 1000));
  }

  function handleReset() {
    setStatus("idle");
    setStartedAt(null);
    setEndedAt(null);
    setRunningStartedAtMs(null);
    setElapsedBeforePauseMs(0);
    setElapsedSeconds(0);
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
        作業の開始・一時停止・再開・停止を管理します。実績保存は次のcommitで追加します。
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
          <button type="button" onClick={handleStop} disabled={!canStop}>
            停止
          </button>
        </div>

        <button type="button" onClick={handleReset} disabled={status === "running"}>
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
