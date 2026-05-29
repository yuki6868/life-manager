from datetime import datetime

from pydantic import BaseModel


class CalendarEventCreate(BaseModel):
    task_id: int | None = None
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime


class CalendarEventUpdate(BaseModel):
    task_id: int | None = None
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime
    status: str = "scheduled"


class CalendarEventResponse(BaseModel):
    id: int
    task_id: int | None
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime
    status: str

    class Config:
        from_attributes = True


class FrequentTaskResponse(BaseModel):
    task_id: int | None
    title: str
    description: str | None = None
    estimated_minutes: int
    usage_count: int
