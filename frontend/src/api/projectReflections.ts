import { apiClient } from "./client";

export type ProjectReflection = {
  id: number;
  project_id: number;
  estimated_minutes: number;
  actual_minutes: number;
  difference_minutes: number;
  difference_reason?: string | null;
  next_improvement?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectReflectionInput = {
  project_id: number;
  estimated_minutes: number;
  actual_minutes: number;
  difference_minutes: number;
  difference_reason?: string | null;
  next_improvement?: string | null;
};

export async function fetchProjectReflections(): Promise<ProjectReflection[]> {
  const res = await apiClient.get("/project-reflections/");
  return res.data;
}

export async function createProjectReflection(
  input: ProjectReflectionInput
): Promise<ProjectReflection> {
  const res = await apiClient.post("/project-reflections/", input);
  return res.data;
}

export async function updateProjectReflection(
  id: number,
  input: ProjectReflectionInput
): Promise<ProjectReflection> {
  const res = await apiClient.put(`/project-reflections/${id}`, input);
  return res.data;
}

export async function deleteProjectReflection(id: number): Promise<void> {
  await apiClient.delete(`/project-reflections/${id}`);
}
