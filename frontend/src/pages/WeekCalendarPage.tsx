import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const START_HOUR = 5;
const END_HOUR = 24;
const HOUR_HEIGHT = 72;
const TIMELINE_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

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

function getTimelineTop(dateText: string) {
  const date = new Date(dateText);
  const minutes = (date.getHours() - START_HOUR) * 60 + date.getMinutes();
  return Math.max(0, Math.min(TIMELINE_HEIGHT, (minutes / 60) * HOUR_HEIGHT));
}

function getTimelineHeight(event: CalendarEvent) {
  return Math.max(34, (getMinutes(event) / 60) * HOUR_HEIGHT);
}

function getCurrentTimeTop(weekStart: Date) {
  const now = new Date();
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);

  if (now < start || now >= end || now.getHours() < START_HOUR || now.getHours() >= END_HOUR) {
    return null;
  }

  return {
    dayIndex: (now.getDay() + 6) % 7,
    top: getTimelineTop(now.toISOString()),
  };
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
  const currentTime = getCurrentTimeTop(weekStart);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);

  function moveWeek(amount: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + amount * 7);
    setWeekStart(next);
  }

  return (
    <section className="week-calendar-page landscape-page landscape-week-page">
      <div className="calendar-toolbar">
        <div>
          <p className="calendar-toolbar__eyebrow">Weekly timeline</p>
          <h1 className="calendar-toolbar__title">週表示</h1>
          <p className="calendar-toolbar__description">1週間の予定を時間軸で確認できます。予定の追加・編集は日表示で行います。</p>
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
        <div className="week-timeline-shell">
          <div className="week-timeline-header">
            <div className="week-timeline-time-header">時間</div>
            {days.map((day, index) => (
              <Link key={day.key} className="week-timeline-day-header" to={`/calendar?date=${day.key}`}>
                <strong>{WEEKDAYS[index]}</strong>
                <span>{day.key.slice(5)}</span>
              </Link>
            ))}
          </div>

          <div className="week-timeline-body" style={{ minHeight: TIMELINE_HEIGHT }}>
            <div className="week-timeline-hours" aria-hidden="true">
              {hours.map((hour) => (
                <div key={hour} className="week-timeline-hour-label" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            <div className="week-timeline-days">
              {days.map((day, index) => (
                <div key={day.key} className="week-timeline-day" style={{ minHeight: TIMELINE_HEIGHT }}>
                  {hours.slice(0, -1).map((hour) => (
                    <div key={hour} className="week-timeline-hour-line" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }} />
                  ))}

                  {currentTime?.dayIndex === index ? (
                    <div className="week-current-time-line" style={{ top: currentTime.top }} />
                  ) : null}

                  {day.events.length === 0 ? (
                    <div className="week-timeline-empty">予定なし</div>
                  ) : day.events.map((event) => (
                    <Link
                      key={event.id}
                      className={`week-timeline-event week-timeline-event--${event.status}`}
                      style={{ top: getTimelineTop(event.start_time), height: getTimelineHeight(event) }}
                      to={`/calendar?date=${day.key}`}
                      title={`${event.title} ${formatTime(event.start_time)} - ${formatTime(event.end_time)}`}
                    >
                      <strong>{event.title}</strong>
                      <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
