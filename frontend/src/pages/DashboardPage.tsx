import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createCalendarEvent,
  fetchCalendarEvents,
  fetchYesterdayTasks,
} from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import {
  fetchAssistantSuggestions,
  moveIncompleteEventToTomorrow,
} from "../api/assistant";
import type { AssistantSuggestion } from "../api/assistant";
import { fetchTodaySummary, fetchUrgentTaskAnalysis } from "../api/dashboard";
import type { TodaySummary, UrgentTaskAnalysis } from "../api/dashboard";
import { fetchEstimationAccuracySummary } from "../api/estimations";
import type { EstimationAccuracySummary } from "../api/estimations";
import { fetchProjects } from "../api/projects";
import type { Project } from "../api/projects";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";


const DISMISSED_ASSISTANT_SUGGESTIONS_KEY = "dismissedAssistantSuggestionIds";

type EventFormState = {
  title: string;
  eventType: string;
  date: string;
  startTime: string;
  endTime: string;
};

const EVENT_TYPE_OPTIONS = [
  "作業",
  "勉強",
  "休憩",
  "打ち合わせ",
  "移動",
  "家事",
  "その他",
];

function toTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

function combineDateAndTime(date: string, time: string) {
  return `${date}T${time}`;
}

function buildEventDescription(eventType: string) {
  return `種類: ${eventType}`;
}

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function applyDateToTime(dateText: string, timeSource: string) {
  const source = new Date(timeSource);
  const hours = String(source.getHours()).padStart(2, "0");
  const minutes = String(source.getMinutes()).padStart(2, "0");

  return `${dateText}T${hours}:${minutes}`;
}

function roundUpToNextFiveMinutes(date: Date) {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const remainder = minutes % 5;

  if (remainder > 0) {
    rounded.setMinutes(minutes + (5 - remainder));
  }

  rounded.setSeconds(0, 0);
  return rounded;
}

