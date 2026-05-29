import { apiClient } from "./client";

export type RecurrenceFrequency = "daily" | "weekday" | "weekly";

export type RecurrenceRule = {
  id: number;
  task_id?: number | null;
  title: string;
  description?: string | null;
  frequency: RecurrenceFrequency;
  weekday?: number | null;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
};

export type RecurrenceRuleInput = {
  task_id?: number | null;
  title: string;
  description?: string | null;
  frequency: RecurrenceFrequency;
  weekday?: number | null;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
};

export async function fetchRecurrenceRules(): Promise<RecurrenceRule[]> {
  const res = await apiClient.get("/recurrence-rules/");
  return res.data;
}

export async function createRecurrenceRule(
  input: RecurrenceRuleInput
): Promise<RecurrenceRule> {
  const res = await apiClient.post("/recurrence-rules/", input);
  return res.data;
}

export async function deleteRecurrenceRule(id: number): Promise<void> {
  await apiClient.delete(`/recurrence-rules/${id}`);
}
