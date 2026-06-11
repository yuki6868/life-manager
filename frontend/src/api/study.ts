import { apiClient } from "./client";

export type StudySubject = {
  id: number;
  name: string;
  exam_name?: string | null;
  target_minutes: number;
  color?: string | null;
  memo?: string | null;
  created_at: string;
  updated_at: string;
};

export type StudySubjectInput = {
  name: string;
  exam_name?: string | null;
  target_minutes?: number;
  color?: string | null;
  memo?: string | null;
};

export type StudyLog = {
  id: number;
  subject_id: number;
  subject_name: string;
  studied_on: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_minutes: number;
  material?: string | null;
  unit?: string | null;
  method?: string | null;
  understanding?: number | null;
  memo?: string | null;
  created_at: string;
  updated_at: string;
};

export type StudyLogInput = {
  subject_id: number;
  studied_on: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_minutes: number;
  material?: string | null;
  unit?: string | null;
  method?: string | null;
  understanding?: number | null;
  memo?: string | null;
};

export type StudySubjectSummary = {
  subject_id: number;
  subject_name: string;
  exam_name?: string | null;
  target_minutes: number;
  total_minutes: number;
  log_count: number;
};

export type StudyDailySummary = {
  studied_on: string;
  total_minutes: number;
};

export type StudySummary = {
  total_minutes: number;
  total_logs: number;
  subject_summaries: StudySubjectSummary[];
  daily_summaries: StudyDailySummary[];
};

export async function fetchStudySubjects(): Promise<StudySubject[]> {
  const res = await apiClient.get("/study/subjects");
  return res.data;
}

export async function createStudySubject(input: StudySubjectInput): Promise<StudySubject> {
  const res = await apiClient.post("/study/subjects", input);
  return res.data;
}

export async function fetchStudyLogs(params?: { start_date?: string; end_date?: string; subject_id?: number | null }): Promise<StudyLog[]> {
  const res = await apiClient.get("/study/logs", { params });
  return res.data;
}

export async function createStudyLog(input: StudyLogInput): Promise<StudyLog> {
  const res = await apiClient.post("/study/logs", input);
  return res.data;
}

export async function updateStudyLog(id: number, input: Partial<StudyLogInput>): Promise<StudyLog> {
  const res = await apiClient.patch(`/study/logs/${id}`, input);
  return res.data;
}

export async function deleteStudyLog(id: number): Promise<void> {
  await apiClient.delete(`/study/logs/${id}`);
}

export async function fetchStudySummary(params?: { start_date?: string; end_date?: string }): Promise<StudySummary> {
  const res = await apiClient.get("/study/summary", { params });
  return res.data;
}
