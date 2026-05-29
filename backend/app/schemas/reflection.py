from datetime import date, datetime

from pydantic import BaseModel


class ReflectionBase(BaseModel):
    reflection_date: date
    good_things: str | None = None
    bad_things: str | None = None
    improvements: str | None = None
    delay_reasons: str | None = None
    memo: str | None = None


class ReflectionCreate(ReflectionBase):
    pass


class ReflectionUpdate(ReflectionBase):
    pass


class ReflectionResponse(ReflectionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
