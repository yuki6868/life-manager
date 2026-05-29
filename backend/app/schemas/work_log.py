from datetime import datetime

from pydantic import BaseModel


class WorkLogCreate(BaseModel):
    task_id: int | None = None
    calendar_event_id: int | None = None
    started_at: datetime
    ended_at: datetime
    memo: str | None = None


class WorkLogResponse(BaseModel):
    id: int
    task_id: int | None
    calendar_event_id: int | None
    started_at: datetime
    ended_at: datetime
    duration_minutes: int
    memo: str | None

    class Config:
        from_attributes = True
