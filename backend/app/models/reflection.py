from datetime import date, datetime

from sqlalchemy import Date, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Reflection(Base):
    __tablename__ = "reflections"
    __table_args__ = (
        UniqueConstraint("reflection_date", name="uq_reflections_reflection_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    reflection_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    good_things: Mapped[str | None] = mapped_column(Text, nullable=True)

    bad_things: Mapped[str | None] = mapped_column(Text, nullable=True)

    improvements: Mapped[str | None] = mapped_column(Text, nullable=True)

    delay_reasons: Mapped[str | None] = mapped_column(Text, nullable=True)

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
