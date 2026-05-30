import { useEffect, useState } from "react";

const ENERGY_KEY = "secretaryEnergyLevel";
const FOCUS_KEY = "secretaryFocusMode";

type EnergyLevel = "low" | "normal" | "high";

const energyOptions: Array<{ value: EnergyLevel; label: string; description: string }> = [
  { value: "low", label: "低め", description: "軽い作業や整理を中心にする" },
  { value: "normal", label: "元気", description: "通常の集中作業を進める" },
  { value: "high", label: "高集中", description: "重いタスクを優先する" },
];

function readSetting(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("normal");
  const [focusMode, setFocusMode] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedEnergy = readSetting(ENERGY_KEY, "normal");
    setEnergyLevel(["low", "normal", "high"].includes(savedEnergy) ? savedEnergy as EnergyLevel : "normal");
    setFocusMode(readSetting(FOCUS_KEY, "true") !== "false");
  }, []);

  function handleSave() {
    window.localStorage.setItem(ENERGY_KEY, energyLevel);
    window.localStorage.setItem(FOCUS_KEY, String(focusMode));
    setMessage("集中モード設定を保存しました。");
  }

  return (
    <section className="settings-page">
      <div className="dashboard-panel">
        <div className="dashboard-panel__header">
          <h2>集中モード設定</h2>
          <p>サイドバーの「変更する」から開く設定画面です。現在の体力に合わせて、今日の作業の重さを調整します。</p>
        </div>

        {message && <p className="dashboard-info-message">{message}</p>}

        <div className="settings-grid">
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

        <button type="button" className="calendar-button calendar-button--primary" onClick={handleSave}>保存する</button>
      </div>
    </section>
  );
}
