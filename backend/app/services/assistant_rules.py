from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from enum import StrEnum
from typing import Any


class AssistantTimeSlot(StrEnum):
    """秘書提案で使う時間帯。"""

    MORNING = "morning"
    DAYTIME = "daytime"
    NIGHT = "night"


class AssistantSuggestionType(StrEnum):
    """秘書提案の種類。"""

    NO_TODAY_EVENTS = "no_today_events"
    HIGH_PRIORITY_TASK = "high_priority_task"
    GMAIL_CHECK = "gmail_check"


@dataclass(frozen=True)
class AssistantTimeContext:
    """現在時刻から判定した秘書提案用コンテキスト。"""

    now: datetime
    slot: AssistantTimeSlot
    is_morning: bool
    is_daytime: bool
    is_night: bool


@dataclass(frozen=True)
class AssistantSuggestion:
    """UI/APIに渡す秘書提案。"""

    id: str
    suggestion_type: AssistantSuggestionType
    title: str
    message: str
    priority: str
    action_label: str | None = None
    action_target: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class HighPriorityTaskCandidate:
    """朝の提案対象にする高優先度タスク。"""

    id: int
    title: str
    estimated_minutes: int
    status: str
    urgency: int | None = None
    importance: int | None = None


MORNING_START = time(hour=5, minute=0)
DAYTIME_START = time(hour=11, minute=0)
NIGHT_START = time(hour=17, minute=0)


def is_morning(now: datetime | None = None) -> bool:
    """朝の提案を出す時間帯かを判定する。"""
    current_time = _to_current_time(now)
    return MORNING_START <= current_time < DAYTIME_START


def is_daytime(now: datetime | None = None) -> bool:
    """昼の提案を出す時間帯かを判定する。"""
    current_time = _to_current_time(now)
    return DAYTIME_START <= current_time < NIGHT_START


def is_night(now: datetime | None = None) -> bool:
    """夜の提案を出す時間帯かを判定する。"""
    return not is_morning(now) and not is_daytime(now)


def get_assistant_time_slot(now: datetime | None = None) -> AssistantTimeSlot:
    """現在時刻を朝・昼・夜のどれかに分類する。"""
    if is_morning(now):
        return AssistantTimeSlot.MORNING

    if is_daytime(now):
        return AssistantTimeSlot.DAYTIME

    return AssistantTimeSlot.NIGHT


def build_assistant_time_context(now: datetime | None = None) -> AssistantTimeContext:
    """後続の提案ルールが使いやすい時間帯コンテキストを作る。"""
    current_datetime = now or datetime.now()
    slot = get_assistant_time_slot(current_datetime)

    return AssistantTimeContext(
        now=current_datetime,
        slot=slot,
        is_morning=slot == AssistantTimeSlot.MORNING,
        is_daytime=slot == AssistantTimeSlot.DAYTIME,
        is_night=slot == AssistantTimeSlot.NIGHT,
    )


def build_morning_suggestions(
    *,
    has_today_events: bool,
    high_priority_tasks: list[HighPriorityTaskCandidate],
    include_gmail_check: bool = True,
) -> list[AssistantSuggestion]:
    """朝に出す提案を生成する。"""
    suggestions: list[AssistantSuggestion] = []

    if not has_today_events:
        suggestions.append(
            AssistantSuggestion(
                id="morning-no-today-events",
                suggestion_type=AssistantSuggestionType.NO_TODAY_EVENTS,
                title="今日の予定を先に置きましょう",
                message=(
                    "今日の予定がまだありません。最初に1〜3個だけ時間を確保すると、"
                    "一日の迷いを減らせます。"
                ),
                priority="high",
                action_label="予定を追加する",
                action_target="calendar",
                metadata={"today_events_count": 0},
            )
        )

    for task in high_priority_tasks:
        estimated_text = (
            f"見積もり{task.estimated_minutes}分"
            if task.estimated_minutes > 0
            else "見積もり未設定"
        )
        suggestions.append(
            AssistantSuggestion(
                id=f"morning-high-priority-task-{task.id}",
                suggestion_type=AssistantSuggestionType.HIGH_PRIORITY_TASK,
                title=f"高優先度タスク: {task.title}",
                message=(
                    f"優先度が高い未完了タスクです。{estimated_text}。"
                    "朝のうちに予定へ入れる候補です。"
                ),
                priority="high",
                action_label="タスクを確認する",
                action_target="tasks",
                metadata={
                    "task_id": task.id,
                    "estimated_minutes": task.estimated_minutes,
                    "status": task.status,
                    "urgency": task.urgency,
                    "importance": task.importance,
                },
            )
        )

    if include_gmail_check:
        suggestions.append(
            AssistantSuggestion(
                id="morning-gmail-check",
                suggestion_type=AssistantSuggestionType.GMAIL_CHECK,
                title="朝のメール確認を短く入れましょう",
                message=(
                    "重要な連絡で今日の予定が変わる可能性があります。"
                    "先に5〜10分だけGmailを確認するのがおすすめです。"
                ),
                priority="medium",
                action_label="Gmailを確認する",
                action_target="gmail",
                metadata={"recommended_minutes": 10},
            )
        )

    return suggestions


def _to_current_time(now: datetime | None = None) -> time:
    return (now or datetime.now()).time()
