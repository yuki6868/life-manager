import { useEffect, useMemo, useState } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  fetchFrequentTasks,
  fetchRecentTasks,
  fetchYesterdayTasks,
  generateRecurringEvents,
  updateCalendarEvent,
} from "../api/calendarEvents";
import type {
  CalendarEvent,
  FrequentTask,
  ReusableCalendarTask,
} from "../api/calendarEvents";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";
import {
  createRecurrenceRule,
  deleteRecurrenceRule,
  fetchRecurrenceRules,
} from "../api/recurrenceRules";
import { createWorkLog, fetchWorkLogs } from "../api/workLogs";
import type { WorkLog } from "../api/workLogs";
import type {
  RecurrenceFrequency,
  RecurrenceRule,
} from "../api/recurrenceRules";

const START_HOUR = 5;
const END_HOUR = 24;
const HOUR_HEIGHT = 96;

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

function formatFrequency(rule: RecurrenceRule) {
  if (rule.frequency === "daily") return "毎日";
  if (rule.frequency === "weekday") return "平日";
  return `毎週${WEEKDAYS[rule.weekday ?? 0]}曜日`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getMinutesFromStart(dateText: string) {
  const date = new Date(dateText);
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
}

function getDurationMinutes(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function isSameDate(dateText: string, selectedDate: string) {
  return dateText.slice(0, 10) === selectedDate;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes}分`;
  }

  if (restMinutes === 0) {
    return `${hours}時間`;
  }

  return `${hours}時間${restMinutes}分`;
}

function getComparisonLabel(actualMinutes: number, plannedMinutes: number) {
  const difference = actualMinutes - plannedMinutes;

  if (difference === 0) {
    return "予定通り";
  }

  if (difference > 0) {
    return `予定より${formatMinutes(difference)}超過`;
  }

  return `予定より${formatMinutes(Math.abs(difference))}短縮`;
}


function applyDateToTime(dateText: string, timeSource: string) {
  const source = new Date(timeSource);
  const hours = String(source.getHours()).padStart(2, "0");
  const minutes = String(source.getMinutes()).padStart(2, "0");

  return `${dateText}T${hours}:${minutes}`;
}

function getTimeLabel(start: string, end: string) {
  return `${start.slice(11, 16)} - ${end.slice(11, 16)}`;
}

function getWorkLogTitle(
  workLog: WorkLog,
  events: CalendarEvent[],
  tasks: Task[]
) {
  const linkedEvent = events.find((event) => event.id === workLog.calendar_event_id);
  if (linkedEvent) {
    return linkedEvent.title;
  }

  const linkedTask = tasks.find((task) => task.id === workLog.task_id);
  if (linkedTask) {
    return linkedTask.title;
  }

  return workLog.memo || "実績";
}


export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [frequentTasks, setFrequentTasks] = useState<FrequentTask[]>([]);
  const [yesterdayTasks, setYesterdayTasks] = useState<ReusableCalendarTask[]>([]);
  const [recentTasks, setRecentTasks] = useState<ReusableCalendarTask[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(now);
  });
  const [endTime, setEndTime] = useState(() => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    return toDateTimeLocalValue(now);
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [generateMessage, setGenerateMessage] = useState("");
  const [recurrenceRules, setRecurrenceRules] = useState<RecurrenceRule[]>([]);
  const [recurrenceTitle, setRecurrenceTitle] = useState("");
  const [recurrenceDescription, setRecurrenceDescription] = useState("");
  const [recurrenceTaskId, setRecurrenceTaskId] = useState("");
  const [recurrenceFrequency, setRecurrenceFrequency] =
    useState<RecurrenceFrequency>("daily");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState("0");
  const [recurrenceStartTime, setRecurrenceStartTime] = useState("09:00");
  const [recurrenceDurationMinutes, setRecurrenceDurationMinutes] = useState("60");
  const [actualTaskId, setActualTaskId] = useState("");
  const [actualCalendarEventId, setActualCalendarEventId] = useState("");
  const [actualStartedAt, setActualStartedAt] = useState(() => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(now);
  });
  const [actualEndedAt, setActualEndedAt] = useState(() => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    return toDateTimeLocalValue(now);
  });
  const [actualMemo, setActualMemo] = useState("");


  async function loadData() {
    const [
      eventData,
      taskData,
      frequentTaskData,
      yesterdayTaskData,
      recentTaskData,
      recurrenceRuleData,
      workLogData,
    ] = await Promise.all([
      fetchCalendarEvents(),
      fetchTasks(),
      fetchFrequentTasks(),
      fetchYesterdayTasks(),
      fetchRecentTasks(),
      fetchRecurrenceRules(),
      fetchWorkLogs(),
    ]);

    setEvents(eventData);
    setTasks(taskData);
    setFrequentTasks(frequentTaskData);
    setYesterdayTasks(yesterdayTaskData);
    setRecentTasks(recentTaskData);
    setRecurrenceRules(recurrenceRuleData);
    setWorkLogs(workLogData);
  }

  useEffect(() => {
    loadData();
  }, []);

  const dayEvents = useMemo(() => {
    return events
      .filter((event) => isSameDate(event.start_time, selectedDate))
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [events, selectedDate]);

  const dayWorkLogs = useMemo(() => {
    return workLogs
      .filter((workLog) => isSameDate(workLog.started_at, selectedDate))
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      );
  }, [workLogs, selectedDate]);

  const actualMinutesByEventId = useMemo(() => {
    return workLogs.reduce<Record<number, number>>((acc, workLog) => {
      if (workLog.calendar_event_id == null) {
        return acc;
      }

      acc[workLog.calendar_event_id] =
        (acc[workLog.calendar_event_id] ?? 0) + workLog.duration_minutes;

      return acc;
    }, {});
  }, [workLogs]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setSelectedTaskId("");

    const start = new Date(`${selectedDate}T09:00`);
    const end = new Date(`${selectedDate}T10:00`);

    setStartTime(toDateTimeLocalValue(start));
    setEndTime(toDateTimeLocalValue(end));
    setEditingEvent(null);
  }

  function handleEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setStartTime(event.start_time.slice(0, 16));
    setEndTime(event.end_time.slice(0, 16));
    setSelectedTaskId(event.task_id ? String(event.task_id) : "");
  }

  async function handleDelete(id: number) {
    await deleteCalendarEvent(id);
    await loadData();
  }

  function applyTaskToForm(task: Pick<Task, "id" | "title" | "description" | "estimated_minutes">) {
    setSelectedTaskId(String(task.id));
    setTitle(task.title);
    setDescription(task.description ?? "");

    const start = new Date(startTime);
    const end = new Date(start.getTime() + task.estimated_minutes * 60000);

    setEndTime(toDateTimeLocalValue(end));
  }

  function handleSelectTask(taskId: string) {
    setSelectedTaskId(taskId);

    const task = tasks.find((item) => item.id === Number(taskId));
    if (!task) return;

    applyTaskToForm(task);
  }

  async function handleAddFrequentTask(task: FrequentTask) {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + task.estimated_minutes * 60000);

    await createCalendarEvent({
      task_id: task.task_id ?? null,
      title: task.title,
      description: task.description ?? "",
      start_time: startTime,
      end_time: toDateTimeLocalValue(end),
    });

    resetForm();
    await loadData();
  }


  async function handleCopyReusableTask(task: ReusableCalendarTask) {
    const copiedStartTime = applyDateToTime(selectedDate, task.start_time);
    const copiedEndTime = applyDateToTime(selectedDate, task.end_time);

    await createCalendarEvent({
      task_id: task.task_id ?? null,
      title: task.title,
      description: task.description ?? "",
      start_time: copiedStartTime,
      end_time: copiedEndTime,
    });

    await loadData();
  }


  async function handleGenerateRecurringEvents() {
    const result = await generateRecurringEvents(30);

    setGenerateMessage(
      `繰り返し予定を${result.generated_count}件作成しました。重複${result.skipped_count}件はスキップしました。`
    );

    await loadData();
  }


  async function handleCreateRecurrenceRule(e: React.FormEvent) {
    e.preventDefault();

    if (!recurrenceTitle.trim()) return;

    await createRecurrenceRule({
      task_id: recurrenceTaskId ? Number(recurrenceTaskId) : null,
      title: recurrenceTitle,
      description: recurrenceDescription || null,
      frequency: recurrenceFrequency,
      weekday:
        recurrenceFrequency === "weekly" ? Number(recurrenceWeekday) : null,
      start_time: recurrenceStartTime,
      duration_minutes: Number(recurrenceDurationMinutes),
      is_active: true,
    });

    setRecurrenceTitle("");
    setRecurrenceDescription("");
    setRecurrenceTaskId("");
    setRecurrenceFrequency("daily");
    setRecurrenceWeekday("0");
    setRecurrenceStartTime("09:00");
    setRecurrenceDurationMinutes("60");
    setGenerateMessage("");

    await loadData();
  }

  async function handleDeleteRecurrenceRule(id: number) {
    await deleteRecurrenceRule(id);
    setGenerateMessage("");
    await loadData();
  }

  function handleSelectRecurrenceTask(taskId: string) {
    setRecurrenceTaskId(taskId);

    const task = tasks.find((item) => item.id === Number(taskId));
    if (!task) return;

    setRecurrenceTitle(task.title);
    setRecurrenceDescription(task.description ?? "");
    setRecurrenceDurationMinutes(String(task.estimated_minutes));
  }

  function resetActualForm() {
    setActualTaskId("");
    setActualCalendarEventId("");

    const start = new Date(`${selectedDate}T09:00`);
    const end = new Date(`${selectedDate}T10:00`);

    setActualStartedAt(toDateTimeLocalValue(start));
    setActualEndedAt(toDateTimeLocalValue(end));
    setActualMemo("");
  }

  function handleSelectActualEvent(eventId: string) {
    setActualCalendarEventId(eventId);

    const event = dayEvents.find((item) => item.id === Number(eventId));
    if (!event) return;

    setActualTaskId(event.task_id ? String(event.task_id) : "");
    setActualStartedAt(event.start_time.slice(0, 16));
    setActualEndedAt(event.end_time.slice(0, 16));
    setActualMemo(event.title);
  }

  async function handleCreateActualLog(e: React.FormEvent) {
    e.preventDefault();

    if (!actualStartedAt || !actualEndedAt) return;

    await createWorkLog({
      task_id: actualTaskId ? Number(actualTaskId) : null,
      calendar_event_id: actualCalendarEventId
        ? Number(actualCalendarEventId)
        : null,
      started_at: actualStartedAt,
      ended_at: actualEndedAt,
      memo: actualMemo || null,
    });

    resetActualForm();
    await loadData();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;

    const input = {
      task_id: selectedTaskId ? Number(selectedTaskId) : null,
      title,
      description,
      start_time: startTime,
      end_time: endTime,
    };

    if (editingEvent) {
      await updateCalendarEvent(editingEvent.id, {
        ...input,
        status: editingEvent.status,
      });
    } else {
      await createCalendarEvent(input);
    }

    resetForm();
    await loadData();
  }

  const hours = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => START_HOUR + i
  );

  return (
    <div style={{ padding: "32px" }}>
      <h1>カレンダー</h1>

      <div style={{ marginBottom: "24px" }}>
        <label>表示日 </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ padding: "8px" }}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: "12px",
          maxWidth: "520px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>{editingEvent ? "予定編集" : "予定追加"}</h2>

        <label>
          タスクから予定化
          <select
            value={selectedTaskId}
            onChange={(e) => handleSelectTask(e.target.value)}
            style={{ display: "block", padding: "8px", width: "100%" }}
          >
            <option value="">タスクを選択しない</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}（{task.estimated_minutes}分）
              </option>
            ))}
          </select>
        </label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：React実装"
          style={{ padding: "8px" }}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="メモ"
          style={{ padding: "8px", height: "72px" }}
        />

        <label>
          開始
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => {
              const nextStartTime = e.target.value;
              setStartTime(nextStartTime);

              const task = tasks.find(
                (item) => item.id === Number(selectedTaskId)
              );

              if (task) {
                const start = new Date(nextStartTime);
                const end = new Date(
                  start.getTime() + task.estimated_minutes * 60000
                );
                setEndTime(toDateTimeLocalValue(end));
              }
            }}
            style={{ display: "block", padding: "8px", width: "100%" }}
          />
        </label>

        <label>
          終了
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ display: "block", padding: "8px", width: "100%" }}
          />
        </label>

        <button type="submit">
          {editingEvent ? "予定を更新" : "予定を追加"}
        </button>

        {editingEvent && (
          <button type="button" onClick={resetForm}>
            キャンセル
          </button>
        )}
      </form>


      <section
        style={{
          maxWidth: "760px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>繰り返し予定</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          毎日・平日・毎週のルールを作成して、今日以降30日分の予定を自動生成できます。
        </p>

        <form
          onSubmit={handleCreateRecurrenceRule}
          style={{ display: "grid", gap: "12px", marginBottom: "20px" }}
        >
          <label>
            タスクから作成
            <select
              value={recurrenceTaskId}
              onChange={(e) => handleSelectRecurrenceTask(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            >
              <option value="">タスクを選択しない</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}（{task.estimated_minutes}分）
                </option>
              ))}
            </select>
          </label>

          <input
            value={recurrenceTitle}
            onChange={(e) => setRecurrenceTitle(e.target.value)}
            placeholder="例：毎朝のメール確認"
            style={{ padding: "8px" }}
          />

          <textarea
            value={recurrenceDescription}
            onChange={(e) => setRecurrenceDescription(e.target.value)}
            placeholder="メモ"
            style={{ padding: "8px", height: "64px" }}
          />

          <label>
            繰り返し
            <select
              value={recurrenceFrequency}
              onChange={(e) =>
                setRecurrenceFrequency(e.target.value as RecurrenceFrequency)
              }
              style={{ display: "block", padding: "8px", width: "100%" }}
            >
              <option value="daily">毎日</option>
              <option value="weekday">平日</option>
              <option value="weekly">毎週・曜日指定</option>
            </select>
          </label>

          {recurrenceFrequency === "weekly" && (
            <label>
              曜日
              <select
                value={recurrenceWeekday}
                onChange={(e) => setRecurrenceWeekday(e.target.value)}
                style={{ display: "block", padding: "8px", width: "100%" }}
              >
                {WEEKDAYS.map((weekday, index) => (
                  <option key={weekday} value={index}>
                    {weekday}曜日
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            開始時刻
            <input
              type="time"
              value={recurrenceStartTime}
              onChange={(e) => setRecurrenceStartTime(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            />
          </label>

          <label>
            所要時間（分）
            <input
              type="number"
              min="1"
              value={recurrenceDurationMinutes}
              onChange={(e) => setRecurrenceDurationMinutes(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            />
          </label>

          <button type="submit">繰り返しルールを追加</button>
        </form>

        <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
          {recurrenceRules.length === 0 ? (
            <p>繰り返しルールはまだありません。</p>
          ) : (
            recurrenceRules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  border: "1px solid #eee",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <strong>{rule.title}</strong>
                  <div style={{ fontSize: "13px", color: "#666" }}>
                    {formatFrequency(rule)} / {rule.start_time.slice(0, 5)} / {rule.duration_minutes}分
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteRecurrenceRule(rule.id)}
                >
                  削除
                </button>
              </div>
            ))
          )}
        </div>

        <button type="button" onClick={handleGenerateRecurringEvents}>
          繰り返し予定を生成
        </button>

        {generateMessage && (
          <p style={{ color: "#32627a", marginBottom: 0 }}>{generateMessage}</p>
        )}
      </section>

      <section
        style={{
          maxWidth: "760px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>よく使うタスク</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          過去に予定へ追加した回数が多いタスクです。開始時刻を決めて押すと、すぐ予定に入れられます。
        </p>

        {frequentTasks.length === 0 ? (
          <p>まだよく使うタスクはありません。予定を追加すると表示されます。</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {frequentTasks.map((task) => (
              <div
                key={`${task.task_id ?? "event"}-${task.title}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  border: "1px solid #eee",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <strong>{task.title}</strong>
                  <div style={{ fontSize: "13px", color: "#666" }}>
                    {task.estimated_minutes}分 / {task.usage_count}回使用
                  </div>
                </div>

                <button type="button" onClick={() => handleAddFrequentTask(task)}>
                  予定に追加
                </button>
              </div>
            ))}
          </div>
        )}
      </section>


      <section
        style={{
          maxWidth: "760px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>昨日やったタスク</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          昨日の予定を、時刻はそのままで表示日にコピーできます。
        </p>

        {yesterdayTasks.length === 0 ? (
          <p>昨日の予定はまだありません。</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {yesterdayTasks.map((task) => (
              <div
                key={task.source_event_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  border: "1px solid #eee",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <strong>{task.title}</strong>
                  <div style={{ fontSize: "13px", color: "#666" }}>
                    {task.start_time.slice(11, 16)} - {task.end_time.slice(11, 16)} / {task.estimated_minutes}分
                  </div>
                </div>

                <button type="button" onClick={() => handleCopyReusableTask(task)}>
                  表示日にコピー
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          maxWidth: "760px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>最近やったタスク</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          最近予定に入れたタスクを重複なしで表示します。
        </p>

        {recentTasks.length === 0 ? (
          <p>最近の予定はまだありません。</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {recentTasks.map((task) => (
              <div
                key={task.source_event_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  border: "1px solid #eee",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <strong>{task.title}</strong>
                  <div style={{ fontSize: "13px", color: "#666" }}>
                    元の時刻 {task.start_time.slice(11, 16)} - {task.end_time.slice(11, 16)} / {task.estimated_minutes}分
                  </div>
                </div>

                <button type="button" onClick={() => handleCopyReusableTask(task)}>
                  表示日にコピー
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          maxWidth: "760px",
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "12px",
        }}
      >
        <h2>実績を手入力</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          タイマーを使わなかった作業も、開始・終了時刻を入力して実績カレンダーへ追加できます。
        </p>

        <form
          onSubmit={handleCreateActualLog}
          style={{ display: "grid", gap: "12px" }}
        >
          <label>
            予定に紐づける
            <select
              value={actualCalendarEventId}
              onChange={(e) => handleSelectActualEvent(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            >
              <option value="">予定に紐づけない</option>
              {dayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}（{event.start_time.slice(11, 16)} - {event.end_time.slice(11, 16)}）
                </option>
              ))}
            </select>
          </label>

          <label>
            タスク
            <select
              value={actualTaskId}
              onChange={(e) => setActualTaskId(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            >
              <option value="">タスクを選択しない</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            開始
            <input
              type="datetime-local"
              value={actualStartedAt}
              onChange={(e) => setActualStartedAt(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            />
          </label>

          <label>
            終了
            <input
              type="datetime-local"
              value={actualEndedAt}
              onChange={(e) => setActualEndedAt(e.target.value)}
              style={{ display: "block", padding: "8px", width: "100%" }}
            />
          </label>

          <textarea
            value={actualMemo}
            onChange={(e) => setActualMemo(e.target.value)}
            placeholder="実績メモ"
            style={{ padding: "8px", height: "72px" }}
          />

          <div>
            <button type="submit" style={{ marginRight: "8px" }}>
              実績を追加
            </button>
            <button type="button" onClick={resetActualForm}>
              リセット
            </button>
          </div>
        </form>
      </section>

      <h2>{selectedDate} の予定・実績</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px minmax(320px, 1fr) minmax(320px, 1fr)",
          borderTop: "1px solid #eee",
          position: "relative",
          maxWidth: "1180px",
          overflowX: "auto",
        }}
      >
        <div>
          <div
            style={{
              height: "40px",
              borderBottom: "1px solid #eee",
              boxSizing: "border-box",
            }}
          />

          {hours.map((hour) => (
            <div
              key={hour}
              style={{
                height: `${HOUR_HEIGHT}px`,
                borderBottom: "1px solid #eee",
                color: "#777",
                textAlign: "right",
                paddingRight: "12px",
                boxSizing: "border-box",
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div
          style={{
            borderLeft: "1px solid #eee",
            borderRight: "1px solid #eee",
          }}
        >
          <div
            style={{
              height: "40px",
              borderBottom: "1px solid #eee",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              background: "#fafafa",
            }}
          >
            予定
          </div>

          <div
            style={{
              position: "relative",
              height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px`,
              background:
                "repeating-linear-gradient(to bottom, transparent 0, transparent 95px, #eee 96px)",
            }}
          >
            {dayEvents.map((event) => {
              const top =
                (getMinutesFromStart(event.start_time) / 60) * HOUR_HEIGHT;
              const height =
                (getDurationMinutes(event.start_time, event.end_time) / 60) *
                HOUR_HEIGHT;
              const plannedMinutes = getDurationMinutes(
                event.start_time,
                event.end_time
              );
              const actualMinutes = actualMinutesByEventId[event.id] ?? 0;
              const hasActualMinutes = actualMinutes > 0;

              return (
                <div
                  key={event.id}
                  style={{
                    position: "absolute",
                    top: `${top}px`,
                    left: "12px",
                    right: "12px",
                    height: `${height}px`,
                    background: "#d9f3ff",
                    borderLeft: "4px solid #7cc7f2",
                    borderRadius: "12px",
                    padding: "10px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    color: "#32627a",
                  }}
                >
                  <strong>{event.title}</strong>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    {getTimeLabel(event.start_time, event.end_time)}
                    （予定 {formatMinutes(plannedMinutes)}）
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      marginTop: "4px",
                      fontWeight: 700,
                      color: hasActualMinutes ? "#1f7a4d" : "#777",
                    }}
                  >
                    実績 {hasActualMinutes ? formatMinutes(actualMinutes) : "未登録"}
                    {hasActualMinutes && (
                      <span style={{ marginLeft: "8px", fontWeight: 400 }}>
                        {getComparisonLabel(actualMinutes, plannedMinutes)}
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(event)}
                      style={{ marginRight: "6px" }}
                    >
                      編集
                    </button>

                    <button type="button" onClick={() => handleDelete(event.id)}>
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ borderRight: "1px solid #eee" }}>
          <div
            style={{
              height: "40px",
              borderBottom: "1px solid #eee",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              background: "#fafafa",
            }}
          >
            実績
          </div>

          <div
            style={{
              position: "relative",
              height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px`,
              background:
                "repeating-linear-gradient(to bottom, transparent 0, transparent 95px, #eee 96px)",
            }}
          >
            {dayWorkLogs.map((workLog) => {
              const top =
                (getMinutesFromStart(workLog.started_at) / 60) * HOUR_HEIGHT;
              const height =
                (getDurationMinutes(workLog.started_at, workLog.ended_at) / 60) *
                HOUR_HEIGHT;
              const plannedMinutes = workLog.planned_minutes;
              const differenceMinutes = workLog.difference_minutes;

              return (
                <div
                  key={workLog.id}
                  style={{
                    position: "absolute",
                    top: `${top}px`,
                    left: "12px",
                    right: "12px",
                    height: `${height}px`,
                    background: "#e8f7e8",
                    borderLeft: "4px solid #66c27a",
                    borderRadius: "12px",
                    padding: "10px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    color: "#2f6b3d",
                  }}
                >
                  <strong>{getWorkLogTitle(workLog, events, tasks)}</strong>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    {getTimeLabel(workLog.started_at, workLog.ended_at)}
                    （実績 {formatMinutes(workLog.duration_minutes)}）
                  </div>

                  {plannedMinutes != null && differenceMinutes != null && (
                    <div style={{ fontSize: "13px", marginTop: "4px" }}>
                      予定 {formatMinutes(plannedMinutes)} /{" "}
                      {differenceMinutes === 0
                        ? "予定通り"
                        : differenceMinutes > 0
                          ? `${formatMinutes(differenceMinutes)}超過`
                          : `${formatMinutes(Math.abs(differenceMinutes))}短縮`}
                    </div>
                  )}

                  {workLog.memo && (
                    <div style={{ fontSize: "12px", marginTop: "4px" }}>
                      {workLog.memo}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
