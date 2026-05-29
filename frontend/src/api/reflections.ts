import { apiClient } from "./client";

export type Reflection = {
  id: number;
  reflection_date: string;
  good_things?: string | null;
  bad_things?: string | null;
  improvements?: string | null;
  delay_reasons?: string | null;
  memo?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReflectionInput = {
  reflection_date: string;
  good_things?: string | null;
  bad_things?: string | null;
  improvements?: string | null;
  delay_reasons?: string | null;
  memo?: string | null;
};

export async function fetchReflections(): Promise<Reflection[]> {
  const res = await apiClient.get("/reflections/");
  return res.data;
}

export async function createReflection(
  input: ReflectionInput
): Promise<Reflection> {
  const res = await apiClient.post("/reflections/", input);
  return res.data;
}

export async function updateReflection(
  id: number,
  input: ReflectionInput
): Promise<Reflection> {
  const res = await apiClient.put(`/reflections/${id}`, input);
  return res.data;
}

export async function deleteReflection(id: number): Promise<void> {
  await apiClient.delete(`/reflections/${id}`);
}
