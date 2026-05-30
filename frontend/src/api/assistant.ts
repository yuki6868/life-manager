import { apiClient } from "./client";

export type AssistantSuggestion = {
  id: string;
  suggestion_type: string;
  title: string;
  message: string;
  priority: string;
  action_label?: string | null;
  action_target?: string | null;
  metadata: Record<string, unknown>;
};

export type AssistantSuggestionsResponse = {
  slot: "morning" | "daytime" | "night" | string;
  suggestions: AssistantSuggestion[];
};

function getCurrentAssistantSlot(): "morning" | "daytime" | "night" {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "daytime";
  return "night";
}

export async function fetchAssistantSuggestions(): Promise<AssistantSuggestionsResponse> {
  const slot = getCurrentAssistantSlot();

  if (slot === "morning") {
    const res = await apiClient.get("/assistant/morning-suggestions");
    return res.data;
  }

  if (slot === "daytime") {
    const res = await apiClient.get("/assistant/daytime-suggestions");
    return res.data;
  }

  const res = await apiClient.get("/assistant/night-suggestions");
  return res.data;
}

export async function moveIncompleteEventToTomorrow(
  eventId: number
): Promise<AssistantSuggestion> {
  const res = await apiClient.post(
    `/assistant/calendar-events/${eventId}/move-to-tomorrow`
  );
  return res.data;
}
