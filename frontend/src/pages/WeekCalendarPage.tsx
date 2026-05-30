import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

function toDateKey(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getWeekStart(date: Date) {
  const copied = new Date(date);
  const day = copied.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copied.setDate(copied.getDate() + diff);
  copied.setHours(0, 0, 0, 0);
  return copied;
}

function formatTime(dateText: string) {
  return new Date(dateText).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function getMinutes(event: CalendarEvent) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

export default function WeekCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);
    try {
      setEvents(await fetchCalendarEvents());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = toDateKey(date);
    const dayEvents = events
      .filter((event) => event.status !== "cancelled")
      .filter((event) => event.start_time.slice(0, 10) === key)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    return { date, key, events: dayEvents };
  }), [events, weekStart]);

  const weeklyMinutes = days.reduce((total, day) => total + day.events.reduce((sum, event) => sum + getMinutes(event), 0), 0);

  function moveWeek(amount: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + amount * 7);
    setWeekStart(next);
  }

  return (
    <section className="week-calendar-page">
      <div className="calendar-toolbar">
        <div>
          <p className="calendar-toolbar__eyebrow">Weekly timeline</p>
          <h1 className="calendar-toolbar__title">週表示</h1>
          <p className="calendar-toolbar__description">1週間の予定量を確認できます。予定の追加・編集は日表示で行います。</p>
        </div>
        <div className="calendar-toolbar__actions">
          <button type="button" className="calendar-icon-button" onClick={() => moveWeek(-1)}>‹</button>
          <strong>{toDateKey(weekStart)} 週</strong>
          <button type="button" className="calendar-icon-button" onClick={() => moveWeek(1)}>›</button>
          <Link className="calendar-button calendar-button--primary" to="/calendar">日表示へ</Link>
        </div>
      </div>

      <div className="calendar-summary-grid">
        <div className="calendar-summary-card"><span>週間予定時間</span><strong>{formatMinutes(weeklyMinutes)}</strong></div>
        <div className="calendar-summary-card"><span>予定数</span><strong>{days.reduce((total, day) => total + day.events.length, 0)}件</strong></div>
      </div>

      {isLoading ? <p className="dashboard-state-message">読み込み中...</p> : (
        <div className="week-grid">
          {days.map((day, index) => (
            <section key={day.key} className="week-day-card">
              <h2>{WEEKDAYS[index]} <span>{day.key.slice(5)}</span></h2>
              {day.events.length === 0 ? (
                <p className="calendar-empty">予定なし</p>
              ) : day.events.map((event) => (
                <article key={event.id} className="week-event-card">
                  <strong>{event.title}</strong>
                  <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
