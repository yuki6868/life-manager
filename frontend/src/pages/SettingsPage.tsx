import { useEffect, useState } from "react";
import {
  DEFAULT_GAP_TASK_SETTINGS,
  DEFAULT_TIMER_SETTINGS,
  type EnergyLevel,
  type GapTaskSettings,
  type TimerSettings,
  normalizeGapTaskSettings,
  normalizeTimerSettings,
  readEnergyLevel,
  readFocusMode,
  readGapTaskSettings,
  readTimerSettings,
  writeEnergyLevel,
  writeFocusMode,
  writeGapTaskSettings,
  writeTimerSettings,
} from "../utils/appSettings";

const energyOptions: Array<{ value: EnergyLevel; label: string; description: string }> = [
  { value: "low", label: "低め", description: "軽い作業や整理を中心にする" },
  { value: "normal", label: "元気", description: "通常の集中作業を進める" },
  { value: "high", label: "高集中", description: "重いタスクを優先する" },
];

const gapEnergyOptions = [
  { value: "", label: "指定なし" },
  { value: "high", label: "高集中" },
  { value: "medium", label: "普通" },
  { value: "low", label: "疲れていても可能" },
];

export default function SettingsPage() {
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("normal");
  const [focusMode, setFocusMode] = useState(true);
  const [timerSettings, setTimerSettings] = useState<TimerSettings>(DEFAULT_TIMER_SETTINGS);
  const [gapTaskSettings, setGapTaskSettings] = useState<GapTaskSettings>(DEFAULT_GAP_TASK_SETTINGS);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEnergyLevel(readEnergyLevel());
    setFocusMode(readFocusMode());
    setTimerSettings(readTimerSettings());
    setGapTaskSettings(readGapTaskSettings());
  }, []);

  function updateTimerSetting<K extends keyof TimerSettings>(key: K, value: TimerSettings[K]) {
    setTimerSettings((current) => ({ ...current, [key]: value }));
  }

  function updateGapTaskSetting<K extends keyof GapTaskSettings>(key: K, value: GapTaskSettings[K]) {
    setGapTaskSettings((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    const normalizedTimerSettings = normalizeTimerSettings(timerSettings);
    const normalizedGapTaskSettings = normalizeGapTaskSettings(gapTaskSettings);

    writeEnergyLevel(energyLevel);
    writeFocusMode(focusMode);
    writeTimerSettings(normalizedTimerSettings);
    writeGapTaskSettings(normalizedGapTaskSettings);

    setTimerSettings(normalizedTimerSettings);
    setGapTaskSettings(normalizedGapTaskSettings);
    setMessage("設定を保存しました。");
  }

  return (
    <section className="settings-page landscape-page landscape-settings-page">
      <div className="settings-page-header dashboard-panel">
        <div className="dashboard-panel__header">
          <p className="app-header__eyebrow">Settings</p>
          <h2>設定</h2>
          <p>各画面に散らばっていた設定をここに集約します。保存後、タイマー・すきまタスク画面に反映されます。</p>
        </div>
        {message && <p className="dashboard-info-message">{message}</p>}
        <button type="button" className="calendar-button calendar-button--primary" onClick={handleSave}>すべて保存する</button>
      </div>

      <div className="settings-sections-grid">
        <section className="dashboard-panel settings-section-card">
          <div className="dashboard-panel__header">
            <h2>集中モード</h2>
            <p>今日の体力に合わせて、秘書の提案や作業の重さを調整します。</p>
          </div>

          <div className="settings-grid settings-grid--single">
            <label className="settings-switch">
              <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} />
              <span>
                <strong>集中モードを有効にする</strong>
                <small>オンにすると、重いタスクと軽いタスクの切り替えを意識できます。</small>
              </span>
            </label>

            <div className="settings-options" role="radiogroup" aria-label="エネルギーレベル">
              {energyOptions.map((option) => (
                <label key={option.value} className={energyLevel === option.value ? "settings-option settings-option--active" : "settings-option"}>
                  <input
                    type="radio"
                    name="energyLevel"
                    value={option.value}
                    checked={energyLevel === option.value}
                    onChange={() => setEnergyLevel(option.value)}
                  />
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-panel settings-section-card">
          <div className="dashboard-panel__header">
            <h2>タイマー設定</h2>
            <p>作業タイマーの集中時間・休憩時間を設定します。</p>
          </div>

          <div className="settings-form-grid">
            <label>
              作業時間（分）
              <input
                type="number"
                min="1"
                value={timerSettings.workMinutes}
                onChange={(e) => updateTimerSetting("workMinutes", Number(e.target.value))}
              />
            </label>
            <label>
              休憩時間（分）
              <input
                type="number"
                min="1"
                value={timerSettings.breakMinutes}
                onChange={(e) => updateTimerSetting("breakMinutes", Number(e.target.value))}
              />
            </label>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={timerSettings.autoStartBreak}
                onChange={(e) => updateTimerSetting("autoStartBreak", e.target.checked)}
              />
              <span>
                <strong>休憩を自動開始する</strong>
                <small>集中時間が終わったら休憩モードへ移るための設定です。</small>
              </span>
            </label>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={timerSettings.soundEnabled}
                onChange={(e) => updateTimerSetting("soundEnabled", e.target.checked)}
              />
              <span>
                <strong>通知音を有効にする</strong>
                <small>終了通知の利用予定フラグとして保存します。</small>
              </span>
            </label>
          </div>
        </section>

        <section className="dashboard-panel settings-section-card">
          <div className="dashboard-panel__header">
            <h2>すきまタスク設定</h2>
            <p>すきまタスク画面の目標時間や提案条件を設定します。</p>
          </div>

          <div className="settings-form-grid">
            <label>
              1日の目標時間（分）
              <input
                type="number"
                min="1"
                value={gapTaskSettings.dailyTargetMinutes}
                onChange={(e) => updateGapTaskSetting("dailyTargetMinutes", Number(e.target.value))}
              />
            </label>
            <label>
              優先する集中度
              <select
                value={gapTaskSettings.preferredEnergyLevel}
                onChange={(e) => updateGapTaskSetting("preferredEnergyLevel", e.target.value)}
              >
                {gapEnergyOptions.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="settings-switch settings-form-grid__full">
              <input
                type="checkbox"
                checked={gapTaskSettings.excludeFocusMode}
                onChange={(e) => updateGapTaskSetting("excludeFocusMode", e.target.checked)}
              />
              <span>
                <strong>集中モード中はすきまタスク提案を控える</strong>
                <small>深い作業を優先したいときに使います。</small>
              </span>
            </label>
          </div>
        </section>
      </div>
    </section>
  );
}
