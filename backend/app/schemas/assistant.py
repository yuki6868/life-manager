from typing import Any

from pydantic import BaseModel, Field


class AssistantSuggestionResponse(BaseModel):
    id: str
    suggestion_type: str
    title: str
    message: str
    priority: str
    action_label: str | None = None
    action_target: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssistantSuggestionsResponse(BaseModel):
    slot: str
    suggestions: list[AssistantSuggestionResponse]
