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
