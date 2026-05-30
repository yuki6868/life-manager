from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.task import Task
from app.schemas.assistant import AssistantSuggestionResponse, AssistantSuggestionsResponse
from app.services.assistant_rules import (
    AssistantSuggestion,
    AssistantTimeSlot,
    HighPriorityTaskCandidate,
    build_morning_suggestions,
)

router = APIRouter(
    prefix="/assistant",
    tags=["Assistant"],
)

ACTIVE_TASK_STATUSES = {"todo", "in_progress", "paused", "active", "doing"}


def get_today_range() -> tuple[datetime, datetime]:
    today = date.today()
    start_at = datetime.combine(today, time.min)
    end_at = datetime.combine(today + timedelta(days=1), time.min)
    return start_at, end_at


def to_response(suggestion: AssistantSuggestion) -> AssistantSuggestionResponse:
    return AssistantSuggestionResponse(
        id=suggestion.id,
        suggestion_type=suggestion.suggestion_type.value,
        title=suggestion.title,
        message=suggestion.message,
        priority=suggestion.priority,
        action_label=suggestion.action_label,
        action_target=suggestion.action_target,
        metadata=suggestion.metadata or {},
    )


@router.get("/morning-suggestions", response_model=AssistantSuggestionsResponse)
async def get_morning_suggestions(db: AsyncSession = Depends(get_db)):
    """朝に見る想定の秘書提案を返す。"""
    start_at, end_at = get_today_range()

    today_events_result = await db.execute(
        select(CalendarEvent.id)
        .where(CalendarEvent.status != "cancelled")
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
        .limit(1)
    )
    has_today_events = today_events_result.scalar_one_or_none() is not None

    high_priority_result = await db.execute(
        select(Task)
        .where(Task.priority == "high")
        .where(Task.status.in_(ACTIVE_TASK_STATUSES))
        .order_by(
            func.coalesce(Task.importance, 0).desc(),
            func.coalesce(Task.urgency, 0).desc(),
            Task.id.desc(),
        )
        .limit(5)
    )
    high_priority_tasks = [
        HighPriorityTaskCandidate(
            id=task.id,
            title=task.title,
            estimated_minutes=task.estimated_minutes,
            status=task.status,
            urgency=task.urgency,
            importance=task.importance,
        )
        for task in high_priority_result.scalars().all()
    ]

    suggestions = build_morning_suggestions(
        has_today_events=has_today_events,
        high_priority_tasks=high_priority_tasks,
        include_gmail_check=True,
    )

    return AssistantSuggestionsResponse(
        slot=AssistantTimeSlot.MORNING.value,
        suggestions=[to_response(suggestion) for suggestion in suggestions],
    )
