from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.task import Task
from app.schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventResponse,
    CalendarEventUpdate,
    FrequentTaskResponse,
    ReusableCalendarTaskResponse,
)

router = APIRouter(
    prefix="/calendar-events",
    tags=["Calendar Events"],
)


def calculate_event_minutes(event: CalendarEvent) -> int:
    duration = event.end_time - event.start_time
    return max(15, int(duration.total_seconds() // 60))


def to_reusable_calendar_task(event: CalendarEvent) -> ReusableCalendarTaskResponse:
    return ReusableCalendarTaskResponse(
        source_event_id=event.id,
        task_id=event.task_id,
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        estimated_minutes=calculate_event_minutes(event),
    )


@router.get("/", response_model=list[CalendarEventResponse])
async def get_calendar_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CalendarEvent).order_by(CalendarEvent.start_time.asc())
    )
    return result.scalars().all()


@router.get("/frequent-tasks", response_model=list[FrequentTaskResponse])
async def get_frequent_tasks(
    limit: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """予定化された回数が多いタスクを返す。

    まだ作業ログがない段階なので、commit 014では calendar_events を
    「過去実績」として扱う。
    """
    result = await db.execute(
        select(
            CalendarEvent.task_id,
            CalendarEvent.title,
            CalendarEvent.description,
            Task.estimated_minutes,
            func.count(CalendarEvent.id).label("usage_count"),
            func.max(CalendarEvent.end_time).label("last_used_at"),
        )
        .outerjoin(Task, Task.id == CalendarEvent.task_id)
        .where(CalendarEvent.status != "cancelled")
        .group_by(
            CalendarEvent.task_id,
            CalendarEvent.title,
            CalendarEvent.description,
            Task.estimated_minutes,
        )
        .order_by(desc("usage_count"), desc("last_used_at"))
        .limit(limit)
    )

    frequent_tasks: list[FrequentTaskResponse] = []

    for row in result.all():
        task_id, title, description, estimated_minutes, usage_count, _ = row
        fallback_minutes = 60

        if estimated_minutes is None:
            event_result = await db.execute(
                select(CalendarEvent)
                .where(CalendarEvent.task_id.is_(None))
                .where(CalendarEvent.title == title)
                .order_by(CalendarEvent.end_time.desc())
                .limit(1)
            )
            event = event_result.scalar_one_or_none()
            fallback_minutes = calculate_event_minutes(event) if event else 60

        frequent_tasks.append(
            FrequentTaskResponse(
                task_id=task_id,
                title=title,
                description=description,
                estimated_minutes=estimated_minutes or fallback_minutes,
                usage_count=usage_count,
            )
        )

    return frequent_tasks


@router.get("/yesterday-tasks", response_model=list[ReusableCalendarTaskResponse])
async def get_yesterday_tasks(db: AsyncSession = Depends(get_db)):
    """昨日の予定を、今日へ再利用しやすい形で返す。"""
    yesterday = date.today() - timedelta(days=1)
    start_at = datetime.combine(yesterday, time.min)
    end_at = datetime.combine(yesterday + timedelta(days=1), time.min)

    result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status != "cancelled")
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
        .order_by(CalendarEvent.start_time.asc())
    )

    return [to_reusable_calendar_task(event) for event in result.scalars().all()]


@router.get("/recent-tasks", response_model=list[ReusableCalendarTaskResponse])
async def get_recent_tasks(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """最近予定に入れたタスクを、新しい順で返す。

    同じタスクIDがある場合は最新の1件だけにする。
    タスクIDがない予定は、タイトル単位で重複を避ける。
    """
    result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status != "cancelled")
        .order_by(CalendarEvent.start_time.desc())
        .limit(limit * 3)
    )

    events = result.scalars().all()
    reusable_tasks: list[ReusableCalendarTaskResponse] = []
    seen_keys: set[str] = set()

    for event in events:
        key = f"task:{event.task_id}" if event.task_id is not None else f"title:{event.title}"
        if key in seen_keys:
            continue

        seen_keys.add(key)
        reusable_tasks.append(to_reusable_calendar_task(event))

        if len(reusable_tasks) >= limit:
            break

    return reusable_tasks


@router.get("/{event_id}", response_model=CalendarEventResponse)
async def get_calendar_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    return event


@router.post("/", response_model=CalendarEventResponse)
async def create_calendar_event(
    payload: CalendarEventCreate,
    db: AsyncSession = Depends(get_db),
):
    if payload.end_time <= payload.start_time:
        raise HTTPException(
            status_code=400,
            detail="end_time must be after start_time",
        )

    if payload.task_id is not None:
        task_result = await db.execute(
            select(Task).where(Task.id == payload.task_id)
        )
        task = task_result.scalar_one_or_none()

        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")

    event = CalendarEvent(
        task_id=payload.task_id,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )

    db.add(event)
    await db.commit()
    await db.refresh(event)

    return event


@router.put("/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdate,
    db: AsyncSession = Depends(get_db),
):
    if payload.end_time <= payload.start_time:
        raise HTTPException(
            status_code=400,
            detail="end_time must be after start_time",
        )

    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    if payload.task_id is not None:
        task_result = await db.execute(
            select(Task).where(Task.id == payload.task_id)
        )
        task = task_result.scalar_one_or_none()

        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")

    event.task_id = payload.task_id
    event.title = payload.title
    event.description = payload.description
    event.start_time = payload.start_time
    event.end_time = payload.end_time
    event.status = payload.status

    await db.commit()
    await db.refresh(event)

    return event


@router.delete("/{event_id}")
async def delete_calendar_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    await db.delete(event)
    await db.commit()

    return {"message": "Calendar event deleted"}
