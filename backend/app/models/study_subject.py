from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class StudySubject(Base):
    __tablename__ = "study_subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    exam_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    target_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    study_logs = relationship("StudyLog", back_populates="subject")
