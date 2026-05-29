from datetime import datetime

from pydantic import BaseModel


class GoalCreate(BaseModel):
    title: str
    description: str | None = None
    target_date: datetime | None = None


class GoalUpdate(BaseModel):
    title: str
    description: str | None = None
    status: str
    target_date: datetime | None = None


class GoalStatusUpdate(BaseModel):
    status: str


class GoalResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None
    status: str
    target_date: datetime | None

    class Config:
        from_attributes = True