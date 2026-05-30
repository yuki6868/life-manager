from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WorkLog(Base):
    __tablename__ = "work_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id"),
        nullable=True,
    )

    calendar_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("calendar_events.id"),
        nullable=True,
    )

    gap_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("gap_tasks.id"),
        nullable=True,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    duration_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    task = relationship("Task")
    calendar_event = relationship("CalendarEvent")
    gap_task = relationship("GapTask")
