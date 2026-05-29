from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.work_log import WorkLog
from app.schemas.dashboard import TodaySummaryResponse

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


def get_today_range() -> tuple[datetime, datetime]:
    today = date.today()
    start_at = datetime.combine(today, time.min)
    end_at = datetime.combine(today + timedelta(days=1), time.min)
    return start_at, end_at


@router.get("/today-summary", response_model=TodaySummaryResponse)
async def get_today_summary(db: AsyncSession = Depends(get_db)):
    start_at, end_at = get_today_range()

    planned_result = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    (
                        func.strftime("%s", CalendarEvent.end_time)
                        - func.strftime("%s", CalendarEvent.start_time)
                    ) / 60
                ),
                0,
            )
        )
        .where(CalendarEvent.status != "cancelled")
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
    )
    planned_minutes = int(planned_result.scalar_one() or 0)

    actual_result = await db.execute(
        select(func.coalesce(func.sum(WorkLog.duration_minutes), 0))
        .where(WorkLog.started_at >= start_at)
        .where(WorkLog.started_at < end_at)
    )
    actual_minutes = int(actual_result.scalar_one() or 0)

    incomplete_result = await db.execute(
        select(func.count(CalendarEvent.id))
        .where(CalendarEvent.status.notin_(["completed", "cancelled"]))
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
    )
    incomplete_events_count = int(incomplete_result.scalar_one() or 0)

    achievement_rate = 0.0
    if planned_minutes > 0:
        achievement_rate = round((actual_minutes / planned_minutes) * 100, 1)

    return TodaySummaryResponse(
        planned_minutes=planned_minutes,
        actual_minutes=actual_minutes,
        achievement_rate=achievement_rate,
        incomplete_events_count=incomplete_events_count,
    )
