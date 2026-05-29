import { apiClient } from "./client";

export type Goal = {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  status: string;
  target_date?: string | null;
};

export type GoalInput = {
  title: string;
  description?: string;
  target_date?: string;
};

export async function fetchGoals(): Promise<Goal[]> {
  const res = await apiClient.get("/goals/");
  return res.data;
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const res = await apiClient.post("/goals/", input);
  return res.data;
}

export async function updateGoal(id: number, input: GoalInput & { status: string }): Promise<Goal> {
  const res = await apiClient.put(`/goals/${id}`, input);
  return res.data;
}

export async function deleteGoal(id: number): Promise<void> {
  await apiClient.delete(`/goals/${id}`);
}