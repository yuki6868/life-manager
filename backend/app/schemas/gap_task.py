from datetime import datetime

from pydantic import BaseModel, Field


class GapTaskBase(BaseModel):
    title: str
    description: str | None = None
    required_minutes: int = Field(default=15, ge=1)
    priority: str = "medium"
    energy_level: str = "medium"
    status: str = "todo"


class GapTaskCreate(GapTaskBase):
    pass


class GapTaskUpdate(GapTaskBase):
    pass


class GapTaskStatusUpdate(BaseModel):
    status: str


class GapTaskResponse(GapTaskBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GapTaskSuggestionResponse(BaseModel):
    available_minutes: int
    next_event_id: int | None = None
    next_event_title: str | None = None
    next_event_start_time: datetime | None = None
    suggested_tasks: list[GapTaskResponse]
