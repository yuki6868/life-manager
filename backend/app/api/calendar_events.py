from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.task import Task
from app.schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventResponse,
    CalendarEventUpdate,
)

router = APIRouter(
    prefix="/calendar-events",
    tags=["Calendar Events"],
)


@router.get("/", response_model=list[CalendarEventResponse])
async def get_calendar_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CalendarEvent).order_by(CalendarEvent.start_time.asc())
    )
    return result.scalars().all()


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