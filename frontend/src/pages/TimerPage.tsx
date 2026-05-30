import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { createWorkLog } from "../api/workLogs";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import { createUrgentTask, fetchTasks, updateTaskStatus } from "../api/tasks";
import type { Task } from "../api/tasks";
import { readTimerSettings } from "../utils/appSettings";

type TimerStatus = "idle" | "running" | "paused" | "stopped";

type InterruptedTimerSnapshot = {
  selectedTaskId: string;
  selectedCalendarEventId: string;
  startedAt: Date | null;
  elapsedBeforePauseMs: number;
  memo: string;
};

const TIMER_STORAGE_KEY = "life-manager.timer.state.v1";

type PersistedInterruptedTimerSnapshot = Omit<InterruptedTimerSnapshot, "startedAt"> & {
  startedAt: string | null;
};

type PersistedTimerState = {
  selectedTaskId: string;
  selectedCalendarEventId: string;
  status: TimerStatus;
  startedAt: string | null;
  endedAt: string | null;
  runningStartedAtMs: number | null;
  elapsedBeforePauseMs: number;
  memo: string;
  interruptedTimerSnapshot: PersistedInterruptedTimerSnapshot | null;
};

function parseStoredDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeInterruptedSnapshot(
  snapshot: InterruptedTimerSnapshot | null,
): PersistedInterruptedTimerSnapshot | null {
  if (!snapshot) return null;

  return {
    ...snapshot,
    startedAt: snapshot.startedAt?.toISOString() ?? null,
  };
}

