from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.task import Task
from app.models.work_log import WorkLog
from app.schemas.work_log import WorkLogCreate, WorkLogResponse

router = APIRouter(
    prefix="/work-logs",
    tags=["Work Logs"],
)


def calculate_duration_minutes(started_at, ended_at) -> int:
    duration = ended_at - started_at
    minutes = int(duration.total_seconds() // 60)

    if minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail="ended_at must be after started_at",
        )

    return minutes


async def validate_task_exists(task_id: int | None, db: AsyncSession) -> None:
    if task_id is None:
        return

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")


async def validate_calendar_event_exists(
    calendar_event_id: int | None,
    db: AsyncSession,
) -> None:
    if calendar_event_id is None:
        return

    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == calendar_event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")


@router.get("/", response_model=list[WorkLogResponse])
async def get_work_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkLog).order_by(WorkLog.started_at.desc(), WorkLog.id.desc())
    )
    return result.scalars().all()


@router.get("/{work_log_id}", response_model=WorkLogResponse)
async def get_work_log(
    work_log_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WorkLog).where(WorkLog.id == work_log_id))
    work_log = result.scalar_one_or_none()

    if work_log is None:
        raise HTTPException(status_code=404, detail="Work log not found")

    return work_log


@router.post("/", response_model=WorkLogResponse)
async def create_work_log(
    payload: WorkLogCreate,
    db: AsyncSession = Depends(get_db),
):
    await validate_task_exists(payload.task_id, db)
    await validate_calendar_event_exists(payload.calendar_event_id, db)

    duration_minutes = calculate_duration_minutes(
        payload.started_at,
        payload.ended_at,
    )

    work_log = WorkLog(
        task_id=payload.task_id,
        calendar_event_id=payload.calendar_event_id,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_minutes=duration_minutes,
        memo=payload.memo,
    )

    db.add(work_log)
    await db.commit()
    await db.refresh(work_log)

    return work_log


@router.delete("/{work_log_id}")
async def delete_work_log(
    work_log_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WorkLog).where(WorkLog.id == work_log_id))
    work_log = result.scalar_one_or_none()

    if work_log is None:
        raise HTTPException(status_code=404, detail="Work log not found")

    await db.delete(work_log)
    await db.commit()

    return {"message": "Work log deleted"}
