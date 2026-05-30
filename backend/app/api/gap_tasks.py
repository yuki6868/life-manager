from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.gap_task import GapTask
from app.schemas.gap_task import (
    GapTaskCreate,
    GapTaskResponse,
    GapTaskStatusUpdate,
    GapTaskSuggestionResponse,
    GapTaskUpdate,
)

router = APIRouter(
    prefix="/gap-tasks",
    tags=["Gap Tasks"],
)

GAP_TASK_STATUSES = {"todo", "in_progress", "completed", "paused", "cancelled"}


PRIORITY_SCORE = {"high": 3, "medium": 2, "low": 1}


def get_priority_score(gap_task: GapTask) -> int:
    return PRIORITY_SCORE.get(gap_task.priority, 0)


def end_of_today(now: datetime) -> datetime:
    return datetime.combine(now.date() + timedelta(days=1), time.min)


def validate_gap_task_status(status: str) -> None:
    if status not in GAP_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid gap task status")


def apply_gap_task_payload(
    gap_task: GapTask,
    payload: GapTaskCreate | GapTaskUpdate,
) -> None:
    validate_gap_task_status(payload.status)

    gap_task.title = payload.title
    gap_task.description = payload.description
    gap_task.required_minutes = payload.required_minutes
    gap_task.priority = payload.priority
    gap_task.energy_level = payload.energy_level
    gap_task.status = payload.status


@router.get("/", response_model=list[GapTaskResponse])
async def get_gap_tasks(
    status: str | None = Query(default=None),
    max_minutes: int | None = Query(default=None, ge=1),
    energy_level: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(GapTask)

    if status is not None:
        validate_gap_task_status(status)
        query = query.where(GapTask.status == status)

    if max_minutes is not None:
        query = query.where(GapTask.required_minutes <= max_minutes)

    if energy_level is not None:
        query = query.where(GapTask.energy_level == energy_level)

    result = await db.execute(
        query.order_by(
            GapTask.status.asc(),
            GapTask.priority.desc(),
            GapTask.required_minutes.asc(),
            GapTask.id.desc(),
        )
    )
    return result.scalars().all()


@router.get("/suggestions/next-gap", response_model=GapTaskSuggestionResponse)
async def get_next_gap_task_suggestions(
    energy_level: str | None = Query(default=None),
    now: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """次の予定までに実行できるスキマタスクを返す。

    - 現在時刻から次の予定開始までの空き時間を計算する
    - required_minutes が空き時間以下のスキマタスクだけを抽出する
    - 優先度が高い順、必要時間が短い順に並べる
    """
    current_time = now or datetime.now()

    next_event_result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status != "cancelled")
        .where(CalendarEvent.start_time > current_time)
        .order_by(CalendarEvent.start_time.asc())
        .limit(1)
    )
    next_event = next_event_result.scalar_one_or_none()

    if next_event is None:
        next_event_start_time = None
        available_minutes = max(0, int((end_of_today(current_time) - current_time).total_seconds() // 60))
    else:
        next_event_start_time = next_event.start_time
        available_minutes = max(0, int((next_event.start_time - current_time).total_seconds() // 60))

    query = (
        select(GapTask)
        .where(GapTask.status.in_(["todo", "paused"]))
        .where(GapTask.required_minutes <= available_minutes)
    )

    if energy_level is not None:
        query = query.where(GapTask.energy_level == energy_level)

    gap_task_result = await db.execute(query)
    suggested_tasks = sorted(
        gap_task_result.scalars().all(),
        key=lambda gap_task: (
            -get_priority_score(gap_task),
            gap_task.required_minutes,
            -gap_task.id,
        ),
    )

    return GapTaskSuggestionResponse(
        available_minutes=available_minutes,
        next_event_id=next_event.id if next_event else None,
        next_event_title=next_event.title if next_event else None,
        next_event_start_time=next_event_start_time,
        suggested_tasks=suggested_tasks,
    )


@router.get("/{gap_task_id}", response_model=GapTaskResponse)
async def get_gap_task(
    gap_task_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GapTask).where(GapTask.id == gap_task_id)
    )
    gap_task = result.scalar_one_or_none()

    if gap_task is None:
        raise HTTPException(status_code=404, detail="Gap task not found")

    return gap_task


@router.post("/", response_model=GapTaskResponse)
async def create_gap_task(
    payload: GapTaskCreate,
    db: AsyncSession = Depends(get_db),
):
    validate_gap_task_status(payload.status)

    gap_task = GapTask(
        title=payload.title,
        description=payload.description,
        required_minutes=payload.required_minutes,
        priority=payload.priority,
        energy_level=payload.energy_level,
        status=payload.status,
    )

    db.add(gap_task)
    await db.commit()
    await db.refresh(gap_task)

    return gap_task


@router.put("/{gap_task_id}", response_model=GapTaskResponse)
async def update_gap_task(
    gap_task_id: int,
    payload: GapTaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GapTask).where(GapTask.id == gap_task_id)
    )
    gap_task = result.scalar_one_or_none()

    if gap_task is None:
        raise HTTPException(status_code=404, detail="Gap task not found")

    apply_gap_task_payload(gap_task, payload)

    await db.commit()
    await db.refresh(gap_task)

    return gap_task


@router.patch("/{gap_task_id}/status", response_model=GapTaskResponse)
async def update_gap_task_status(
    gap_task_id: int,
    payload: GapTaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    validate_gap_task_status(payload.status)

    result = await db.execute(
        select(GapTask).where(GapTask.id == gap_task_id)
    )
    gap_task = result.scalar_one_or_none()

    if gap_task is None:
        raise HTTPException(status_code=404, detail="Gap task not found")

    gap_task.status = payload.status

    await db.commit()
    await db.refresh(gap_task)

    return gap_task


@router.delete("/{gap_task_id}")
async def delete_gap_task(
    gap_task_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GapTask).where(GapTask.id == gap_task_id)
    )
    gap_task = result.scalar_one_or_none()

    if gap_task is None:
        raise HTTPException(status_code=404, detail="Gap task not found")

    await db.delete(gap_task)
    await db.commit()

    return {"message": "Gap task deleted"}
