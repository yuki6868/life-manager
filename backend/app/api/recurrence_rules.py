from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.recurrence_rule import RecurrenceRule
from app.models.task import Task
from app.schemas.recurrence_rule import (
    RecurrenceRuleCreate,
    RecurrenceRuleResponse,
    RecurrenceRuleUpdate,
)

router = APIRouter(
    prefix="/recurrence-rules",
    tags=["Recurrence Rules"],
)

ALLOWED_FREQUENCIES = {"daily", "weekday", "weekly"}


def validate_recurrence_rule_payload(
    payload: RecurrenceRuleCreate | RecurrenceRuleUpdate,
) -> None:
    if payload.frequency not in ALLOWED_FREQUENCIES:
        raise HTTPException(
            status_code=400,
            detail="frequency must be daily, weekday, or weekly",
        )

    if payload.frequency == "weekly":
        if payload.weekday is None or payload.weekday < 0 or payload.weekday > 6:
            raise HTTPException(
                status_code=400,
                detail="weekday must be 0-6 when frequency is weekly",
            )
    elif payload.weekday is not None and (payload.weekday < 0 or payload.weekday > 6):
        raise HTTPException(
            status_code=400,
            detail="weekday must be 0-6",
        )

    if payload.duration_minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail="duration_minutes must be greater than 0",
        )


async def validate_task_exists(task_id: int | None, db: AsyncSession) -> None:
    if task_id is None:
        return

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")


@router.get("/", response_model=list[RecurrenceRuleResponse])
async def get_recurrence_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RecurrenceRule).order_by(RecurrenceRule.id.desc())
    )
    return result.scalars().all()


@router.get("/{rule_id}", response_model=RecurrenceRuleResponse)
async def get_recurrence_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if rule is None:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")

    return rule


@router.post("/", response_model=RecurrenceRuleResponse)
async def create_recurrence_rule(
    payload: RecurrenceRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    validate_recurrence_rule_payload(payload)
    await validate_task_exists(payload.task_id, db)

    rule = RecurrenceRule(
        task_id=payload.task_id,
        title=payload.title,
        description=payload.description,
        frequency=payload.frequency,
        weekday=payload.weekday,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        is_active=payload.is_active,
    )

    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    return rule


@router.put("/{rule_id}", response_model=RecurrenceRuleResponse)
async def update_recurrence_rule(
    rule_id: int,
    payload: RecurrenceRuleUpdate,
    db: AsyncSession = Depends(get_db),
):
    validate_recurrence_rule_payload(payload)
    await validate_task_exists(payload.task_id, db)

    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if rule is None:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")

    rule.task_id = payload.task_id
    rule.title = payload.title
    rule.description = payload.description
    rule.frequency = payload.frequency
    rule.weekday = payload.weekday
    rule.start_time = payload.start_time
    rule.duration_minutes = payload.duration_minutes
    rule.is_active = payload.is_active

    await db.commit()
    await db.refresh(rule)

    return rule


@router.delete("/{rule_id}")
async def delete_recurrence_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if rule is None:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")

    await db.delete(rule)
    await db.commit()

    return {"message": "Recurrence rule deleted"}
