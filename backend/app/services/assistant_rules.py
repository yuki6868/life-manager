from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from enum import StrEnum


class AssistantTimeSlot(StrEnum):
    """秘書提案で使う時間帯。"""

    MORNING = "morning"
    DAYTIME = "daytime"
    NIGHT = "night"


@dataclass(frozen=True)
class AssistantTimeContext:
    """現在時刻から判定した秘書提案用コンテキスト。"""

    now: datetime
    slot: AssistantTimeSlot
    is_morning: bool
    is_daytime: bool
    is_night: bool


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


def _to_current_time(now: datetime | None = None) -> time:
    return (now or datetime.now()).time()
