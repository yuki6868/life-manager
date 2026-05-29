import { apiClient } from "./client";

export type WorkLog = {
  id: number;
  task_id?: number | null;
  calendar_event_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  memo?: string | null;
};

export type WorkLogInput = {
  task_id?: number | null;
  calendar_event_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes?: number;
  memo?: string | null;
};

export async function createWorkLog(input: WorkLogInput): Promise<WorkLog> {
  const res = await apiClient.post("/work-logs/", input);
  return res.data;
}