function deserializeInterruptedSnapshot(
  snapshot: PersistedInterruptedTimerSnapshot | null | undefined,
): InterruptedTimerSnapshot | null {
  if (!snapshot) return null;

  return {
    ...snapshot,
    startedAt: parseStoredDate(snapshot.startedAt),
  };
}

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
  const [hasRestoredTimerState, setHasRestoredTimerState] = useState(false);
  const [timerSettings, setTimerSettings] = useState(() => readTimerSettings());
  const didRestoreTimerStateRef = useRef(false);

  useEffect(() => {
    if (didRestoreTimerStateRef.current) return;
    didRestoreTimerStateRef.current = true;

    const storedTimerState = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!storedTimerState) {
      setHasRestoredTimerState(true);
      return;
    }

    try {
      const parsed = JSON.parse(storedTimerState) as Partial<PersistedTimerState>;
      const restoredStatus: TimerStatus =
        parsed.status === "running" ||
        parsed.status === "paused" ||
        parsed.status === "stopped"
          ? parsed.status
          : "idle";
      const restoredElapsedBeforePauseMs = Math.max(
        0,
        Number(parsed.elapsedBeforePauseMs ?? 0),
      );
      const restoredRunningStartedAtMs =
        typeof parsed.runningStartedAtMs === "number"
          ? parsed.runningStartedAtMs
          : null;
      const restoredElapsedMs =
        restoredStatus === "running" && restoredRunningStartedAtMs !== null
          ? restoredElapsedBeforePauseMs +
            Math.max(0, Date.now() - restoredRunningStartedAtMs)
          : restoredElapsedBeforePauseMs;

      setSelectedTaskId(parsed.selectedTaskId ?? "");
      setSelectedCalendarEventId(parsed.selectedCalendarEventId ?? "");
      setStatus(restoredStatus);
      setStartedAt(parseStoredDate(parsed.startedAt ?? null));
      setEndedAt(parseStoredDate(parsed.endedAt ?? null));
      setRunningStartedAtMs(
        restoredStatus === "running" ? restoredRunningStartedAtMs : null,
      );
      setElapsedBeforePauseMs(restoredElapsedBeforePauseMs);
      setElapsedSeconds(Math.floor(restoredElapsedMs / 1000));
      setMemo(parsed.memo ?? "");
      setInterruptedTimerSnapshot(
        deserializeInterruptedSnapshot(parsed.interruptedTimerSnapshot),
      );
    } catch (error) {
      console.error("Failed to restore timer state", error);
      window.localStorage.removeItem(TIMER_STORAGE_KEY);
    } finally {
      setHasRestoredTimerState(true);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchCalendarEvents()]).then(([taskData, eventData]) => {
      setTasks(taskData);
      setCalendarEvents(eventData);
    });
  }, []);

  useEffect(() => {
    setTimerSettings(readTimerSettings());
  }, []);

  useEffect(() => {
    if (status !== "running" || runningStartedAtMs === null) return;

    const intervalId = window.setInterval(() => {
      const elapsedMs = elapsedBeforePauseMs + (Date.now() - runningStartedAtMs);
      setElapsedSeconds(Math.floor(elapsedMs / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [elapsedBeforePauseMs, runningStartedAtMs, status]);

  useEffect(() => {
    if (!hasRestoredTimerState) return;

    const timerState: PersistedTimerState = {
      selectedTaskId,
      selectedCalendarEventId,
      status,
      startedAt: startedAt?.toISOString() ?? null,
      endedAt: endedAt?.toISOString() ?? null,
      runningStartedAtMs,
      elapsedBeforePauseMs,
      memo,
      interruptedTimerSnapshot: serializeInterruptedSnapshot(interruptedTimerSnapshot),
    };

    window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
  }, [
    elapsedBeforePauseMs,
    endedAt,
    hasRestoredTimerState,
    interruptedTimerSnapshot,
    memo,
    runningStartedAtMs,
    selectedCalendarEventId,
    selectedTaskId,
    startedAt,
    status,
  ]);

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

  const focusCycleSeconds = timerSettings.workMinutes * 60;
  const breakCycleSeconds = timerSettings.breakMinutes * 60;
  const timerProgressPercent = Math.min(100, (elapsedSeconds / focusCycleSeconds) * 100);
  const secondsUntilBreak = Math.max(0, focusCycleSeconds - elapsedSeconds);
  const displayTaskTitle = selectedTask?.title ?? selectedCalendarEvent?.title ?? "作業タスクを選択してください";
  const displayTaskMeta = selectedTask
    ? `${selectedTask.task_type === "urgent" ? "緊急タスク" : "通常タスク"} / 見積 ${selectedTask.estimated_minutes}分 / ${selectedTask.energy_level}`
    : selectedCalendarEvent
      ? `予定 / 計画 ${getPlannedMinutes(selectedCalendarEvent)}分 / ${selectedCalendarEvent.status}`
      : "予定またはタスクを選ぶと、ここに詳細が表示されます。";
  const todaysCompletedTaskCount = tasks.filter((task) => task.status === "completed").length;
  const totalFocusMinutes = Math.floor(elapsedSeconds / 60);
  const productivityScore = Math.min(100, Math.max(0, 60 + todaysCompletedTaskCount * 5 + Math.floor(totalFocusMinutes / 10)));
  const upcomingEvents = selectableCalendarEvents
    .filter((event) => new Date(event.end_time).getTime() >= Date.now())
    .slice(0, 5);

  function formatShortTime(value: string) {
    return new Date(value).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMinuteLabel(minutes: number | null) {
    if (minutes === null) return "-";
    return `${minutes}分`;
  }

  return (
    <section className="timer-page-redesign">
      <div className="timer-page-redesign__header">
        <div>
          <h1>タイマー</h1>
          <p>集中・休憩・緊急割り込みを一画面で扱える、作業用タイマーです。</p>
        </div>
        <div className="timer-header-actions">
          <button type="button" className="timer-ghost-button">◎ 集中モード</button>
          <NavLink className="timer-ghost-button" to="/settings">⚙ タイマー設定</NavLink>
          <a className="timer-danger-button" href="#urgent-interrupt">⚡ 緊急タスク割り込み</a>
        </div>
      </div>

      <div className="timer-tip-card">
        <div className="timer-tip-card__icon" aria-hidden="true">✦</div>
        <div>
          <strong>集中のコツ</strong>
          <p>{timerSettings.workMinutes}分集中 + {timerSettings.breakMinutes}分休憩のサイクルで、生産性を高めましょう。</p>
        </div>
      </div>

      {(saveMessage || errorMessage || urgentMessage || urgentErrorMessage) && (
        <div className="timer-message-stack">
          {saveMessage && <div className="timer-message timer-message--success">{saveMessage}</div>}
          {urgentMessage && <div className="timer-message timer-message--success">{urgentMessage}</div>}
          {errorMessage && <div className="timer-message timer-message--error">{errorMessage}</div>}
          {urgentErrorMessage && <div className="timer-message timer-message--error">{urgentErrorMessage}</div>}
        </div>
      )}

      <div className="timer-layout-grid">
        <div className="timer-left-column">
          <section className="timer-card timer-focus-card">
            <div className="timer-card__title-row">
              <div>
                <p className="timer-section-label">現在のタスク</p>
                <h2>{displayTaskTitle}</h2>
              </div>
              <span className={`timer-status-pill timer-status-pill--${status}`}>
                {status === "running" ? "集中中" : status === "paused" ? "一時停止" : status === "stopped" ? "保存済み" : "待機中"}
              </span>
            </div>

            <div className="timer-linked-selects">
              <label>
                紐づける予定
                <select value={selectedCalendarEventId} onChange={(e) => handleSelectCalendarEvent(e.target.value)} disabled={isTimerActive}>
                  <option value="">予定に紐づけない</option>
                  {selectableCalendarEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} / {event.start_time.slice(0, 16).replace("T", " ")} / {event.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                作業タスク
                <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)} disabled={isTimerActive}>
                  <option value="">タスクを選択しない</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="timer-task-meta-card">
              <span>{selectedTaskIsUrgent ? "⚡" : "□"}</span>
              <div>
                <strong>{selectedTask?.title ?? selectedCalendarEvent?.title ?? "未選択"}</strong>
                <p>{displayTaskMeta}</p>
                {selectedTask?.interruption_reason && <p>理由: {selectedTask.interruption_reason}</p>}
              </div>
            </div>

            <div className="timer-circle-wrap">
              <div className="timer-progress-ring" style={{ background: `conic-gradient(#2563eb ${timerProgressPercent}%, #e8edf5 0)` }}>
                <div className="timer-progress-ring__inner">
                  <span className="timer-dot">● {status === "running" ? "集中中" : status === "paused" ? "休止中" : "待機中"}</span>
                  <strong>{formatElapsed(elapsedSeconds)}</strong>
                  <p>{status === "running" ? `${timerSettings.workMinutes}分集中` : status === "paused" ? "一時停止中" : "開始を押して計測"}</p>
                </div>
              </div>
              <span className="timer-break-pill">休憩まで {formatElapsed(secondsUntilBreak)} / 休憩 {formatElapsed(breakCycleSeconds)}</span>
            </div>

            <div className="timer-main-actions">
              {canStart && <button type="button" className="timer-primary-button" onClick={handleStart}>▶ 開始する</button>}
              {canPause && <button type="button" className="timer-primary-button" onClick={handlePause}>Ⅱ 一時停止</button>}
              {canResume && <button type="button" className="timer-primary-button" onClick={handleResume}>▶ 再開する</button>}
              <button type="button" className="timer-secondary-button" onClick={handleStop} disabled={!canStop || isSaving}>■ 終了して保存</button>
            </div>

            <label className="timer-memo-field">
              実績メモ
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} disabled={isSaving} placeholder="例：API実装、エラー調査など" />
            </label>
          </section>

          <section className="timer-card timer-stats-card">
            <h2>今日の集中記録</h2>
            <div className="timer-stats-grid">
              <div><span>集中時間</span><strong>{totalFocusMinutes}分</strong><small>現在の計測</small></div>
              <div><span>完了タスク</span><strong>{todaysCompletedTaskCount}件</strong><small>全タスク基準</small></div>
              <div><span>集中回数</span><strong>{elapsedSeconds > 0 ? 1 : 0}回</strong><small>この画面</small></div>
              <div><span>生産性スコア</span><strong>{productivityScore}%</strong><small>目安</small></div>
            </div>
            <div className="timer-goal-bar"><span style={{ width: `${Math.min(100, productivityScore)}%` }} /></div>
            <div className="timer-log-meta">
              <span>開始: {formatDateTime(startedAt)}</span>
              <span>停止: {formatDateTime(endedAt)}</span>
              <button type="button" onClick={handleReset} disabled={status === "running" || isSaving}>リセット</button>
            </div>
          </section>
        </div>

        <div className="timer-right-column">
          <section className="timer-card timer-schedule-card">
            <div className="timer-card__title-row">
              <h2>次の予定タスク</h2>
              <span>すべて見る</span>
            </div>
            <div className="timer-schedule-list">
              {upcomingEvents.length === 0 ? (
                <p className="timer-empty-text">この後の予定はありません。</p>
              ) : (
                upcomingEvents.map((event, index) => (
                  <button type="button" key={event.id} className={index === 0 ? "timer-schedule-item timer-schedule-item--next" : "timer-schedule-item"} onClick={() => handleSelectCalendarEvent(String(event.id))} disabled={isTimerActive}>
                    <time>{formatShortTime(event.start_time)}</time>
                    <span><strong>{event.title}</strong><small>予定</small></span>
                    <em>{formatMinuteLabel(getPlannedMinutes(event))}</em>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="timer-card timer-break-card">
            <h2>休憩中におすすめ</h2>
            <p>リフレッシュして集中力を維持しましょう。</p>
            <div className="timer-break-actions">
              <button type="button">🚶<strong>ストレッチ</strong><span>3分</span></button>
              <button type="button">☕<strong>水分補給</strong><span>2分</span></button>
              <button type="button">🎵<strong>深呼吸</strong><span>2分</span></button>
              <button type="button">☀<strong>目を休める</strong><span>2分</span></button>
            </div>
          </section>

          <section id="urgent-interrupt" className="timer-card timer-urgent-card">
            <div className="timer-card__title-row">
              <div>
                <h2>緊急タスク割り込み</h2>
                <p>突然入ったタスクを登録し、現在のタイマーを中断して開始できます。</p>
              </div>
            </div>

            {interruptedTimerSnapshot && status === "stopped" && (
              <div className="timer-interrupted-card">
                <strong>中断中の元タスクがあります。</strong>
                <span>経過時間 {formatElapsed(Math.floor(interruptedTimerSnapshot.elapsedBeforePauseMs / 1000))}</span>
                <button type="button" onClick={handleResumeInterruptedTask} disabled={isSaving || isCreatingUrgentTask}>元タスクを再開</button>
              </div>
            )}

            <form onSubmit={handleCreateAndStartUrgentTask} className="timer-urgent-form">
              <label>
                緊急タスク名
                <input value={urgentTitle} onChange={(e) => setUrgentTitle(e.target.value)} placeholder="例：急ぎの連絡対応" disabled={isCreatingUrgentTask || isSaving} />
              </label>
              <label>
                割り込み理由
                <textarea value={urgentInterruptionReason} onChange={(e) => setUrgentInterruptionReason(e.target.value)} placeholder="例：クライアントから至急確認依頼が来た" disabled={isCreatingUrgentTask || isSaving} />
              </label>
              <div className="timer-urgent-form__grid">
                <label>見積分<input type="number" min="1" value={urgentEstimatedMinutes} onChange={(e) => setUrgentEstimatedMinutes(e.target.value)} disabled={isCreatingUrgentTask || isSaving} /></label>
                <label>緊急度<input type="number" min="1" max="5" value={urgentUrgency} onChange={(e) => setUrgentUrgency(e.target.value)} disabled={isCreatingUrgentTask || isSaving} /></label>
                <label>重要度<input type="number" min="1" max="5" value={urgentImportance} onChange={(e) => setUrgentImportance(e.target.value)} disabled={isCreatingUrgentTask || isSaving} /></label>
                <label>エネルギー<select value={urgentEnergyLevel} onChange={(e) => setUrgentEnergyLevel(e.target.value)} disabled={isCreatingUrgentTask || isSaving}><option value="high">高集中</option><option value="medium">普通</option><option value="low">低め</option></select></label>
              </div>
              <label>
                詳細メモ
                <textarea value={urgentDescription} onChange={(e) => setUrgentDescription(e.target.value)} placeholder="緊急タスクの内容を書く" disabled={isCreatingUrgentTask || isSaving} />
              </label>
              <button type="submit" className="timer-danger-button" disabled={!urgentTitle.trim() || isCreatingUrgentTask || isSaving}>
                {isTimerActive ? "現在タスクを中断して緊急タスク開始" : "緊急タスク追加して開始"}
              </button>
            </form>
          </section>
        </div>
      </div>

      <p className="timer-footer-hint">💡 ヒント：設定画面から、集中時間や休憩時間をカスタマイズできます。</p>
    </section>
  );

}
