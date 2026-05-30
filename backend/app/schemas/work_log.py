from datetime import datetime

from pydantic import BaseModel


class WorkLogCreate(BaseModel):
    task_id: int | None = None
    calendar_event_id: int | None = None
    gap_task_id: int | None = None
    started_at: datetime
    ended_at: datetime
    duration_minutes: int | None = None
    memo: str | None = None


class WorkLogResponse(BaseModel):
    id: int
    task_id: int | None
    calendar_event_id: int | None
    gap_task_id: int | None
    started_at: datetime
    ended_at: datetime
    duration_minutes: int
    memo: str | None
    planned_minutes: int | None = None
    actual_minutes: int | None = None
    difference_minutes: int | None = None
    calendar_event_status: str | None = None
    gap_task_status: str | None = None

    class Config:
        from_attributes = True
