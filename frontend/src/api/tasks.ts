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
};

export async function fetchTasks(): Promise<Task[]> {
  const res = await apiClient.get("/tasks/");
  return res.data;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const res = await apiClient.post("/tasks/", input);
  return res.data;
}

export async function updateTask(id: number, input: Required<TaskInput>): Promise<Task> {
  const res = await apiClient.put(`/tasks/${id}`, input);
  return res.data;
}

export async function deleteTask(id: number): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}