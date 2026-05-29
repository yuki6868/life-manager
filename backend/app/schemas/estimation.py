from pydantic import BaseModel


class SimilarTaskResponse(BaseModel):
    id: int
    project_id: int
    project_title: str
    title: str
    description: str | None
    estimated_minutes: int
    actual_minutes: int
    priority: str
    energy_level: str
    status: str
    similarity_score: float


class EstimateSuggestionResponse(BaseModel):
    title: str
    description: str | None = None
    project_id: int | None = None
    similar_tasks: list[SimilarTaskResponse]
    average_actual_minutes: int
    recommended_estimated_minutes: int
    matched_task_count: int

class EstimationAccuracyTaskResponse(BaseModel):
    id: int
    project_id: int
    project_title: str
    title: str
    estimated_minutes: int
    actual_minutes: int
    difference_minutes: int
    priority: str
    energy_level: str
    status: str


class EstimationAccuracyTrendResponse(BaseModel):
    task_type: str
    task_count: int
    average_estimated_minutes: int
    average_actual_minutes: int
    average_difference_minutes: int
    underestimation_rate: float


class EstimationAccuracySummaryResponse(BaseModel):
    total_task_count: int
    average_estimated_minutes: int
    average_actual_minutes: int
    average_difference_minutes: int
    underestimation_rate: float
    task_type_trends: list[EstimationAccuracyTrendResponse]
    recent_tasks: list[EstimationAccuracyTaskResponse]

