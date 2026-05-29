import { apiClient } from "./client";

export type TodaySummary = {
  planned_minutes: number;
  actual_minutes: number;
  achievement_rate: number;
  incomplete_events_count: number;
};

export async function fetchTodaySummary(): Promise<TodaySummary> {
  const res = await apiClient.get("/dashboard/today-summary");
  return res.data;
}
