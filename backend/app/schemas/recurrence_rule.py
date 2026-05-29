from datetime import time

from pydantic import BaseModel


class RecurrenceRuleCreate(BaseModel):
    task_id: int | None = None
    title: str
    description: str | None = None
    frequency: str = "daily"
    weekday: int | None = None
    start_time: time
    duration_minutes: int = 60
    is_active: bool = True


class RecurrenceRuleUpdate(BaseModel):
    task_id: int | None = None
    title: str
    description: str | None = None
    frequency: str = "daily"
    weekday: int | None = None
    start_time: time
    duration_minutes: int = 60
    is_active: bool = True


class RecurrenceRuleResponse(BaseModel):
    id: int
    task_id: int | None
    title: str
    description: str | None
    frequency: str
    weekday: int | None
    start_time: time
    duration_minutes: int
    is_active: bool

    class Config:
        from_attributes = True
