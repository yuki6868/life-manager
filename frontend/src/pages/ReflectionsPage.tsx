import { useEffect, useState } from "react";
import {
  createReflection,
  deleteReflection,
  fetchReflections,
  updateReflection,
} from "../api/reflections";
import type { Reflection } from "../api/reflections";

function toDateKey(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDateTime(dateText: string) {
  return dateText.slice(0, 16).replace("T", " ");
}

const emptyForm = {
  reflectionDate: toDateKey(new Date()),
  goodThings: "",
  badThings: "",
  improvements: "",
  delayReasons: "",
  memo: "",
};

type ReflectionFormState = typeof emptyForm;

export default function ReflectionsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [form, setForm] = useState<ReflectionFormState>(emptyForm);
  const [editingReflection, setEditingReflection] = useState<Reflection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadReflections() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await fetchReflections();
      setReflections(data);
    } catch (error) {
      console.error(error);
      setErrorMessage("日次振り返りの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReflections();
  }, []);

  function updateFormField(field: keyof ReflectionFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm, reflectionDate: toDateKey(new Date()) });
    setEditingReflection(null);
    setErrorMessage("");
  }

  function handleEdit(reflection: Reflection) {
    setEditingReflection(reflection);
    setForm({
      reflectionDate: reflection.reflection_date,
      goodThings: reflection.good_things ?? "",
      badThings: reflection.bad_things ?? "",
      improvements: reflection.improvements ?? "",
      delayReasons: reflection.delay_reasons ?? "",
      memo: reflection.memo ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    if (!form.reflectionDate) {
      setErrorMessage("振り返り日を入力してください。");
      return;
    }

    const input = {
      reflection_date: form.reflectionDate,
      good_things: form.goodThings || null,
      bad_things: form.badThings || null,
      improvements: form.improvements || null,
      delay_reasons: form.delayReasons || null,
      memo: form.memo || null,
    };

    try {
      if (editingReflection) {
        await updateReflection(editingReflection.id, input);
      } else {
        await createReflection(input);
      }

      resetForm();
      await loadReflections();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        "保存に失敗しました。同じ日の振り返りがすでに存在する可能性があります。"
      );
    }
  }

  async function handleDelete(id: number) {
    await deleteReflection(id);
    if (editingReflection?.id === id) {
      resetForm();
    }
    await loadReflections();
  }

  return (
    <section className="landscape-page landscape-form-list-page" style={{ padding: "32px", borderTop: "1px solid #ddd" }}>
      <h1>日次振り返り</h1>
      <p style={{ color: "#666" }}>
        1日の良かったこと、悪かったこと、改善点、遅延理由を記録します。
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: "16px",
          maxWidth: "720px",
          marginBottom: "32px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          background: "#fff",
        }}
      >
        <h2 style={{ margin: 0 }}>
          {editingReflection ? "振り返りを編集" : "今日の振り返りを作成"}
        </h2>

        <label>
          振り返り日
          <br />
          <input
            type="date"
            value={form.reflectionDate}
            onChange={(e) => updateFormField("reflectionDate", e.target.value)}
            style={{ padding: "8px", marginTop: "6px" }}
          />
        </label>

        <ReflectionTextarea
          label="良かったこと"
          value={form.goodThings}
          placeholder="例：午前中に重要タスクを終わらせられた"
          onChange={(value) => updateFormField("goodThings", value)}
        />

        <ReflectionTextarea
          label="悪かったこと"
          value={form.badThings}
          placeholder="例：午後にSNSを見すぎて集中が切れた"
          onChange={(value) => updateFormField("badThings", value)}
        />

        <ReflectionTextarea
          label="改善点"
          value={form.improvements}
          placeholder="例：朝一で連絡確認を広げず、先に制作時間を確保する"
          onChange={(value) => updateFormField("improvements", value)}
        />

        <ReflectionTextarea
          label="遅延理由"
          value={form.delayReasons}
          placeholder="例：見積もりが甘く、調査時間を入れていなかった"
          onChange={(value) => updateFormField("delayReasons", value)}
        />

        <ReflectionTextarea
          label="メモ"
          value={form.memo}
          placeholder="自由メモ"
          onChange={(value) => updateFormField("memo", value)}
        />

        <div>
          <button type="submit">{editingReflection ? "更新する" : "保存する"}</button>
          {editingReflection && (
            <button type="button" onClick={resetForm} style={{ marginLeft: "8px" }}>
              キャンセル
            </button>
          )}
        </div>
      </form>

      {isLoading && <p>読み込み中...</p>}
      {errorMessage && <p style={{ color: "#b00020" }}>{errorMessage}</p>}

      {!isLoading && (
        <section>
          <h2>振り返り一覧</h2>

          {reflections.length === 0 ? (
            <p>まだ振り返りはありません。</p>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {reflections.map((reflection) => (
                <article
                  key={reflection.id}
                  style={{
                    padding: "18px",
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>{reflection.reflection_date}</h3>
                    <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
                      更新: {formatDateTime(reflection.updated_at)}
                    </p>
                  </div>

                  <ReflectionDetail label="良かったこと" value={reflection.good_things} />
                  <ReflectionDetail label="悪かったこと" value={reflection.bad_things} />
                  <ReflectionDetail label="改善点" value={reflection.improvements} />
                  <ReflectionDetail label="遅延理由" value={reflection.delay_reasons} />
                  <ReflectionDetail label="メモ" value={reflection.memo} />

                  <button type="button" onClick={() => handleEdit(reflection)}>
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(reflection.id)}
                    style={{ marginLeft: "8px" }}
                  >
                    削除
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function ReflectionTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label>
      {label}
      <br />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: "80px",
          padding: "8px",
          marginTop: "6px",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

function ReflectionDetail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <strong>{label}</strong>
      <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: value ? "#222" : "#777" }}>
        {value || "未入力"}
      </p>
    </div>
  );
}
