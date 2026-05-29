import { apiClient } from "./client";

export type Project = {
  id: number;
  goal_id: number;
  title: string;
  description?: string | null;
  estimated_minutes: number;
  actual_minutes: number;
  status: string;
};

export type ProjectInput = {
  goal_id: number;
  title: string;
  description?: string;
  estimated_minutes: number;
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiClient.get("/projects/");
  return res.data;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const res = await apiClient.post("/projects/", input);
  return res.data;
}

export async function updateProject(
  id: number,
  input: ProjectInput & {
    actual_minutes: number;
    status: string;
  }
): Promise<Project> {
  const res = await apiClient.put(`/projects/${id}`, input);
  return res.data;
}

export async function deleteProject(id: number): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}
export async function updateProjectStatus(id: number, status: string): Promise<Project> {
  const res = await apiClient.patch(`/projects/${id}/status`, { status });
  return res.data;
}
