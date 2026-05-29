import { useEffect, useState } from "react";
import {
  createGoal,
  deleteGoal,
  fetchGoals,
  updateGoal,
} from "../api/goals";
import type { Goal } from "../api/goals";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  async function loadGoals() {
    const data = await fetchGoals();
    setGoals(data);
  }

  useEffect(() => {
    loadGoals();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) return;

    if (editingGoal) {
      await updateGoal(editingGoal.id, {
        title,
        description,
        target_date: targetDate || undefined,
        status: editingGoal.status,
      });
    } else {
      await createGoal({
        title,
        description,
        target_date: targetDate || undefined,
      });
    }

    setTitle("");
    setDescription("");
    setTargetDate("");
    setEditingGoal(null);
    await loadGoals();
  }

  function handleEdit(goal: Goal) {
    setEditingGoal(goal);
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setTargetDate(goal.target_date ?? "");
  }

  async function handleDelete(id: number) {
    await deleteGoal(id);
    await loadGoals();
  }

  return (
    <div style={{ padding: "32px" }}>
      <h1>目標管理</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
        <div>
          <label>目標タイトル</label>
          <br />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：個人開発アプリをMVP公開する"
            style={{ width: "420px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>説明</label>
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="目標の詳細を書く"
            style={{ width: "420px", height: "90px", padding: "8px" }}
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>期限</label>
          <br />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            style={{ padding: "8px" }}
          />
        </div>

        <button type="submit" style={{ marginTop: "16px" }}>
          {editingGoal ? "更新する" : "作成する"}
        </button>

        {editingGoal && (
          <button
            type="button"
            onClick={() => {
              setEditingGoal(null);
              setTitle("");
              setDescription("");
              setTargetDate("");
            }}
            style={{ marginLeft: "8px" }}
          >
            キャンセル
          </button>
        )}
      </form>

      <h2>目標一覧</h2>

      {goals.length === 0 ? (
        <p>まだ目標がありません。</p>
      ) : (
        <div>
          {goals.map((goal) => (
            <div
              key={goal.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <h3>{goal.title}</h3>
              <p>{goal.description || "説明なし"}</p>
              <p>状態: {goal.status}</p>
              <p>期限: {goal.target_date || "未設定"}</p>

              <button onClick={() => handleEdit(goal)}>編集</button>
              <button
                onClick={() => handleDelete(goal.id)}
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