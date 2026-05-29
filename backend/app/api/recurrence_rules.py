from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.recurrence_rule import RecurrenceRule
from app.models.task import Task
from app.schemas.recurrence_rule import (
    RecurrenceGenerateResponse,
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




def should_generate_on_date(rule: RecurrenceRule, target_date: date) -> bool:
    if rule.frequency == "daily":
        return True

    if rule.frequency == "weekday":
        return target_date.weekday() < 5

    if rule.frequency == "weekly":
        return rule.weekday == target_date.weekday()

    return False


@router.post("/generate", response_model=RecurrenceGenerateResponse)
async def generate_recurring_events(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """有効な繰り返しルールから、今日以降の予定を自動生成する。

    commit 017では、今日から指定日数分の calendar_events を作成する。
    同じタイトル・開始時刻の予定がすでにある場合は、重複作成しない。
    """
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.is_active == True)
    )
    rules = result.scalars().all()

    today = date.today()
    generated_count = 0
    skipped_count = 0

    for day_offset in range(days):
        target_date = today + timedelta(days=day_offset)

        for rule in rules:
            if not should_generate_on_date(rule, target_date):
                continue

            start_at = datetime.combine(target_date, rule.start_time)
            end_at = start_at + timedelta(minutes=rule.duration_minutes)

            exists_result = await db.execute(
                select(CalendarEvent).where(
                    CalendarEvent.title == rule.title,
                    CalendarEvent.start_time == start_at,
                )
            )
            exists = exists_result.scalar_one_or_none()

            if exists is not None:
                skipped_count += 1
                continue

            db.add(
                CalendarEvent(
                    task_id=rule.task_id,
                    title=rule.title,
                    description=rule.description,
                    start_time=start_at,
                    end_time=end_at,
                    status="scheduled",
                )
            )
            generated_count += 1

    await db.commit()

    return RecurrenceGenerateResponse(
        generated_count=generated_count,
        skipped_count=skipped_count,
        target_days=days,
    )


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
