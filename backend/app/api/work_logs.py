from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.project import Project
from app.models.task import Task
from app.models.work_log import WorkLog
from app.schemas.work_log import WorkLogCreate, WorkLogResponse

router = APIRouter(
    prefix="/work-logs",
    tags=["Work Logs"],
)


def calculate_duration_minutes(payload: WorkLogCreate) -> int:
    if payload.duration_minutes is not None:
        if payload.duration_minutes <= 0:
            raise HTTPException(
                status_code=400,
                detail="duration_minutes must be greater than 0",
            )
        return payload.duration_minutes

    duration = payload.ended_at - payload.started_at
    minutes = int(duration.total_seconds() // 60)

    if minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail="ended_at must be after started_at",
        )

    return minutes


async def get_task_or_none(task_id: int | None, db: AsyncSession) -> Task | None:
    if task_id is None:
        return None

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return task


async def get_calendar_event_or_none(
    calendar_event_id: int | None,
    db: AsyncSession,
) -> CalendarEvent | None:
    if calendar_event_id is None:
        return None

    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == calendar_event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    return event


def calculate_planned_minutes(event: CalendarEvent | None) -> int | None:
    if event is None:
        return None

    duration = event.end_time - event.start_time
    return max(0, int(duration.total_seconds() // 60))


def build_work_log_response(
    work_log: WorkLog,
    event: CalendarEvent | None = None,
) -> WorkLogResponse:
    planned_minutes = calculate_planned_minutes(event)
    actual_minutes = work_log.duration_minutes

    return WorkLogResponse(
        id=work_log.id,
        task_id=work_log.task_id,
        calendar_event_id=work_log.calendar_event_id,
        started_at=work_log.started_at,
        ended_at=work_log.ended_at,
        duration_minutes=work_log.duration_minutes,
        memo=work_log.memo,
        planned_minutes=planned_minutes,
        actual_minutes=actual_minutes,
        difference_minutes=(
            actual_minutes - planned_minutes
            if planned_minutes is not None
            else None
        ),
        calendar_event_status=event.status if event is not None else None,
    )


async def get_event_for_work_log(
    work_log: WorkLog,
    db: AsyncSession,
) -> CalendarEvent | None:
    if work_log.calendar_event_id is None:
        return None

    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == work_log.calendar_event_id)
    )
    return result.scalar_one_or_none()


async def update_calendar_event_status_after_create(
    event: CalendarEvent | None,
) -> None:
    if event is None:
        return

    event.status = "completed"


async def update_calendar_event_status_after_delete(
    work_log: WorkLog,
    db: AsyncSession,
) -> None:
    if work_log.calendar_event_id is None:
        return

    count_result = await db.execute(
        select(func.count(WorkLog.id)).where(
            WorkLog.calendar_event_id == work_log.calendar_event_id,
            WorkLog.id != work_log.id,
        )
    )
    remaining_count = count_result.scalar_one()

    if remaining_count > 0:
        return

    event = await get_event_for_work_log(work_log, db)
    if event is not None:
        event.status = "scheduled"


async def add_actual_minutes_to_task_and_project(
    task: Task | None,
    duration_minutes: int,
    db: AsyncSession,
) -> None:
    if task is None:
        return

    task.actual_minutes = (task.actual_minutes or 0) + duration_minutes

    result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = result.scalar_one_or_none()

    if project is not None:
        project.actual_minutes = (project.actual_minutes or 0) + duration_minutes


async def subtract_actual_minutes_from_task_and_project(
    work_log: WorkLog,
    db: AsyncSession,
) -> None:
    if work_log.task_id is None:
        return

    result = await db.execute(select(Task).where(Task.id == work_log.task_id))
    task = result.scalar_one_or_none()

    if task is None:
        return

    task.actual_minutes = max(0, (task.actual_minutes or 0) - work_log.duration_minutes)

    project_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = project_result.scalar_one_or_none()

    if project is not None:
        project.actual_minutes = max(
            0,
            (project.actual_minutes or 0) - work_log.duration_minutes,
        )


@router.get("/", response_model=list[WorkLogResponse])
async def get_work_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkLog).order_by(WorkLog.started_at.desc(), WorkLog.id.desc())
    )
    work_logs = result.scalars().all()
    responses: list[WorkLogResponse] = []

    for work_log in work_logs:
        event = await get_event_for_work_log(work_log, db)
        responses.append(build_work_log_response(work_log, event))

    return responses


@router.get("/{work_log_id}", response_model=WorkLogResponse)
async def get_work_log(
    work_log_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WorkLog).where(WorkLog.id == work_log_id))
    work_log = result.scalar_one_or_none()

    if work_log is None:
        raise HTTPException(status_code=404, detail="Work log not found")

    event = await get_event_for_work_log(work_log, db)
    return build_work_log_response(work_log, event)


@router.post("/", response_model=WorkLogResponse)
async def create_work_log(
    payload: WorkLogCreate,
    db: AsyncSession = Depends(get_db),
):
    event = await get_calendar_event_or_none(payload.calendar_event_id, db)
    task_id = payload.task_id

    if task_id is None and event is not None:
        task_id = event.task_id

    task = await get_task_or_none(task_id, db)

    duration_minutes = calculate_duration_minutes(payload)

    work_log = WorkLog(
        task_id=task_id,
        calendar_event_id=payload.calendar_event_id,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_minutes=duration_minutes,
        memo=payload.memo,
    )

    db.add(work_log)
    await add_actual_minutes_to_task_and_project(task, duration_minutes, db)
    await update_calendar_event_status_after_create(event)

    await db.commit()
    await db.refresh(work_log)

    return build_work_log_response(work_log, event)


@router.delete("/{work_log_id}")
async def delete_work_log(
    work_log_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WorkLog).where(WorkLog.id == work_log_id))
    work_log = result.scalar_one_or_none()

    if work_log is None:
        raise HTTPException(status_code=404, detail="Work log not found")

    await subtract_actual_minutes_from_task_and_project(work_log, db)
    await update_calendar_event_status_after_delete(work_log, db)
    await db.delete(work_log)
    await db.commit()

    return {"message": "Work log deleted"}
