import { apiClient } from "./client";

export type EstimationAccuracyTask = {
  id: number;
  project_id: number;
  project_title: string;
  title: string;
  estimated_minutes: number;
  actual_minutes: number;
  difference_minutes: number;
  priority: string;
  energy_level: string;
  status: string;
};

export type EstimationAccuracyTrend = {
  task_type: string;
  task_count: number;
  average_estimated_minutes: number;
  average_actual_minutes: number;
  average_difference_minutes: number;
  underestimation_rate: number;
};

export type EstimationAccuracySummary = {
  total_task_count: number;
  average_estimated_minutes: number;
  average_actual_minutes: number;
  average_difference_minutes: number;
  underestimation_rate: number;
  task_type_trends: EstimationAccuracyTrend[];
  recent_tasks: EstimationAccuracyTask[];
};

export async function fetchEstimationAccuracySummary(): Promise<EstimationAccuracySummary> {
  const res = await apiClient.get("/estimations/accuracy-summary");
  return res.data;
}
