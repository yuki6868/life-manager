from pydantic import BaseModel
from datetime import datetime


class UserBase(BaseModel):
    name: str
    email: str | None = None


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True