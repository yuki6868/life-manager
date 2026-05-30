from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.project import Project
from app.models.task import Task
from app.models.work_log import WorkLog
from app.schemas.dashboard import (
    MonthlyActualResponse,
    ProjectTimeAllocationResponse,
    TodaySummaryResponse,
    UrgentInterruptionReasonResponse,
    UrgentTaskAnalysisResponse,
    WeeklyActualResponse,
)

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


def get_today_range() -> tuple[datetime, datetime]:
    today = date.today()
    start_at = datetime.combine(today, time.min)
    end_at = datetime.combine(today + timedelta(days=1), time.min)
    return start_at, end_at


def get_week_start(target_date: date) -> date:
    return target_date - timedelta(days=target_date.weekday())


def to_datetime_start(target_date: date) -> datetime:
    return datetime.combine(target_date, time.min)


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


@router.get("/weekly-actuals", response_model=list[WeeklyActualResponse])
async def get_weekly_actuals(
    weeks: int = 8,
    db: AsyncSession = Depends(get_db),
):
    weeks = max(1, min(weeks, 52))
    this_week_start = get_week_start(date.today())
    start_date = this_week_start - timedelta(weeks=weeks - 1)
    start_at = to_datetime_start(start_date)

    weekday_offset = (cast(func.strftime("%w", WorkLog.started_at), Integer) + 6) % 7
    week_start_expr = func.date(
        WorkLog.started_at,
        func.printf("-%d days", weekday_offset),
    )

    result = await db.execute(
        select(
            week_start_expr.label("week_start"),
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).label("actual_minutes"),
        )
        .where(WorkLog.started_at >= start_at)
        .group_by(week_start_expr)
        .order_by(week_start_expr)
    )

    actual_minutes_by_week = {
        row.week_start: int(row.actual_minutes or 0)
        for row in result.all()
    }

    responses: list[WeeklyActualResponse] = []
    for index in range(weeks):
        week_start = start_date + timedelta(weeks=index)
        week_end = week_start + timedelta(days=6)
        week_key = week_start.isoformat()
        responses.append(
            WeeklyActualResponse(
                week_start=week_key,
                week_end=week_end.isoformat(),
                actual_minutes=actual_minutes_by_week.get(week_key, 0),
            )
        )

    return responses


@router.get("/monthly-actuals", response_model=list[MonthlyActualResponse])
async def get_monthly_actuals(
    months: int = 6,
    db: AsyncSession = Depends(get_db),
):
    months = max(1, min(months, 36))
    today = date.today()
    first_day_this_month = today.replace(day=1)

    month_starts: list[date] = []
    year = first_day_this_month.year
    month = first_day_this_month.month
    for _ in range(months):
        month_starts.append(date(year, month, 1))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    month_starts.reverse()

    start_at = to_datetime_start(month_starts[0])

    result = await db.execute(
        select(
            func.strftime("%Y-%m", WorkLog.started_at).label("month"),
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).label("actual_minutes"),
        )
        .where(WorkLog.started_at >= start_at)
        .group_by("month")
        .order_by("month")
    )

    actual_minutes_by_month = {
        row.month: int(row.actual_minutes or 0)
        for row in result.all()
    }

    return [
        MonthlyActualResponse(
            month=month_start.strftime("%Y-%m"),
            actual_minutes=actual_minutes_by_month.get(month_start.strftime("%Y-%m"), 0),
        )
        for month_start in month_starts
    ]


