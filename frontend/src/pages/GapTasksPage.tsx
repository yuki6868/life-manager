import { useEffect, useState } from "react";
import {
  createGapTask,
  deleteGapTask,
  fetchGapTasks,
  updateGapTask,
  updateGapTaskStatus,
} from "../api/gapTasks";
import type { GapTask } from "../api/gapTasks";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const ENERGY_LEVEL_OPTIONS = [
  { value: "high", label: "高集中" },
  { value: "medium", label: "普通" },
  { value: "low", label: "疲れていても可能" },
];

const GAP_TASK_STATUS_OPTIONS = [
  { value: "todo", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "保留" },
  { value: "cancelled", label: "中止" },
];

export default function GapTasksPage() {
  const [gapTasks, setGapTasks] = useState<GapTask[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredMinutes, setRequiredMinutes] = useState("15");
  const [priority, setPriority] = useState("medium");
  const [energyLevel, setEnergyLevel] = useState("medium");
  const [gapTaskStatus, setGapTaskStatus] = useState("todo");
  const [editingGapTask, setEditingGapTask] = useState<GapTask | null>(null);

  async function loadGapTasks() {
    const data = await fetchGapTasks();
    setGapTasks(data);
  }

  useEffect(() => {
    loadGapTasks();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;

    const input = {
      title,
      description,
      required_minutes: Math.max(1, Number(requiredMinutes || 1)),
      priority,
      energy_level: energyLevel,
    };

    if (editingGapTask) {
      await updateGapTask(editingGapTask.id, {
        ...input,
        status: gapTaskStatus,
      });
    } else {
      await createGapTask(input);
    }

    resetForm();
    await loadGapTasks();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setRequiredMinutes("15");
    setPriority("medium");
    setEnergyLevel("medium");
    setGapTaskStatus("todo");
    setEditingGapTask(null);
  }

  function handleEdit(gapTask: GapTask) {
    setEditingGapTask(gapTask);
    setTitle(gapTask.title);
    setDescription(gapTask.description ?? "");
    setRequiredMinutes(String(gapTask.required_minutes));
    setPriority(gapTask.priority);
    setEnergyLevel(gapTask.energy_level);
    setGapTaskStatus(gapTask.status);
  }

  async function handleStatusChange(gapTask: GapTask, status: string) {
    await updateGapTaskStatus(gapTask.id, status);
    await loadGapTasks();
  }

  async function handleDelete(id: number) {
    await deleteGapTask(id);
    await loadGapTasks();
  }

  return (
    <div style={{ padding: "32px" }}>
      <h1>スキマタスク管理</h1>
      <p>
        5分〜30分程度の空き時間に進められる小さなタスクを登録します。
        必要時間・優先度・エネルギーレベル・状態を管理できます。
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
        <div>
          <label>スキマタスクタイトル</label>
          <br />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：メール返信を3件だけ進める"
            style={{ width: "420px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>説明</label>
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="空き時間にやる内容を書く"
            style={{ width: "420px", height: "90px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>必要時間（分）</label>
          <br />
          <input
            type="number"
            min="1"
            value={requiredMinutes}
            onChange={(e) => setRequiredMinutes(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>優先度</label>
          <br />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>エネルギーレベル</label>
          <br />
          <select
            value={energyLevel}
            onChange={(e) => setEnergyLevel(e.target.value)}
            style={{ width: "420px", padding: "8px" }}
          >
            {ENERGY_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {editingGapTask && (
          <div style={{ marginTop: "12px" }}>
            <label>状態</label>
            <br />
            <select
              value={gapTaskStatus}
              onChange={(e) => setGapTaskStatus(e.target.value)}
              style={{ width: "420px", padding: "8px" }}
            >
              {GAP_TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" style={{ marginTop: "16px" }}>
          {editingGapTask ? "更新する" : "作成する"}
        </button>

        {editingGapTask && (
          <button type="button" onClick={resetForm} style={{ marginLeft: "8px" }}>
            キャンセル
          </button>
        )}
      </form>

      <h2>スキマタスク一覧</h2>

      {gapTasks.length === 0 ? (
        <p>まだスキマタスクがありません。</p>
      ) : (
        <div>
          {gapTasks.map((gapTask) => (
            <div
              key={gapTask.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <h3>{gapTask.title}</h3>
              <p>{gapTask.description || "説明なし"}</p>
              <p>必要時間: {gapTask.required_minutes}分</p>
              <p>優先度: {getOptionLabel(PRIORITY_OPTIONS, gapTask.priority)}</p>
              <p>
                エネルギー: {getOptionLabel(ENERGY_LEVEL_OPTIONS, gapTask.energy_level)}
              </p>
              <p>状態: {getOptionLabel(GAP_TASK_STATUS_OPTIONS, gapTask.status)}</p>

              <StatusActionButtons
                currentStatus={gapTask.status}
                options={GAP_TASK_STATUS_OPTIONS}
                onChange={(status) => handleStatusChange(gapTask, status)}
              />

              <button onClick={() => handleEdit(gapTask)}>編集</button>
              <button
                onClick={() => handleDelete(gapTask.id)}
                style={{ marginLeft: "8px" }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getOptionLabel(options: { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function StatusActionButtons({
  currentStatus,
  onChange,
  options,
}: {
  currentStatus: string;
  onChange: (status: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.value === currentStatus}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
