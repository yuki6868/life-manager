import { useEffect, useMemo, useState } from "react";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import { fetchTodaySummary } from "../api/dashboard";
import type { TodaySummary } from "../api/dashboard";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";

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

export default function DashboardPage() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [summaryData, eventData, taskData] = await Promise.all([
        fetchTodaySummary(),
        fetchCalendarEvents(),
        fetchTasks(),
      ]);

      setSummary(summaryData);
      setCalendarEvents(eventData);
      setTasks(taskData);
    } catch (error) {
      console.error(error);
      setErrorMessage("ダッシュボードの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const todayKey = toDateKey(new Date());

  const todayEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => event.status !== "cancelled")
      .filter((event) => event.start_time.slice(0, 10) === todayKey)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [calendarEvents, todayKey]);

  const incompleteEvents = useMemo(() => {
    return todayEvents.filter(isIncompleteEvent);
  }, [todayEvents]);

  const inProgressTasks = useMemo(() => {
    return tasks
      .filter(isInProgressTask)
      .sort((a, b) => b.actual_minutes - a.actual_minutes);
  }, [tasks]);

  return (
    <section style={{ padding: "32px", borderTop: "1px solid #ddd" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1>ダッシュボード</h1>
          <p style={{ color: "#666" }}>
            今日の予定、実績、進行中タスク、未完了予定をまとめて確認します。
          </p>
        </div>
        <button type="button" onClick={loadData} disabled={isLoading} style={{ height: "40px" }}>
          再読み込み
        </button>
      </div>

      {isLoading && <p>読み込み中...</p>}
      {errorMessage && <p style={{ color: "#b00020" }}>{errorMessage}</p>}

      {!isLoading && !errorMessage && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "16px",
              margin: "24px 0",
            }}
          >
            <SummaryCard
              label="今日の予定時間"
              value={formatMinutes(summary?.planned_minutes ?? 0)}
            />
            <SummaryCard
              label="今日の実績時間"
              value={formatMinutes(summary?.actual_minutes ?? 0)}
            />
            <SummaryCard
              label="達成率"
              value={`${summary?.achievement_rate ?? 0}%`}
            />
            <SummaryCard
              label="未完了予定"
              value={`${summary?.incomplete_events_count ?? incompleteEvents.length}件`}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            <DashboardPanel title="今日の予定">
              {todayEvents.length === 0 ? (
                <p>今日の予定はまだありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {todayEvents.map((event) => (
                    <div key={event.id} style={itemStyle}>
                      <strong>{event.title}</strong>
                      <p style={mutedTextStyle}>
                        {formatTime(event.start_time)} - {formatTime(event.end_time)} / {formatMinutes(getEventMinutes(event))}
                      </p>
                      <p style={mutedTextStyle}>状態: {statusLabel(event.status)}</p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="進行中タスク">
              {inProgressTasks.length === 0 ? (
                <p>進行中タスクはありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {inProgressTasks.map((task) => (
                    <div key={task.id} style={itemStyle}>
                      <strong>{task.title}</strong>
                      <p style={mutedTextStyle}>
                        実績 {formatMinutes(task.actual_minutes)} / 見積 {formatMinutes(task.estimated_minutes)}
                      </p>
                      <p style={mutedTextStyle}>
                        優先度: {task.priority} / エネルギー: {task.energy_level}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="未完了予定">
              {incompleteEvents.length === 0 ? (
                <p>今日の未完了予定はありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {incompleteEvents.map((event) => (
                    <div key={event.id} style={itemStyle}>
                      <strong>{event.title}</strong>
                      <p style={mutedTextStyle}>
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </p>
                      <p style={mutedTextStyle}>状態: {statusLabel(event.status)}</p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "18px",
        border: "1px solid #ddd",
        borderRadius: "12px",
        background: "#fff",
      }}
    >
      <p style={{ margin: "0 0 8px", color: "#666", fontSize: "14px" }}>{label}</p>
      <strong style={{ fontSize: "24px" }}>{value}</strong>
    </div>
  );
}

function DashboardPanel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section
      style={{
        padding: "20px",
        border: "1px solid #ddd",
        borderRadius: "12px",
        background: "#fff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

const itemStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: "10px",
  padding: "12px",
  background: "#fafafa",
};

const mutedTextStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#666",
};
