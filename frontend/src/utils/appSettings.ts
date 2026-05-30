export type EnergyLevel = "low" | "normal" | "high";

export type TimerSettings = {
  workMinutes: number;
  breakMinutes: number;
  autoStartBreak: boolean;
  soundEnabled: boolean;
};

export type GapTaskSettings = {
  dailyTargetMinutes: number;
  preferredEnergyLevel: string;
  excludeFocusMode: boolean;
};

const ENERGY_LEVEL_KEY = "life-manager.settings.energyLevel";
const FOCUS_MODE_KEY = "life-manager.settings.focusMode";
const TIMER_SETTINGS_KEY = "life-manager.settings.timer";
const GAP_TASK_SETTINGS_KEY = "life-manager.settings.gapTasks";

const LEGACY_ENERGY_LEVEL_KEY = "secretaryEnergyLevel";
const LEGACY_FOCUS_MODE_KEY = "secretaryFocusMode";
const LEGACY_TIMER_WORK_MINUTES_KEY = "timerWorkMinutes";
const LEGACY_TIMER_BREAK_MINUTES_KEY = "timerBreakMinutes";
const LEGACY_TIMER_AUTO_START_BREAK_KEY = "timerAutoStartBreak";

export const APP_SETTINGS_UPDATED_EVENT = "life-manager:settings-updated";

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  autoStartBreak: false,
  soundEnabled: true,
};

export const DEFAULT_GAP_TASK_SETTINGS: GapTaskSettings = {
  dailyTargetMinutes: 30,
  preferredEnergyLevel: "",
  excludeFocusMode: false,
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string): Partial<T> | null {
  if (!canUseLocalStorage()) return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : null;
  } catch (error) {
    console.warn(`Failed to parse setting: ${key}`, error);
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  notifySettingsUpdated();
}

function notifySettingsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_SETTINGS_UPDATED_EVENT));
}

function toPositiveInteger(value: unknown, fallback: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(1, Math.round(numericValue));
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function normalizeTimerSettings(
  settings: Record<string, unknown> | Partial<TimerSettings> | null | undefined,
): TimerSettings {
  return {
    workMinutes: toPositiveInteger(settings?.workMinutes, DEFAULT_TIMER_SETTINGS.workMinutes),
    breakMinutes: toPositiveInteger(settings?.breakMinutes, DEFAULT_TIMER_SETTINGS.breakMinutes),
    autoStartBreak: toBoolean(settings?.autoStartBreak, DEFAULT_TIMER_SETTINGS.autoStartBreak),
    soundEnabled: toBoolean(settings?.soundEnabled, DEFAULT_TIMER_SETTINGS.soundEnabled),
  };
}

export function normalizeGapTaskSettings(
  settings: Record<string, unknown> | Partial<GapTaskSettings> | null | undefined,
): GapTaskSettings {
  return {
    dailyTargetMinutes: toPositiveInteger(
      settings?.dailyTargetMinutes,
      DEFAULT_GAP_TASK_SETTINGS.dailyTargetMinutes,
    ),
    preferredEnergyLevel:
      typeof settings?.preferredEnergyLevel === "string"
        ? settings.preferredEnergyLevel
        : DEFAULT_GAP_TASK_SETTINGS.preferredEnergyLevel,
    excludeFocusMode: toBoolean(
      settings?.excludeFocusMode,
      DEFAULT_GAP_TASK_SETTINGS.excludeFocusMode,
    ),
  };
}

export function readTimerSettings(): TimerSettings {
  const savedSettings = readJson<TimerSettings>(TIMER_SETTINGS_KEY);
  const legacySettings = canUseLocalStorage()
    ? {
        workMinutes: window.localStorage.getItem(LEGACY_TIMER_WORK_MINUTES_KEY) ?? undefined,
        breakMinutes: window.localStorage.getItem(LEGACY_TIMER_BREAK_MINUTES_KEY) ?? undefined,
        autoStartBreak:
          window.localStorage.getItem(LEGACY_TIMER_AUTO_START_BREAK_KEY) ?? undefined,
      }
    : null;

  return normalizeTimerSettings({
    ...legacySettings,
    ...savedSettings,
  });
}

export function writeTimerSettings(settings: TimerSettings) {
  writeJson(TIMER_SETTINGS_KEY, normalizeTimerSettings(settings));
}

export function readGapTaskSettings(): GapTaskSettings {
  return normalizeGapTaskSettings(readJson<GapTaskSettings>(GAP_TASK_SETTINGS_KEY));
}

export function writeGapTaskSettings(settings: GapTaskSettings) {
  writeJson(GAP_TASK_SETTINGS_KEY, normalizeGapTaskSettings(settings));
}

export function readEnergyLevel(): EnergyLevel {
  if (!canUseLocalStorage()) return "normal";

  const savedValue =
    window.localStorage.getItem(ENERGY_LEVEL_KEY) ??
    window.localStorage.getItem(LEGACY_ENERGY_LEVEL_KEY);

  return savedValue === "low" || savedValue === "high" || savedValue === "normal"
    ? savedValue
    : "normal";
}

export function writeEnergyLevel(value: EnergyLevel) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(ENERGY_LEVEL_KEY, value);
  notifySettingsUpdated();
}

export function readFocusMode(): boolean {
  if (!canUseLocalStorage()) return true;

  const savedValue =
    window.localStorage.getItem(FOCUS_MODE_KEY) ??
    window.localStorage.getItem(LEGACY_FOCUS_MODE_KEY);

  return savedValue === null ? true : savedValue !== "false";
}

export function writeFocusMode(value: boolean) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(FOCUS_MODE_KEY, String(value));
  notifySettingsUpdated();
}
