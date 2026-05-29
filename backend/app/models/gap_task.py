from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GapTask(Base):
    __tablename__ = "gap_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    required_minutes: Mapped[int] = mapped_column(default=15)

    priority: Mapped[str] = mapped_column(
        String(20),
        default="medium",
    )

    energy_level: Mapped[str] = mapped_column(
        String(20),
        default="medium",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="todo",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
