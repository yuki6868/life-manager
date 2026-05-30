from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.gap_task import GapTask
from app.models.task import Task
from app.schemas.assistant import AssistantSuggestionResponse, AssistantSuggestionsResponse
from app.services.assistant_rules import (
    AssistantSuggestion,
    AssistantTimeSlot,
    CalendarEventCandidate,
    GapTaskCandidate,
    HighPriorityTaskCandidate,
    build_daytime_suggestions,
    build_morning_suggestions,
)

router = APIRouter(
    prefix="/assistant",
    tags=["Assistant"],
)

ACTIVE_TASK_STATUSES = {"todo", "in_progress", "paused", "active", "doing"}
INCOMPLETE_EVENT_STATUSES = {"scheduled", "in_progress", "paused"}
GAP_TASK_ACTIVE_STATUSES = {"todo", "paused"}
PRIORITY_SCORE = {"high": 3, "medium": 2, "low": 1}


def get_today_range(now: datetime | None = None) -> tuple[datetime, datetime]:
    today = (now or datetime.now()).date()
    start_at = datetime.combine(today, time.min)
    end_at = datetime.combine(today + timedelta(days=1), time.min)
    return start_at, end_at


def end_of_today(now: datetime) -> datetime:
    return datetime.combine(now.date() + timedelta(days=1), time.min)


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


def to_calendar_event_candidate(event: CalendarEvent) -> CalendarEventCandidate:
    return CalendarEventCandidate(
        id=event.id,
        title=event.title,
        start_at=event.start_time,
        end_at=event.end_time,
        status=event.status,
    )


def to_gap_task_candidate(gap_task: GapTask) -> GapTaskCandidate:
    return GapTaskCandidate(
        id=gap_task.id,
        title=gap_task.title,
        required_minutes=gap_task.required_minutes,
        priority=gap_task.priority,
        energy_level=gap_task.energy_level,
        status=gap_task.status,
    )


def get_priority_score(priority: str) -> int:
    return PRIORITY_SCORE.get(priority, 0)


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


@router.get("/daytime-suggestions", response_model=AssistantSuggestionsResponse)
async def get_daytime_suggestions(
    now: datetime | None = Query(default=None),
    energy_level: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """昼に見る想定の秘書提案を返す。

    - 開始時刻を過ぎた未着手予定をチェックする
    - 終了時刻を過ぎた遅延予定をチェックする
    - 次の予定までに実行できるスキマタスクを優先度順に返す
    """
    current_time = now or datetime.now()
    start_at, end_at = get_today_range(current_time)

    unstarted_result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status.in_(INCOMPLETE_EVENT_STATUSES))
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time <= current_time)
        .where(CalendarEvent.end_time > current_time)
        .order_by(CalendarEvent.start_time.asc())
        .limit(5)
    )
    unstarted_events = [
        to_calendar_event_candidate(event)
        for event in unstarted_result.scalars().all()
    ]

    delayed_result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status.in_(INCOMPLETE_EVENT_STATUSES))
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
        .where(CalendarEvent.end_time <= current_time)
        .order_by(CalendarEvent.end_time.asc())
        .limit(5)
    )
    delayed_events = [
        to_calendar_event_candidate(event)
        for event in delayed_result.scalars().all()
    ]

    next_event_result = await db.execute(
        select(CalendarEvent)
        .where(CalendarEvent.status != "cancelled")
        .where(CalendarEvent.start_time > current_time)
        .order_by(CalendarEvent.start_time.asc())
        .limit(1)
    )
    next_event = next_event_result.scalar_one_or_none()
    next_event_candidate = (
        to_calendar_event_candidate(next_event) if next_event is not None else None
    )

    if next_event is None:
        available_minutes = max(
            0,
            int((end_of_today(current_time) - current_time).total_seconds() // 60),
        )
    else:
        available_minutes = max(
            0,
            int((next_event.start_time - current_time).total_seconds() // 60),
        )

    gap_task_query = (
        select(GapTask)
        .where(GapTask.status.in_(GAP_TASK_ACTIVE_STATUSES))
        .where(GapTask.required_minutes <= available_minutes)
    )
    if energy_level is not None:
        gap_task_query = gap_task_query.where(GapTask.energy_level == energy_level)

    gap_task_result = await db.execute(gap_task_query)
    gap_tasks = sorted(
        [to_gap_task_candidate(gap_task) for gap_task in gap_task_result.scalars().all()],
        key=lambda gap_task: (
            -get_priority_score(gap_task.priority),
            gap_task.required_minutes,
            -gap_task.id,
        ),
    )[:5]

    suggestions = build_daytime_suggestions(
        unstarted_events=unstarted_events,
        delayed_events=delayed_events,
        available_minutes=available_minutes,
        gap_tasks=gap_tasks,
        next_event=next_event_candidate,
    )

    return AssistantSuggestionsResponse(
        slot=AssistantTimeSlot.DAYTIME.value,
        suggestions=[to_response(suggestion) for suggestion in suggestions],
    )
