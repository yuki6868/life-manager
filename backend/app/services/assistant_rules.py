from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
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
    UNSTARTED_EVENT = "unstarted_event"
    DELAYED_EVENT = "delayed_event"
    GAP_TIME_TASK = "gap_time_task"
    TODAY_ACHIEVEMENT = "today_achievement"
    MOVE_INCOMPLETE_EVENT_TOMORROW = "move_incomplete_event_tomorrow"
    DAILY_REFLECTION = "daily_reflection"


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


@dataclass(frozen=True)
class CalendarEventCandidate:
    """昼の提案対象にする予定。"""

    id: int
    title: str
    start_at: datetime
    end_at: datetime
    status: str


@dataclass(frozen=True)
class GapTaskCandidate:
    """スキマ時間の提案対象にするタスク。"""

    id: int
    title: str
    required_minutes: int
    priority: str
    energy_level: str
    status: str


@dataclass(frozen=True)
class TodayProgressSnapshot:
    """夜の提案で使う今日の達成状況。"""

    planned_minutes: int
    actual_minutes: int
    achievement_rate: float
    incomplete_events_count: int


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


def build_daytime_suggestions(
    *,
    unstarted_events: list[CalendarEventCandidate],
    delayed_events: list[CalendarEventCandidate],
    available_minutes: int,
    gap_tasks: list[GapTaskCandidate],
    next_event: CalendarEventCandidate | None = None,
) -> list[AssistantSuggestion]:
    """昼に出す提案を生成する。"""
    suggestions: list[AssistantSuggestion] = []

    for event in unstarted_events:
        suggestions.append(
            AssistantSuggestion(
                id=f"daytime-unstarted-event-{event.id}",
                suggestion_type=AssistantSuggestionType.UNSTARTED_EVENT,
                title=f"未着手予定: {event.title}",
                message=(
                    "開始時刻を過ぎていますが、まだ完了になっていません。"
                    "やるなら今すぐ着手し、やらないなら予定を動かしましょう。"
                ),
                priority="high",
                action_label="予定を確認する",
                action_target="calendar",
                metadata={
                    "event_id": event.id,
                    "start_time": event.start_at.isoformat(),
                    "end_time": event.end_at.isoformat(),
                    "tomorrow_start_time": (event.start_at + timedelta(days=1)).isoformat(),
                    "tomorrow_end_time": (event.end_at + timedelta(days=1)).isoformat(),
                    "status": event.status,
                },
            )
        )

    for event in delayed_events:
        suggestions.append(
            AssistantSuggestion(
                id=f"daytime-delayed-event-{event.id}",
                suggestion_type=AssistantSuggestionType.DELAYED_EVENT,
                title=f"遅延予定: {event.title}",
                message=(
                    "終了予定時刻を過ぎていますが、完了になっていません。"
                    "今日やるか、後ろへずらすか、削るかを決めると計画崩れを抑えられます。"
                ),
                priority="high",
                action_label="予定を見直す",
                action_target="calendar",
                metadata={
                    "event_id": event.id,
                    "start_time": event.start_at.isoformat(),
                    "end_time": event.end_at.isoformat(),
                    "tomorrow_start_time": (event.start_at + timedelta(days=1)).isoformat(),
                    "tomorrow_end_time": (event.end_at + timedelta(days=1)).isoformat(),
                    "status": event.status,
                },
            )
        )

    for gap_task in gap_tasks:
        next_event_text = (
            f"次の予定「{next_event.title}」まで" if next_event else "今日中の空き時間で"
        )
        suggestions.append(
            AssistantSuggestion(
                id=f"daytime-gap-task-{gap_task.id}",
                suggestion_type=AssistantSuggestionType.GAP_TIME_TASK,
                title=f"スキマ時間でできる: {gap_task.title}",
                message=(
                    f"{next_event_text}{available_minutes}分あります。"
                    f"必要時間{gap_task.required_minutes}分なので、今の空き時間に入れられます。"
                ),
                priority=gap_task.priority,
                action_label="スキマタスクを開始する",
                action_target="gap_tasks",
                metadata={
                    "gap_task_id": gap_task.id,
                    "required_minutes": gap_task.required_minutes,
                    "available_minutes": available_minutes,
                    "energy_level": gap_task.energy_level,
                    "status": gap_task.status,
                    "next_event_id": next_event.id if next_event else None,
                    "next_event_start_time": next_event.start_at.isoformat() if next_event else None,
                },
            )
        )

    return suggestions


def build_night_suggestions(
    *,
    progress: TodayProgressSnapshot,
    incomplete_events: list[CalendarEventCandidate],
    has_reflection: bool,
) -> list[AssistantSuggestion]:
    """夜に出す提案を生成する。"""
    suggestions: list[AssistantSuggestion] = []

    if progress.planned_minutes > 0:
        progress_message = (
            f"今日は予定{progress.planned_minutes}分に対して、"
            f"実績{progress.actual_minutes}分でした。"
            f"達成率は{progress.achievement_rate}%です。"
        )
    else:
        progress_message = (
            f"今日は予定時間がありませんでした。実績は{progress.actual_minutes}分です。"
            "明日は最初に予定を置くと、振り返りやすくなります。"
        )

    achievement_priority = (
        "high"
        if progress.achievement_rate < 60 and progress.planned_minutes > 0
        else "medium"
    )
    suggestions.append(
        AssistantSuggestion(
            id="night-today-achievement",
            suggestion_type=AssistantSuggestionType.TODAY_ACHIEVEMENT,
            title="今日の達成率を確認しましょう",
            message=progress_message,
            priority=achievement_priority,
            action_label="実績を確認する",
            action_target="dashboard",
            metadata={
                "planned_minutes": progress.planned_minutes,
                "actual_minutes": progress.actual_minutes,
                "achievement_rate": progress.achievement_rate,
                "incomplete_events_count": progress.incomplete_events_count,
            },
        )
    )

    for event in incomplete_events:
        suggestions.append(
            AssistantSuggestion(
                id=f"night-move-incomplete-event-{event.id}",
                suggestion_type=AssistantSuggestionType.MOVE_INCOMPLETE_EVENT_TOMORROW,
                title=f"未完了予定を明日に移しましょう: {event.title}",
                message=(
                    "今日の未完了予定です。放置すると明日の判断コストになるので、"
                    "明日の予定へ移すか、やらない予定として整理しましょう。"
                ),
                priority="high",
                action_label="明日に移す",
                action_target="calendar",
                metadata={
                    "event_id": event.id,
                    "title": event.title,
                    "start_time": event.start_at.isoformat(),
                    "end_time": event.end_at.isoformat(),
                    "tomorrow_start_time": (event.start_at + timedelta(days=1)).isoformat(),
                    "tomorrow_end_time": (event.end_at + timedelta(days=1)).isoformat(),
                    "status": event.status,
                },
            )
        )

    if not has_reflection:
        suggestions.append(
            AssistantSuggestion(
                id="night-daily-reflection",
                suggestion_type=AssistantSuggestionType.DAILY_REFLECTION,
                title="今日の振り返りを残しましょう",
                message=(
                    "今日の良かったこと・悪かったこと・改善点を1行だけでも残すと、"
                    "明日の計画精度が上がります。"
                ),
                priority="medium",
                action_label="振り返りを書く",
                action_target="reflections",
                metadata={"has_reflection": False},
            )
        )

    return suggestions


def _to_current_time(now: datetime | None = None) -> time:
    return (now or datetime.now()).time()
