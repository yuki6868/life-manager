from pydantic import BaseModel


class TodaySummaryResponse(BaseModel):
    planned_minutes: int
    actual_minutes: int
    achievement_rate: float
    incomplete_events_count: int
