import { apiClient } from "./client";

export type TodaySummary = {
  planned_minutes: number;
  actual_minutes: number;
  achievement_rate: number;
  incomplete_events_count: number;
};

export type UrgentInterruptionReason = {
  reason: string;
  urgent_task_count: number;
  actual_minutes: number;
};

export type UrgentTaskAnalysis = {
  days: number;
  urgent_task_count: number;
  urgent_work_log_count: number;
  urgent_actual_minutes: number;
  planned_minutes: number;
  plan_collapse_rate: number;
  active_urgent_task_count: number;
  completed_urgent_task_count: number;
  interruption_reasons: UrgentInterruptionReason[];
};

export async function fetchTodaySummary(): Promise<TodaySummary> {
  const res = await apiClient.get("/dashboard/today-summary");
  return res.data;
}


export async function fetchUrgentTaskAnalysis(
  days = 30,
): Promise<UrgentTaskAnalysis> {
  const res = await apiClient.get("/dashboard/urgent-task-analysis", {
    params: { days },
  });
  return res.data;
}
