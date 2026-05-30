from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.gap_task import GapTask
from app.models.reflection import Reflection
from app.models.task import Task
from app.models.work_log import WorkLog
from app.schemas.assistant import AssistantSuggestionResponse, AssistantSuggestionsResponse
from app.services.assistant_rules import (
    AssistantSuggestion,
    AssistantSuggestionType,
    AssistantTimeSlot,
    CalendarEventCandidate,
    GapTaskCandidate,
    HighPriorityTaskCandidate,
    TodayProgressSnapshot,
    build_daytime_suggestions,
    build_morning_suggestions,
    build_night_suggestions,
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


@router.get("/night-suggestions", response_model=AssistantSuggestionsResponse)
async def get_night_suggestions(
    now: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """夜に見る想定の秘書提案を返す。

    - 今日の予定時間・実績時間・達成率を表示する
    - 未完了予定を明日に移す候補として提示する
    - 日次振り返りが未作成なら作成を促す
    """
    current_time = now or datetime.now()
    start_at, end_at = get_today_range(current_time)

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
        select(CalendarEvent)
        .where(CalendarEvent.status.notin_(["completed", "cancelled"]))
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
        .order_by(CalendarEvent.start_time.asc())
        .limit(5)
    )
    incomplete_events = [
        to_calendar_event_candidate(event)
        for event in incomplete_result.scalars().all()
    ]

    incomplete_count_result = await db.execute(
        select(func.count(CalendarEvent.id))
        .where(CalendarEvent.status.notin_(["completed", "cancelled"]))
        .where(CalendarEvent.start_time >= start_at)
        .where(CalendarEvent.start_time < end_at)
    )
    incomplete_events_count = int(incomplete_count_result.scalar_one() or 0)

    achievement_rate = 0.0
    if planned_minutes > 0:
        achievement_rate = round((actual_minutes / planned_minutes) * 100, 1)

    reflection_result = await db.execute(
        select(Reflection.id)
        .where(Reflection.reflection_date == current_time.date())
        .limit(1)
    )
    has_reflection = reflection_result.scalar_one_or_none() is not None

    suggestions = build_night_suggestions(
        progress=TodayProgressSnapshot(
            planned_minutes=planned_minutes,
            actual_minutes=actual_minutes,
            achievement_rate=achievement_rate,
            incomplete_events_count=incomplete_events_count,
        ),
        incomplete_events=incomplete_events,
        has_reflection=has_reflection,
    )

    return AssistantSuggestionsResponse(
        slot=AssistantTimeSlot.NIGHT.value,
        suggestions=[to_response(suggestion) for suggestion in suggestions],
    )


@router.post("/calendar-events/{event_id}/move-to-tomorrow", response_model=AssistantSuggestionResponse)
async def move_incomplete_event_to_tomorrow(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    """未完了予定を同じ時間帯のまま明日に移す。"""
    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id)
    )
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    if event.status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=400,
            detail="completed or cancelled event cannot be moved",
        )

    event.start_time = event.start_time + timedelta(days=1)
    event.end_time = event.end_time + timedelta(days=1)
    event.status = "scheduled"

    await db.commit()
    await db.refresh(event)

    moved = AssistantSuggestion(
        id=f"night-moved-event-{event.id}",
        suggestion_type=AssistantSuggestionType.MOVE_INCOMPLETE_EVENT_TOMORROW,
        title="未完了予定を明日に移しました",
        message=f"「{event.title}」を明日の同じ時間帯へ移動しました。",
        priority="medium",
        action_label="予定を確認する",
        action_target="calendar",
        metadata={
            "event_id": event.id,
            "start_time": event.start_time.isoformat(),
            "end_time": event.end_time.isoformat(),
            "status": event.status,
        },
    )
    return to_response(moved)
