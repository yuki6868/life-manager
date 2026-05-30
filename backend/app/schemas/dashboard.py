from pydantic import BaseModel


class TodaySummaryResponse(BaseModel):
    planned_minutes: int
    actual_minutes: int
    achievement_rate: float
    incomplete_events_count: int


class WeeklyActualResponse(BaseModel):
    week_start: str
    week_end: str
    actual_minutes: int


class MonthlyActualResponse(BaseModel):
    month: str
    actual_minutes: int


class ProjectTimeAllocationResponse(BaseModel):
    project_id: int
    project_title: str
    actual_minutes: int
    percentage: float



class UrgentInterruptionReasonResponse(BaseModel):
    reason: str
    urgent_task_count: int
    actual_minutes: int


class UrgentTaskAnalysisResponse(BaseModel):
    days: int
    urgent_task_count: int
    urgent_work_log_count: int
    urgent_actual_minutes: int
    planned_minutes: int
    plan_collapse_rate: float
    active_urgent_task_count: int
    completed_urgent_task_count: int
    interruption_reasons: list[UrgentInterruptionReasonResponse]
