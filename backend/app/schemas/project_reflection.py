from datetime import datetime

from pydantic import BaseModel


class ProjectReflectionBase(BaseModel):
    project_id: int
    estimated_minutes: int = 0
    actual_minutes: int = 0
    difference_minutes: int = 0
    difference_reason: str | None = None
    next_improvement: str | None = None


class ProjectReflectionCreate(ProjectReflectionBase):
    pass


class ProjectReflectionUpdate(ProjectReflectionBase):
    pass


class ProjectReflectionResponse(ProjectReflectionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
