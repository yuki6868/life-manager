import { apiClient } from "./client";

export type GapTask = {
  id: number;
  title: string;
  description?: string | null;
  required_minutes: number;
  priority: string;
  energy_level: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type GapTaskSuggestion = {
  available_minutes: number;
  next_event_id?: number | null;
  next_event_title?: string | null;
  next_event_start_time?: string | null;
  suggested_tasks: GapTask[];
};

export type GapTaskInput = {
  title: string;
  description?: string;
  required_minutes: number;
  priority: string;
  energy_level: string;
  status?: string;
};

export async function fetchGapTasks(): Promise<GapTask[]> {
  const res = await apiClient.get("/gap-tasks/");
  return res.data;
}

export async function fetchNextGapTaskSuggestions(
  energyLevel?: string,
): Promise<GapTaskSuggestion> {
  const res = await apiClient.get("/gap-tasks/suggestions/next-gap", {
    params: energyLevel ? { energy_level: energyLevel } : undefined,
  });
  return res.data;
}

export async function createGapTask(input: GapTaskInput): Promise<GapTask> {
  const res = await apiClient.post("/gap-tasks/", input);
  return res.data;
}

export async function updateGapTask(
  id: number,
  input: Required<GapTaskInput>,
): Promise<GapTask> {
  const res = await apiClient.put(`/gap-tasks/${id}`, input);
  return res.data;
}

export async function updateGapTaskStatus(
  id: number,
  status: string,
): Promise<GapTask> {
  const res = await apiClient.patch(`/gap-tasks/${id}/status`, { status });
  return res.data;
}

export async function deleteGapTask(id: number): Promise<void> {
  await apiClient.delete(`/gap-tasks/${id}`);
}
