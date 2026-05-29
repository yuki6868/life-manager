import { useEffect, useMemo, useState } from "react";
import {
  createCalendarEvent,
  fetchCalendarEvents,
} from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";

const START_HOUR = 5;
const END_HOUR = 24;
const HOUR_HEIGHT = 96;

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

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));

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

  async function loadEvents() {
    const data = await fetchCalendarEvents();
    setEvents(data);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const dayEvents = useMemo(() => {
    return events
      .filter((event) => isSameDate(event.start_time, selectedDate))
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [events, selectedDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;

    await createCalendarEvent({
      title,
      description,
      start_time: startTime,
      end_time: endTime,
    });

    setTitle("");
    setDescription("");
    await loadEvents();
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
        <h2>予定追加</h2>

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
            onChange={(e) => setStartTime(e.target.value)}
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

        <button type="submit">予定を追加</button>
      </form>

      <h2>
        {selectedDate} の予定
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr",
          borderTop: "1px solid #eee",
          position: "relative",
          maxWidth: "760px",
        }}
      >
        <div>
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
            position: "relative",
            height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px`,
            borderLeft: "1px solid #eee",
            background:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 95px, #eee 96px)",
          }}
        >
          {dayEvents.map((event) => {
            const top = (getMinutesFromStart(event.start_time) / 60) * HOUR_HEIGHT;
            const height =
              (getDurationMinutes(event.start_time, event.end_time) / 60) *
              HOUR_HEIGHT;

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
                  {event.start_time.slice(11, 16)} - {event.end_time.slice(11, 16)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}