@router.get(
    "/project-time-allocation",
    response_model=list[ProjectTimeAllocationResponse],
)
async def get_project_time_allocation(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    days = max(1, min(days, 366))
    start_at = to_datetime_start(date.today() - timedelta(days=days - 1))

    result = await db.execute(
        select(
            Project.id.label("project_id"),
            Project.title.label("project_title"),
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).label("actual_minutes"),
        )
        .select_from(WorkLog)
        .join(Task, WorkLog.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .where(WorkLog.started_at >= start_at)
        .group_by(Project.id, Project.title)
        .order_by(func.sum(WorkLog.duration_minutes).desc(), Project.id.desc())
    )

    rows = result.all()
    total_minutes = sum(int(row.actual_minutes or 0) for row in rows)

    return [
        ProjectTimeAllocationResponse(
            project_id=row.project_id,
            project_title=row.project_title,
            actual_minutes=int(row.actual_minutes or 0),
            percentage=(
                round((int(row.actual_minutes or 0) / total_minutes) * 100, 1)
                if total_minutes > 0
                else 0.0
            ),
        )
        for row in rows
    ]


@router.get("/urgent-task-analysis", response_model=UrgentTaskAnalysisResponse)
async def get_urgent_task_analysis(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    days = max(1, min(days, 366))
    start_at = to_datetime_start(date.today() - timedelta(days=days - 1))

    urgent_task_count_result = await db.execute(
        select(func.count(Task.id))
        .where(Task.task_type == "urgent")
        .where(func.coalesce(Task.occurred_at, Task.created_at) >= start_at)
    )
    urgent_task_count = int(urgent_task_count_result.scalar_one() or 0)

    active_urgent_task_count_result = await db.execute(
        select(func.count(Task.id))
        .where(Task.task_type == "urgent")
        .where(func.coalesce(Task.occurred_at, Task.created_at) >= start_at)
        .where(Task.status.notin_(["completed", "cancelled", "archived"]))
    )
    active_urgent_task_count = int(active_urgent_task_count_result.scalar_one() or 0)

    completed_urgent_task_count_result = await db.execute(
        select(func.count(Task.id))
        .where(Task.task_type == "urgent")
        .where(func.coalesce(Task.occurred_at, Task.created_at) >= start_at)
        .where(Task.status == "completed")
    )
    completed_urgent_task_count = int(completed_urgent_task_count_result.scalar_one() or 0)

    urgent_work_log_result = await db.execute(
        select(
            func.count(WorkLog.id).label("work_log_count"),
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).label("actual_minutes"),
        )
        .select_from(WorkLog)
        .join(Task, WorkLog.task_id == Task.id)
        .where(Task.task_type == "urgent")
        .where(WorkLog.started_at >= start_at)
    )
    urgent_work_log_row = urgent_work_log_result.one()
    urgent_work_log_count = int(urgent_work_log_row.work_log_count or 0)
    urgent_actual_minutes = int(urgent_work_log_row.actual_minutes or 0)

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
    )
    planned_minutes = int(planned_result.scalar_one() or 0)
    plan_collapse_rate = (
        round((urgent_actual_minutes / planned_minutes) * 100, 1)
        if planned_minutes > 0
        else 0.0
    )

    reason_label = func.coalesce(
        func.nullif(Task.interruption_reason, ""),
        "理由未入力",
    )
    reason_result = await db.execute(
        select(
            reason_label.label("reason"),
            func.count(func.distinct(Task.id)).label("urgent_task_count"),
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).label("actual_minutes"),
        )
        .select_from(Task)
        .outerjoin(WorkLog, WorkLog.task_id == Task.id)
        .where(Task.task_type == "urgent")
        .where(func.coalesce(Task.occurred_at, Task.created_at) >= start_at)
        .group_by(reason_label)
        .order_by(
            func.coalesce(func.sum(WorkLog.duration_minutes), 0).desc(),
            func.count(func.distinct(Task.id)).desc(),
        )
        .limit(5)
    )

    interruption_reasons = [
        UrgentInterruptionReasonResponse(
            reason=row.reason,
            urgent_task_count=int(row.urgent_task_count or 0),
            actual_minutes=int(row.actual_minutes or 0),
        )
        for row in reason_result.all()
    ]

    return UrgentTaskAnalysisResponse(
        days=days,
        urgent_task_count=urgent_task_count,
        urgent_work_log_count=urgent_work_log_count,
        urgent_actual_minutes=urgent_actual_minutes,
        planned_minutes=planned_minutes,
        plan_collapse_rate=plan_collapse_rate,
        active_urgent_task_count=active_urgent_task_count,
        completed_urgent_task_count=completed_urgent_task_count,
        interruption_reasons=interruption_reasons,
    )
