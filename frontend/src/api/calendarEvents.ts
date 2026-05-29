import { apiClient } from "./client";

export type CalendarEvent = {
  id: number;
  task_id?: number | null;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  status: string;
};

export type CalendarEventInput = {
  task_id?: number | null;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
};

export type FrequentTask = {
  task_id?: number | null;
  title: string;
  description?: string | null;
  estimated_minutes: number;
  usage_count: number;
};

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const res = await apiClient.get("/calendar-events/");
  return res.data;
}

export async function fetchFrequentTasks(): Promise<FrequentTask[]> {
  const res = await apiClient.get("/calendar-events/frequent-tasks");
  return res.data;
}

export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<CalendarEvent> {
  const res = await apiClient.post("/calendar-events/", input);
  return res.data;
}

export async function updateCalendarEvent(
  id: number,
  input: CalendarEventInput & { status: string }
): Promise<CalendarEvent> {
  const res = await apiClient.put(`/calendar-events/${id}`, input);
  return res.data;
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  await apiClient.delete(`/calendar-events/${id}`);
}
