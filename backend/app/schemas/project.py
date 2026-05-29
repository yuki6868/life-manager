from pydantic import BaseModel


class ProjectCreate(BaseModel):
    goal_id: int
    title: str
    description: str | None = None
    estimated_minutes: int = 0


class ProjectUpdate(BaseModel):
    goal_id: int
    title: str
    description: str | None = None
    estimated_minutes: int = 0
    actual_minutes: int = 0
    status: str


class ProjectStatusUpdate(BaseModel):
    status: str


class ProjectResponse(BaseModel):
    id: int
    goal_id: int
    title: str
    description: str | None
    estimated_minutes: int
    actual_minutes: int
    status: str

    class Config:
        from_attributes = True