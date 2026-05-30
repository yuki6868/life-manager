import { apiClient } from "./client";

export type Task = {
  id: number;
  project_id: number;
  title: string;
  description?: string | null;
  priority: string;
  estimated_minutes: number;
  actual_minutes: number;
  energy_level: string;
  status: string;
  task_type: string;
  urgency?: number | null;
  importance?: number | null;
  occurred_at?: string | null;
  interruption_reason?: string | null;
};

export type TaskInput = {
  project_id: number;
  title: string;
  description?: string;
  priority: string;
  estimated_minutes: number;
  actual_minutes?: number;
  energy_level: string;
  status?: string;
  task_type?: string;
  urgency?: number | null;
  importance?: number | null;
  occurred_at?: string | null;
  interruption_reason?: string | null;
};

export type UrgentTaskInput = {
  title: string;
  description?: string;
  project_id?: number | null;
  priority?: string;
  estimated_minutes?: number;
  energy_level?: string;
  status?: string;
  urgency: number;
  importance: number;
  occurred_at?: string | null;
  interruption_reason?: string | null;
};

export async function fetchTasks(taskType?: string): Promise<Task[]> {
  const res = await apiClient.get("/tasks/", {
    params: taskType ? { task_type: taskType } : undefined,
  });
  return res.data;
}


export async function createTask(input: TaskInput): Promise<Task> {
  const res = await apiClient.post("/tasks/", input);
  return res.data;
}

export async function createUrgentTask(input: UrgentTaskInput): Promise<Task> {
  const res = await apiClient.post("/tasks/urgent", input);
  return res.data;
}

export async function updateTask(id: number, input: TaskInput): Promise<Task> {
  const res = await apiClient.put(`/tasks/${id}`, input);
  return res.data;
}

export async function deleteTask(id: number): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}
export async function updateTaskStatus(id: number, status: string): Promise<Task> {
  const res = await apiClient.patch(`/tasks/${id}/status`, { status });
  return res.data;
}
