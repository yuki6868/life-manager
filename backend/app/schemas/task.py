from pydantic import BaseModel


class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    priority: str = "medium"
    estimated_minutes: int = 0
    energy_level: str = "medium"


class TaskUpdate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    priority: str = "medium"
    estimated_minutes: int = 0
    actual_minutes: int = 0
    energy_level: str = "medium"
    status: str = "todo"


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

    class Config:
        from_attributes = True