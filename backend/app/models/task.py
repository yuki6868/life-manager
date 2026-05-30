from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    priority: Mapped[str] = mapped_column(
        String(20),
        default="medium",
    )

    estimated_minutes: Mapped[int] = mapped_column(default=0)

    actual_minutes: Mapped[int] = mapped_column(default=0)

    energy_level: Mapped[str] = mapped_column(
        String(20),
        default="medium",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="todo",
    )

    task_type: Mapped[str] = mapped_column(
        String(20),
        default="normal",
    )

    urgency: Mapped[int | None] = mapped_column(Integer, nullable=True)

    importance: Mapped[int | None] = mapped_column(Integer, nullable=True)

    occurred_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    interruption_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    project = relationship(
        "Project",
        back_populates="tasks",
    )