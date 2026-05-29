from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ProjectReflection(Base):
    __tablename__ = "project_reflections"
    __table_args__ = (
        UniqueConstraint("project_id", name="uq_project_reflections_project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    estimated_minutes: Mapped[int] = mapped_column(default=0)
    actual_minutes: Mapped[int] = mapped_column(default=0)
    difference_minutes: Mapped[int] = mapped_column(default=0)

    difference_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_improvement: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    project = relationship("Project", back_populates="completion_reflection")
