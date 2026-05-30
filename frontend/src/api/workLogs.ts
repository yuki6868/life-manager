import { apiClient } from "./client";

export type WorkLog = {
  id: number;
  task_id?: number | null;
  calendar_event_id?: number | null;
  gap_task_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  memo?: string | null;
  planned_minutes?: number | null;
  actual_minutes?: number | null;
  difference_minutes?: number | null;
  calendar_event_status?: string | null;
  gap_task_status?: string | null;
};

export type WorkLogInput = {
  task_id?: number | null;
  calendar_event_id?: number | null;
  gap_task_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes?: number;
  memo?: string | null;
  planned_minutes?: number | null;
  actual_minutes?: number | null;
  difference_minutes?: number | null;
  calendar_event_status?: string | null;
  gap_task_status?: string | null;
};

export async function createWorkLog(input: WorkLogInput): Promise<WorkLog> {
  const res = await apiClient.post("/work-logs/", input);
  return res.data;
}

export async function fetchWorkLogs(): Promise<WorkLog[]> {
  const res = await apiClient.get("/work-logs/");
  return res.data;
}

export async function deleteWorkLog(id: number): Promise<void> {
  await apiClient.delete(`/work-logs/${id}`);
}
