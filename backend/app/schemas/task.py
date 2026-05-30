from datetime import datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    priority: str = "medium"
    estimated_minutes: int = 0
    energy_level: str = "medium"


class UrgentTaskCreate(BaseModel):
    title: str
    description: str | None = None
    project_id: int | None = None
    priority: str = "high"
    estimated_minutes: int = 0
    energy_level: str = "medium"
    status: str = "todo"
    urgency: int = Field(default=5, ge=1, le=5)
    importance: int = Field(default=5, ge=1, le=5)
    occurred_at: datetime | None = None
    interruption_reason: str | None = None


class TaskUpdate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    priority: str = "medium"
    estimated_minutes: int = 0
    actual_minutes: int = 0
    energy_level: str = "medium"
    status: str = "todo"
    task_type: str = "normal"
    urgency: int | None = Field(default=None, ge=1, le=5)
    importance: int | None = Field(default=None, ge=1, le=5)
    occurred_at: datetime | None = None
    interruption_reason: str | None = None


class TaskStatusUpdate(BaseModel):
    status: str


class TaskResponse(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    priority: str
    estimated_minutes: int
    actual_minutes: int
    energy_level: str
    status: str
    task_type: str
    urgency: int | None
    importance: int | None
    occurred_at: datetime | None
    interruption_reason: str | None

    class Config:
        from_attributes = True
