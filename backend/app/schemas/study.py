from datetime import date, datetime

from pydantic import BaseModel, Field


class StudyCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_minutes: int = 0
    memo: str | None = None


class StudyCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_minutes: int | None = None
    memo: str | None = None


class StudyCategoryResponse(BaseModel):
    id: int
    name: str
    target_minutes: int
    memo: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudySubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category_id: int | None = None
    exam_name: str | None = None
    target_minutes: int = 0
    color: str | None = None
    memo: str | None = None


class StudySubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category_id: int | None = None
    exam_name: str | None = None
    target_minutes: int | None = None
    color: str | None = None
    memo: str | None = None


class StudySubjectResponse(BaseModel):
    id: int
    name: str
    category_id: int | None
    category_name: str | None = None
    exam_name: str | None
    target_minutes: int
    color: str | None
    memo: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudyLogCreate(BaseModel):
    subject_id: int
    studied_on: date
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int
    material: str | None = None
    unit: str | None = None
    method: str | None = None
    understanding: int | None = None
    memo: str | None = None


class StudyLogUpdate(BaseModel):
    subject_id: int | None = None
    studied_on: date | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int | None = None
    material: str | None = None
    unit: str | None = None
    method: str | None = None
    understanding: int | None = None
    memo: str | None = None


class StudyLogResponse(BaseModel):
    id: int
    subject_id: int
    subject_name: str
    category_id: int | None = None
    category_name: str | None = None
    studied_on: date
    started_at: datetime | None
    ended_at: datetime | None
    duration_minutes: int
    material: str | None
    unit: str | None
    method: str | None
    understanding: int | None
    memo: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudySubjectSummary(BaseModel):
    subject_id: int
    subject_name: str
    category_id: int | None = None
    category_name: str | None = None
    exam_name: str | None
    target_minutes: int
    total_minutes: int
    log_count: int


class StudyCategorySummary(BaseModel):
    category_id: int | None
    category_name: str
    target_minutes: int
    subject_target_minutes: int
    effective_target_minutes: int
    total_minutes: int
    log_count: int
    subject_count: int


class StudyDailySummary(BaseModel):
    studied_on: date
    total_minutes: int


class StudySummaryResponse(BaseModel):
    total_minutes: int
    total_logs: int
    subject_target_minutes: int
    category_target_minutes: int
    effective_target_minutes: int
    category_summaries: list[StudyCategorySummary]
    subject_summaries: list[StudySubjectSummary]
    daily_summaries: list[StudyDailySummary]