function readDismissedSuggestionIds() {
  try {
    const rawValue = window.localStorage.getItem(
      DISMISSED_ASSISTANT_SUGGESTIONS_KEY,
    );
    if (!rawValue) return new Set<string>();

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return new Set<string>();

    return new Set(parsedValue.filter((value) => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveDismissedSuggestionIds(ids: Set<string>) {
  window.localStorage.setItem(
    DISMISSED_ASSISTANT_SUGGESTIONS_KEY,
    JSON.stringify([...ids]),
  );
}

function getNumberMetadata(
  suggestion: AssistantSuggestion,
  key: string,
): number | null {
  const value = suggestion.metadata[key];
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function getStringMetadata(
  suggestion: AssistantSuggestion,
  key: string,
): string | null {
  const value = suggestion.metadata[key];
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function getSuggestedEventMinutes(suggestion: AssistantSuggestion) {
  return Math.max(
    5,
    getNumberMetadata(suggestion, "estimated_minutes") ??
      getNumberMetadata(suggestion, "required_minutes") ??
      getNumberMetadata(suggestion, "recommended_minutes") ??
      30,
  );
}

function getSuggestedEventTitle(suggestion: AssistantSuggestion) {
  const metadataTitle = getStringMetadata(suggestion, "title");
  if (metadataTitle) return metadataTitle;

  return suggestion.title
    .replace(/^高優先度タスク:\s*/, "")
    .replace(/^スキマ時間でできる:\s*/, "")
    .replace(/^未着手予定:\s*/, "")
    .replace(/^遅延予定:\s*/, "")
    .replace(/^未完了予定を明日に移しましょう:\s*/, "")
    .trim();
}

function isSchedulableSuggestion(suggestion: AssistantSuggestion) {
  return ![
    "today_achievement",
    "move_incomplete_event_tomorrow",
  ].includes(suggestion.suggestion_type);
}

function priorityBadgeStyle(priority: string): React.CSSProperties {
  if (priority === "high") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid #fecaca",
    };
  }

  if (priority === "medium") {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid #fde68a",
    };
  }

  return {
    color: "#166534",
    background: "#dcfce7",
    border: "1px solid #bbf7d0",
  };
}

function toDateKey(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatTime(dateText: string) {
  return new Date(dateText).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) return `${restMinutes}分`;
  if (restMinutes === 0) return `${hours}時間`;
  return `${hours}時間${restMinutes}分`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function achievementMessage(rate: number) {
  if (rate >= 100) return "予定分をしっかり達成できています。";
  if (rate >= 70) return "かなり良いペースです。あと少し進められます。";
  if (rate >= 40) return "まだ伸ばせます。次の一手を小さく決めましょう。";
  return "まずは短い作業から始めると立て直しやすいです。";
}

function getEventMinutes(event: CalendarEvent) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function isIncompleteEvent(event: CalendarEvent) {
  return event.status !== "completed" && event.status !== "cancelled";
}

function isInProgressTask(task: Task) {
  return ["in_progress", "doing", "active"].includes(task.status);
}

function getProjectProgressRate(project: Project, estimatedMinutes: number) {
  if (estimatedMinutes <= 0) return 0;
  return Math.min(
    100,
    Math.round((project.actual_minutes / estimatedMinutes) * 100),
  );
}

function getRemainingMinutes(project: Project, estimatedMinutes: number) {
  return Math.max(0, estimatedMinutes - project.actual_minutes);
}

function getEffectiveProjectEstimatedMinutes(
  project: Project,
  plannedMinutes: number,
  taskEstimatedMinutes: number,
) {
  if (project.estimated_minutes > 0) return project.estimated_minutes;
  if (plannedMinutes > 0) return plannedMinutes;
  return taskEstimatedMinutes;
}

function isVisibleProject(project: Project) {
  return !["completed", "cancelled", "archived"].includes(project.status);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "未着手",
    active: "進行中",
    in_progress: "進行中",
    doing: "進行中",
    completed: "完了",
    cancelled: "キャンセル",
    archived: "アーカイブ",
  };

  return labels[status] ?? status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    high: "高優先度",
    medium: "中優先度",
    low: "低優先度",
  };

  return labels[priority] ?? priority;
}

function formatSignedMinutes(minutes: number) {
  if (minutes > 0) return `+${formatMinutes(minutes)}`;
  if (minutes < 0) return `-${formatMinutes(Math.abs(minutes))}`;
  return "差分なし";
}

function estimationJudgementLabel(judgement: string) {
  const labels: Record<string, string> = {
    underestimated: "過小見積",
    accurate: "適正",
    overestimated: "過大見積",
    unknown: "判定不可",
  };

  return labels[judgement] ?? judgement;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [estimationAccuracy, setEstimationAccuracy] =
    useState<EstimationAccuracySummary | null>(null);
  const [urgentTaskAnalysis, setUrgentTaskAnalysis] =
    useState<UrgentTaskAnalysis | null>(null);
  const [assistantSuggestions, setAssistantSuggestions] = useState<
    AssistantSuggestion[]
  >([]);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<
    Set<string>
  >(() => readDismissedSuggestionIds());
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantActionId, setAssistantActionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>(() => {
    const start = roundUpToNextFiveMinutes(new Date());
    const end = addMinutes(start, 30);

    return {
      title: "",
      eventType: "作業",
      date: toDateKey(start),
      startTime: toTimeInputValue(start),
      endTime: toTimeInputValue(end),
    };
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [
        summaryData,
        eventData,
        projectData,
        taskData,
        accuracyData,
        urgentAnalysisData,
        assistantSuggestionData,
      ] = await Promise.all([
        fetchTodaySummary(),
        fetchCalendarEvents(),
        fetchProjects(),
        fetchTasks(),
        fetchEstimationAccuracySummary(),
        fetchUrgentTaskAnalysis(),
        fetchAssistantSuggestions(),
      ]);

      setSummary(summaryData);
      setCalendarEvents(eventData);
      setProjects(projectData);
      setTasks(taskData);
      setEstimationAccuracy(accuracyData);
      setUrgentTaskAnalysis(urgentAnalysisData);
      setAssistantSuggestions(assistantSuggestionData.suggestions);
    } catch (error) {
      console.error(error);
      setErrorMessage("ダッシュボードの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDismissSuggestion(suggestionId: string) {
    const nextDismissedIds = new Set(dismissedSuggestionIds);
    nextDismissedIds.add(suggestionId);

    setDismissedSuggestionIds(nextDismissedIds);
    saveDismissedSuggestionIds(nextDismissedIds);
  }

  async function handleAddSuggestionToCalendar(suggestion: AssistantSuggestion) {
    setAssistantActionId(suggestion.id);
    setAssistantMessage("");

    try {
      if (suggestion.suggestion_type === "move_incomplete_event_tomorrow") {
        const eventId = getNumberMetadata(suggestion, "event_id");
        if (eventId == null) {
          throw new Error("event_id が見つかりません。 ");
        }

        await moveIncompleteEventToTomorrow(eventId);
        await handleDismissSuggestion(suggestion.id);
        setAssistantMessage("未完了予定を明日に移しました。");
        await loadData();
        return;
      }

      const minutes = getSuggestedEventMinutes(suggestion);
      const start = roundUpToNextFiveMinutes(new Date());
      const end = new Date(start.getTime() + minutes * 60000);
      const taskId = getNumberMetadata(suggestion, "task_id");

      await createCalendarEvent({
        task_id: taskId ?? null,
        title: getSuggestedEventTitle(suggestion),
        description: `秘書提案から追加: ${suggestion.message}`,
        start_time: toDateTimeLocalValue(start),
        end_time: toDateTimeLocalValue(end),
      });

      await handleDismissSuggestion(suggestion.id);
      setAssistantMessage("提案を今日の予定に追加しました。");
      await loadData();
    } catch (error) {
      console.error(error);
      setAssistantMessage("提案の反映に失敗しました。");
    } finally {
      setAssistantActionId(null);
    }
  }


  async function handleAddTaskToCalendar(task: Task) {
    setAssistantActionId(`task-${task.id}`);
    setAssistantMessage("");

    try {
      const minutes = Math.max(10, task.estimated_minutes || 30);
      const start = roundUpToNextFiveMinutes(new Date());
      const end = new Date(start.getTime() + minutes * 60000);

      await createCalendarEvent({
        task_id: task.id,
        title: task.title,
        description: task.description ?? "ダッシュボードから追加",
        start_time: toDateTimeLocalValue(start),
        end_time: toDateTimeLocalValue(end),
      });

      setAssistantMessage(`${task.title} を今日の予定に追加しました。`);
      await loadData();
    } catch (error) {
      console.error(error);
      setAssistantMessage("予定の追加に失敗しました。");
    } finally {
      setAssistantActionId(null);
    }
  }

  function openEventModal(defaults?: Partial<EventFormState>) {
    const baseDate = selectedDate === toDateKey(new Date())
      ? roundUpToNextFiveMinutes(new Date())
      : new Date(`${selectedDate}T09:00`);
    const start = roundUpToNextFiveMinutes(baseDate);
    const end = addMinutes(start, 30);

    setEventForm({
      title: defaults?.title ?? "",
      eventType: defaults?.eventType ?? "作業",
      date: defaults?.date ?? selectedDate,
      startTime: defaults?.startTime ?? toTimeInputValue(start),
      endTime: defaults?.endTime ?? toTimeInputValue(end),
    });
    setAssistantMessage("");
    setIsEventModalOpen(true);
  }

  function closeEventModal() {
    if (assistantActionId === "manual-event") return;
    setIsEventModalOpen(false);
  }

  function handleEventStartTimeChange(startTime: string) {
    setEventForm((current) => {
      const start = new Date(combineDateAndTime(current.date, startTime));
      const end = addMinutes(start, 30);

      return {
        ...current,
        startTime,
        endTime: toTimeInputValue(end),
      };
    });
  }

  async function handleCreateEventFromModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssistantActionId("manual-event");
    setAssistantMessage("");

    try {
      const title = eventForm.title.trim();
      if (!title) {
        setAssistantMessage("予定名を入力してください。");
        return;
      }

      const start = combineDateAndTime(eventForm.date, eventForm.startTime);
      const end = combineDateAndTime(eventForm.date, eventForm.endTime);

      if (new Date(end).getTime() <= new Date(start).getTime()) {
        setAssistantMessage("終了時刻は開始時刻より後にしてください。");
        return;
      }

      await createCalendarEvent({
        task_id: null,
        title,
        description: buildEventDescription(eventForm.eventType),
        start_time: start,
        end_time: end,
      });

      setSelectedDate(eventForm.date);
      setIsEventModalOpen(false);
      setAssistantMessage(`${title} を予定に追加しました。`);
      await loadData();
    } catch (error) {
      console.error(error);
      setAssistantMessage("予定の追加に失敗しました。");
    } finally {
      setAssistantActionId(null);
    }
  }

  async function handleCopyYesterdayEventsToSelectedDate() {
    setAssistantActionId("copy-yesterday");
    setAssistantMessage("");

    try {
      const yesterdayTasks = await fetchYesterdayTasks();
      if (yesterdayTasks.length === 0) {
        setAssistantMessage("コピーできる昨日の予定がありません。");
        return;
      }

      await Promise.all(yesterdayTasks.map((task) => {
        const start = applyDateToTime(selectedDate, task.start_time);
        const end = applyDateToTime(selectedDate, task.end_time);

        return createCalendarEvent({
          task_id: task.task_id ?? null,
          title: task.title,
          description: task.description ?? "昨日の予定からコピー",
          start_time: start,
          end_time: end,
        });
      }));

      setAssistantMessage(`昨日の予定を${yesterdayTasks.length}件コピーしました。`);
      await loadData();
    } catch (error) {
      console.error(error);
      setAssistantMessage("昨日の予定コピーに失敗しました。");
    } finally {
      setAssistantActionId(null);
    }
  }

  function handleGenerateRecurringEventsFromDashboard() {
    navigate("/calendar#recurrence");
  }

  function moveDashboardDate(days: number) {
    const date = new Date(`${selectedDate}T00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(toDateKey(date));
  }

  useEffect(() => {
    loadData();
  }, []);

  const todayKey = toDateKey(new Date());
  const isTodaySelected = selectedDate === todayKey;

  const todayEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => event.status !== "cancelled")
      .filter((event) => event.start_time.slice(0, 10) === selectedDate)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [calendarEvents, selectedDate]);

  const incompleteEvents = useMemo(() => {
    return todayEvents.filter(isIncompleteEvent);
  }, [todayEvents]);

  const inProgressTasks = useMemo(() => {
    return tasks
      .filter(isInProgressTask)
      .sort((a, b) => b.actual_minutes - a.actual_minutes);
  }, [tasks]);

  const plannedMinutesByProjectId = useMemo(() => {
    const taskProjectIds = tasks.reduce<Record<number, number>>((acc, task) => {
      acc[task.id] = task.project_id;
      return acc;
    }, {});

    const projectIdsByTaskTitle = tasks.reduce<Record<string, Set<number>>>(
      (acc, task) => {
        const key = task.title.trim();
        if (!key) return acc;

        acc[key] = acc[key] ?? new Set<number>();
        acc[key].add(task.project_id);
        return acc;
      },
      {},
    );

    return todayEvents.reduce<Record<number, number>>((acc, event) => {
      let projectId: number | undefined;

      if (event.task_id != null) {
        projectId = taskProjectIds[event.task_id];
      }

      if (projectId == null) {
        const matchedProjectIds = projectIdsByTaskTitle[event.title.trim()];
        if (matchedProjectIds?.size === 1) {
          projectId = [...matchedProjectIds][0];
        }
      }

      if (projectId == null) return acc;

      acc[projectId] = (acc[projectId] ?? 0) + getEventMinutes(event);
      return acc;
    }, {});
  }, [tasks, todayEvents]);

  const taskEstimatedMinutesByProjectId = useMemo(() => {
    return tasks.reduce<Record<number, number>>((acc, task) => {
      acc[task.project_id] =
        (acc[task.project_id] ?? 0) + Math.max(0, task.estimated_minutes);
      return acc;
    }, {});
  }, [tasks]);

  const progressProjects = useMemo(() => {
    return projects.filter(isVisibleProject).sort((a, b) => {
      const aEstimatedMinutes = getEffectiveProjectEstimatedMinutes(
        a,
        plannedMinutesByProjectId[a.id] ?? 0,
        taskEstimatedMinutesByProjectId[a.id] ?? 0,
      );
      const bEstimatedMinutes = getEffectiveProjectEstimatedMinutes(
        b,
        plannedMinutesByProjectId[b.id] ?? 0,
        taskEstimatedMinutesByProjectId[b.id] ?? 0,
      );

      return (
        getProjectProgressRate(b, bEstimatedMinutes) -
        getProjectProgressRate(a, aEstimatedMinutes)
      );
    });
  }, [plannedMinutesByProjectId, projects, taskEstimatedMinutesByProjectId]);

  const visibleAssistantSuggestions = useMemo(() => {
    return assistantSuggestions.filter(
      (suggestion) => !dismissedSuggestionIds.has(suggestion.id),
    );
  }, [assistantSuggestions, dismissedSuggestionIds]);

  const achievementRate = clampPercent(summary?.achievement_rate ?? 0);
  const urgentCollapseRate = clampPercent(urgentTaskAnalysis?.plan_collapse_rate ?? 0);
  const topSuggestions = visibleAssistantSuggestions.slice(0, 2);
  const gapTaskCandidates = tasks
    .filter((task) => !["completed", "cancelled", "archived"].includes(task.status))
    .sort((a, b) => a.estimated_minutes - b.estimated_minutes)
    .slice(0, 3);

  const selectedPlannedMinutes = todayEvents.reduce(
    (total, event) => total + getEventMinutes(event),
    0,
  );
  const displayPlannedMinutes = isTodaySelected
    ? summary?.planned_minutes ?? selectedPlannedMinutes
    : selectedPlannedMinutes;
  const displayActualMinutes = isTodaySelected ? summary?.actual_minutes ?? 0 : 0;
  const displayAchievementRate = isTodaySelected
    ? achievementRate
    : clampPercent(displayPlannedMinutes > 0 ? (displayActualMinutes / displayPlannedMinutes) * 100 : 0);
  const nextEvent = todayEvents.find((event) => new Date(event.start_time).getTime() > Date.now());
  const gapMinutes = isTodaySelected && nextEvent
    ? Math.max(0, Math.floor((new Date(nextEvent.start_time).getTime() - Date.now()) / 60000))
    : null;
  const distributionProjects = progressProjects
    .map((project) => ({ project, minutes: Math.max(0, project.actual_minutes) }))
    .filter((item) => item.minutes > 0)
    .slice(0, 4);
  const distributionTotalMinutes = distributionProjects.reduce((total, item) => total + item.minutes, 0);

  return (
    <section className="dashboard-page dashboard-page--secretary">
      <div className="secretary-topbar">
        <div className="secretary-date-nav" aria-label="日付ナビゲーション">
          <button type="button" onClick={() => moveDashboardDate(-1)}>‹</button>
          <button type="button" onClick={() => moveDashboardDate(1)}>›</button>
          <strong>{new Date(`${selectedDate}T00:00`).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</strong>
        </div>
        <div className="secretary-view-actions">
          <button type="button" onClick={() => { setSelectedDate(todayKey); void loadData(); }}>今日</button>
          <button type="button" onClick={() => navigate("/calendar/week")}>週</button>
          <button type="button" className="is-active" onClick={() => navigate(`/calendar?date=${selectedDate}`)}>日</button>
          <button type="button" className="secretary-add-button" onClick={() => openEventModal()}>＋ 予定を追加</button>
        </div>
      </div>

      {isLoading && <p className="dashboard-state-message">読み込み中...</p>}
      {errorMessage && <p className="dashboard-error-message">{errorMessage}</p>}

      {isEventModalOpen && (
        <div className="secretary-modal-backdrop" role="presentation" onMouseDown={closeEventModal}>
          <form
            className="secretary-event-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleCreateEventFromModal}
          >
            <div className="secretary-event-modal__header">
              <div>
                <span>予定を追加</span>
                <h2>その場で予定を作成</h2>
              </div>
              <button type="button" aria-label="閉じる" onClick={closeEventModal}>×</button>
            </div>

            <label>
              <span>日付</span>
              <input
                type="date"
                value={eventForm.date}
                onChange={(event) => setEventForm((current) => ({ ...current, date: event.target.value }))}
                required
              />
            </label>

            <div className="secretary-event-modal__time-grid">
              <label>
                <span>開始</span>
                <input
                  type="time"
                  value={eventForm.startTime}
                  onChange={(event) => handleEventStartTimeChange(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>終了</span>
                <input
                  type="time"
                  value={eventForm.endTime}
                  onChange={(event) => setEventForm((current) => ({ ...current, endTime: event.target.value }))}
                  required
                />
              </label>
            </div>

            <label>
              <span>種類</span>
              <select
                value={eventForm.eventType}
                onChange={(event) => setEventForm((current) => ({ ...current, eventType: event.target.value }))}
              >
                {EVENT_TYPE_OPTIONS.map((eventType) => (
                  <option key={eventType} value={eventType}>{eventType}</option>
                ))}
              </select>
            </label>

            <label>
              <span>予定名</span>
              <input
                type="text"
                value={eventForm.title}
                onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="例：会計士 勉強"
                autoFocus
                required
              />
            </label>

            <div className="secretary-event-modal__actions">
              <button type="button" onClick={closeEventModal}>キャンセル</button>
              <button type="submit" disabled={assistantActionId === "manual-event"}>追加する</button>
            </div>
          </form>
        </div>
      )}

      {!isLoading && !errorMessage && (
        <>
          <div className="secretary-board">
            <DashboardTimeline events={todayEvents} onAddEvent={() => openEventModal()} onAddUrgentTask={() => navigate("/timer#urgent-interrupt")} />

            <div className="secretary-center-column">
              <section className="secretary-card secretary-summary-card">
                <div className="secretary-card__title"><span>◷</span><h2>今日のサマリー</h2></div>
                <div className="secretary-kpis">
                  <div><span>計画時間</span><strong>{formatMinutes(displayPlannedMinutes)}</strong></div>
                  <div><span>実績時間</span><strong>{formatMinutes(displayActualMinutes)}</strong></div>
                  <div><span>達成率</span><strong>{displayAchievementRate}%</strong><small>{incompleteEvents.length}件残り</small></div>
                </div>
                <div className="secretary-goal-row"><span>{isTodaySelected ? "今日" : "選択日"}の計画合計：{formatMinutes(displayPlannedMinutes)}</span><strong>{displayAchievementRate}%</strong></div>
                <ProgressBar value={displayAchievementRate} label={`達成率 ${displayAchievementRate}%`} />
                <button type="button" className="secretary-wide-button" onClick={() => navigate("/reflections")}>振り返りを記録する</button>
              </section>

              <section className="secretary-card">
                <div className="secretary-card__title"><span>□</span><h2>プロジェクト進捗</h2></div>
                <div className="secretary-project-list">
                  {progressProjects.slice(0, 4).map((project) => {
                    const estimatedMinutes = getEffectiveProjectEstimatedMinutes(
                      project,
                      plannedMinutesByProjectId[project.id] ?? 0,
                      taskEstimatedMinutesByProjectId[project.id] ?? 0,
                    );
                    const progressRate = getProjectProgressRate(project, estimatedMinutes);
                    const remainingMinutes = getRemainingMinutes(project, estimatedMinutes);

                    return (
                      <div key={project.id} className="secretary-project-row">
                        <strong>{project.title}</strong>
                        <span>{progressRate}%</span>
                        <ProgressBar value={progressRate} label={`${project.title} ${progressRate}%`} />
                        <small>{formatMinutes(project.actual_minutes)} / {formatMinutes(estimatedMinutes)}</small>
                        <small>{formatMinutes(remainingMinutes)}</small>
                      </div>
                    );
                  })}
                </div>
                <Link className="secretary-link" to="/projects">すべてのプロジェクトを見る</Link>
              </section>
            </div>

            <div className="secretary-right-column">
              <section className="secretary-card secretary-assistant-card">
                <div className="secretary-card__title"><span>🤖</span><h2>AI秘書からの提案</h2></div>
                {assistantMessage && <p className="dashboard-info-message">{assistantMessage}</p>}
                {topSuggestions.length === 0 ? (
                  <p className="dashboard-empty-message">今すぐ表示する提案はありません。</p>
                ) : topSuggestions.map((suggestion) => (
                  <div key={suggestion.id} className="secretary-suggestion">
                    <strong>{suggestion.title}</strong>
                    <p>{suggestion.message}</p>
                    <div className="secretary-suggestion__actions">
                      {suggestion.suggestion_type === "move_incomplete_event_tomorrow" ? (
                        <button type="button" onClick={() => handleAddSuggestionToCalendar(suggestion)} disabled={assistantActionId === suggestion.id}>明日に移す</button>
                      ) : isSchedulableSuggestion(suggestion) ? (
                        <button type="button" onClick={() => handleAddSuggestionToCalendar(suggestion)} disabled={assistantActionId === suggestion.id}>予定に追加</button>
                      ) : null}
                      <button type="button" onClick={() => handleDismissSuggestion(suggestion.id)} disabled={assistantActionId === suggestion.id}>このままにする</button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="secretary-card">
                <div className="secretary-card__title"><span>□</span><h2>スキマ時間の提案</h2></div>
                <p className="secretary-muted">{gapMinutes == null ? "次の予定までの空き時間は現在ありません" : <>次の予定まで <strong>{formatMinutes(gapMinutes)}</strong> の空き時間があります</>}</p>
                <div className="secretary-gap-list">
                  {gapTaskCandidates.map((task) => (
                    <div key={task.id} className="secretary-gap-row">
                      <span>✓</span><strong>{task.title}</strong><small>{formatMinutes(Math.max(10, task.estimated_minutes || 10))}</small><em>{task.energy_level || "低集中"}</em><button type="button" onClick={() => handleAddTaskToCalendar(task)} disabled={assistantActionId === `task-${task.id}`}>追加</button>
                    </div>
                  ))}
                </div>
                <Link className="secretary-link" to="/gap-tasks">すべてのスキマタスクを見る</Link>
              </section>
            </div>
          </div>

          <div className="secretary-lower-grid">
            <section className="secretary-card">
              <div className="secretary-card__title"><span>◌</span><h2>今週の時間配分</h2></div>
              <div className="secretary-donut-row">
                <div className="secretary-donut"><span>合計<br />{formatMinutes(distributionTotalMinutes)}</span></div>
                <ul>
                  {distributionProjects.length === 0 ? (
                    <li>実績データがまだありません</li>
                  ) : distributionProjects.map(({ project, minutes }, index) => (
                    <li key={project.id}><i data-index={index} />{project.title}<b>{formatMinutes(minutes)}</b></li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="secretary-card secretary-estimation-card">
              <div className="secretary-card__title"><span>♙</span><h2>工数見積りの精度</h2></div>
              <strong className="secretary-big-number">{estimationAccuracy?.underestimation_rate ?? 0}%</strong>
              <p className="secretary-muted">開発系タスクを中心に見積りとの差分を確認できます。進行中 {inProgressTasks.length}件 / 計画崩れ {urgentCollapseRate}%</p>
              <Link className="secretary-link" to="/work-logs">詳細な分析を見る</Link>
            </section>
          </div>

          <div className="secretary-bottom-strip">
            <section className="secretary-card secretary-quick-card">
              <strong>よく使うタスク</strong>
              {tasks.slice(0, 5).map((task) => (
                <button key={task.id} type="button" onClick={() => handleAddTaskToCalendar(task)} disabled={assistantActionId === `task-${task.id}`}>
                  {task.title} {formatMinutes(task.estimated_minutes || 30)}
                </button>
              ))}
              <button type="button" onClick={() => navigate("/tasks")}>＋ カスタム</button>
            </section>
            <section className="secretary-card"><strong>繰り返し予定</strong><p className="secretary-muted">朝のルーティン・勉強時間などをカレンダーで管理できます</p><button type="button" className="secretary-wide-button" onClick={handleGenerateRecurringEventsFromDashboard}>管理する</button></section>
            <section className="secretary-card"><strong>昨日の予定をコピー</strong><button type="button" className="secretary-wide-button" onClick={handleCopyYesterdayEventsToSelectedDate} disabled={assistantActionId === "copy-yesterday"}>コピーする</button></section>
          </div>
        </>
      )}
    </section>
  );
}

function DashboardTimeline({ events, onAddEvent, onAddUrgentTask }: { events: CalendarEvent[]; onAddEvent: () => void; onAddUrgentTask: () => void }) {
  const startHour = 7;
  const endHour = 23;
  const hourHeight = 64;
  const now = new Date();
  const nowTop = ((now.getHours() - startHour) * 60 + now.getMinutes()) / 60 * hourHeight;

  return (
    <section className="secretary-timeline-card">
      <div className="secretary-timeline-card__header">
        <div>
          <span>MAIN CALENDAR</span>
          <h2>今日の予定</h2>
        </div>
        <div className="secretary-timeline-card__actions">
          <button type="button" className="secretary-add-slot" onClick={onAddEvent}>＋ 予定を追加</button>
          <button type="button" className="secretary-urgent-slot" onClick={onAddUrgentTask}>⚡ 緊急タスク割り込み</button>
        </div>
      </div>
      <div className="secretary-timeline">
        {Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index).map((hour) => (
          <div key={hour} className="secretary-time-row"><span>{hour}:00</span></div>
        ))}
        <div className="secretary-now-line" style={{ top: `${Math.max(0, nowTop)}px` }}><span>{now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span></div>
        {events.map((event, index) => {
          const start = new Date(event.start_time);
          const end = new Date(event.end_time);
          const top = ((start.getHours() - startHour) * 60 + start.getMinutes()) / 60 * hourHeight;
          const height = Math.max(44, (Math.max(15, (end.getTime() - start.getTime()) / 60000) / 60) * hourHeight);
          const tone = ["blue", "green", "orange", "purple", "yellow", "gray", "rose"][index % 7];

          return (
            <article key={event.id} className={`secretary-timeline-event secretary-timeline-event--${tone}`} style={{ top: `${top}px`, height: `${height}px` }}>
              <strong>{event.title}</strong>
              <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
              {event.description && <small>{event.description}</small>}
            </article>
          );
        })}
        <button type="button" className="secretary-add-slot" onClick={onAddEvent}>＋ 予定を追加</button>
      </div>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  tone = "blue",
  value,
}: {
  icon: string;
  label: string;
  tone?: "blue" | "green" | "amber" | "purple" | "rose" | "orange";
  value: string;
}) {
  return (
    <div className={`dashboard-summary-card dashboard-summary-card--${tone}`}>
      <span className="dashboard-summary-card__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="dashboard-card-label">{label}</p>
        <strong className="dashboard-summary-card__value">{value}</strong>
      </div>
    </div>
  );
}

function DashboardPanel({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel__header">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ProgressBar({
  label,
  size = "normal",
  value,
}: {
  label: string;
  size?: "normal" | "large";
  value: number;
}) {
  const percent = clampPercent(value);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className={`dashboard-progress-bar dashboard-progress-bar--${size}`}
      role="progressbar"
    >
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

function MetricProgress({ label, value }: { label: string; value: number }) {
  const percent = clampPercent(value);

  return (
    <div className="dashboard-metric-progress">
      <div className="dashboard-metric-progress__header">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <ProgressBar value={percent} label={`${label} ${percent}%`} />
    </div>
  );
}

void priorityBadgeStyle;
void achievementMessage;
void statusLabel;
void priorityLabel;
void formatSignedMinutes;
void estimationJudgementLabel;
void SummaryCard;
void DashboardPanel;
void MetricProgress;
