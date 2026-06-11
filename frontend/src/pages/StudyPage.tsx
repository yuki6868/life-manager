import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createStudyLog,
  createStudySubject,
  deleteStudyLog,
  fetchStudyLogs,
  fetchStudySubjects,
  fetchStudySummary,
  updateStudyLog,
  type StudyLog,
  type StudySubject,
  type StudySummary,
} from "../api/study";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  base.setDate(base.getDate() + (day === 0 ? -6 : 1 - day));
  return base;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

function buildPieGradient(items: { total_minutes: number }[]) {
  const colors = [
    "#2563eb",
    "#22c55e",
    "#f97316",
    "#8b5cf6",
    "#06b6d4",
    "#ef4444",
    "#64748b",
  ];
  const total = items.reduce((sum, item) => sum + item.total_minutes, 0);
  if (total <= 0) return "#e2e8f0";
  let current = 0;
  return items
    .map((item, index) => {
      const start = current;
      const end = current + (item.total_minutes / total) * 100;
      current = end;
      return `${colors[index % colors.length]} ${start}% ${end}%`;
    })
    .join(", ");
}

function getPieColor(index: number) {
  const colors = [
    "#2563eb",
    "#22c55e",
    "#f97316",
    "#8b5cf6",
    "#06b6d4",
    "#ef4444",
    "#64748b",
  ];
  return colors[index % colors.length];
}

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

const defaultSubjectForm = {
  name: "",
  exam_name: "公認会計士",
  target_minutes: 0,
  memo: "",
};

type StudyLogEditForm = {
  subject_id: string;
  studied_on: string;
  duration_minutes: number;
  material: string;
  unit: string;
  method: string;
  understanding: number | "";
  memo: string;
};

function toEditForm(log: StudyLog): StudyLogEditForm {
  return {
    subject_id: String(log.subject_id),
    studied_on: log.studied_on,
    duration_minutes: log.duration_minutes,
    material: log.material ?? "",
    unit: log.unit ?? "",
    method: log.method ?? "",
    understanding: log.understanding ?? "",
    memo: log.memo ?? "",
  };
}

export default function StudyPage() {
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<StudyLogEditForm | null>(null);
  const [subjectForm, setSubjectForm] = useState(defaultSubjectForm);
  const [logForm, setLogForm] = useState({
    subject_id: "",
    studied_on: toDateKey(new Date()),
    duration_minutes: 120,
    material: "",
    unit: "",
    method: "問題演習",
    understanding: 3,
    memo: "",
  });

  const selectedWeekStart = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);
  const selectedWeekEnd = useMemo(
    () => addDays(selectedWeekStart, 6),
    [selectedWeekStart],
  );
  const startDate = toDateKey(selectedWeekStart);
  const endDate = toDateKey(selectedWeekEnd);
  const weekLabel = `${startDate.replaceAll("-", "/")} - ${endDate.replaceAll("-", "/")}`;

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [subjectData, logData, summaryData] = await Promise.all([
        fetchStudySubjects(),
        fetchStudyLogs({ start_date: startDate, end_date: endDate }),
        fetchStudySummary({ start_date: startDate, end_date: endDate }),
      ]);
      setSubjects(subjectData);
      setLogs(logData);
      setSummary(summaryData);
      setLogForm((current) => ({
        ...current,
        subject_id: current.subject_id || String(subjectData[0]?.id ?? ""),
      }));
    } catch (error) {
      console.error(error);
      setErrorMessage("学習データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  async function handleCreateSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectForm.name.trim()) return;
    await createStudySubject({
      name: subjectForm.name.trim(),
      exam_name: subjectForm.exam_name.trim() || null,
      target_minutes: Number(subjectForm.target_minutes) || 0,
      memo: subjectForm.memo.trim() || null,
    });
    setSubjectForm(defaultSubjectForm);
    await loadData();
  }

  async function handleCreateLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subjectId = Number(logForm.subject_id);
    if (!subjectId) {
      setErrorMessage("先に科目を作成してください。");
      return;
    }
    await createStudyLog({
      subject_id: subjectId,
      studied_on: logForm.studied_on,
      duration_minutes: Number(logForm.duration_minutes) || 0,
      material: logForm.material.trim() || null,
      unit: logForm.unit.trim() || null,
      method: logForm.method.trim() || null,
      understanding: Number(logForm.understanding) || null,
      memo: logForm.memo.trim() || null,
    });
    setLogForm((current) => ({
      ...current,
      duration_minutes: 120,
      material: "",
      unit: "",
      memo: "",
    }));
    await loadData();
  }

  function startEditLog(log: StudyLog) {
    setEditingLogId(log.id);
    setEditForm(toEditForm(log));
  }

  async function handleUpdateLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingLogId === null || editForm === null) return;
    const subjectId = Number(editForm.subject_id);
    if (!subjectId) {
      setErrorMessage("科目を選択してください。");
      return;
    }
    await updateStudyLog(editingLogId, {
      subject_id: subjectId,
      studied_on: editForm.studied_on,
      duration_minutes: Number(editForm.duration_minutes) || 0,
      material: editForm.material.trim() || null,
      unit: editForm.unit.trim() || null,
      method: editForm.method.trim() || null,
      understanding:
        editForm.understanding === "" ? null : Number(editForm.understanding),
      memo: editForm.memo.trim() || null,
    });
    setEditingLogId(null);
    setEditForm(null);
    await loadData();
  }

  async function handleDeleteLog(id: number) {
    if (editingLogId === id) {
      setEditingLogId(null);
      setEditForm(null);
    }
    await deleteStudyLog(id);
    await loadData();
  }

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(selectedWeekStart, index),
      ),
    [selectedWeekStart],
  );
  const dailyMap = useMemo(
    () =>
      new Map(
        (summary?.daily_summaries ?? []).map((item) => [
          item.studied_on,
          item.total_minutes,
        ]),
      ),
    [summary],
  );
  const maxDailyMinutes = Math.max(
    60,
    ...weekDays.map((day) => dailyMap.get(toDateKey(day)) ?? 0),
  );
  const subjectTargetMinutes =
    summary?.subject_summaries.reduce(
      (sum, item) => sum + (item.target_minutes || 0),
      0,
    ) ?? 0;
  const progress =
    subjectTargetMinutes > 0
      ? ((summary?.total_minutes ?? 0) / subjectTargetMinutes) * 100
      : 0;
  const activeSubjectSummaries = useMemo(
    () =>
      (summary?.subject_summaries ?? []).filter(
        (item) => item.total_minutes > 0,
      ),
    [summary],
  );
  const pieGradient = useMemo(
    () => buildPieGradient(activeSubjectSummaries),
    [activeSubjectSummaries],
  );

  return (
    <section className="study-page">
      <header className="study-hero">
        <div>
          <p className="study-eyebrow">StudyPlus style</p>
          <h1>学習ログ</h1>
          <p>
            公認会計士の勉強を「科目・教材・単元・時間」で残します。例：工業簿記
            2時間。
          </p>
        </div>
        <div className="study-week-switch">
          <button
            type="button"
            onClick={() => setWeekOffset((current) => current - 1)}
          >
            ‹
          </button>
          <strong>{weekLabel}</strong>
          <button
            type="button"
            onClick={() => setWeekOffset((current) => current + 1)}
          >
            ›
          </button>
        </div>
      </header>

      {errorMessage && (
        <p className="study-state study-state--error">{errorMessage}</p>
      )}
      {isLoading ? (
        <p className="study-state">読み込み中...</p>
      ) : (
        <>
          <section className="study-kpi-grid">
            <article className="study-kpi">
              <span>今週の学習</span>
              <strong>{formatMinutes(summary?.total_minutes ?? 0)}</strong>
              <small>{summary?.total_logs ?? 0}件のログ</small>
            </article>
            <article className="study-kpi">
              <span>週目標</span>
              <strong>
                {subjectTargetMinutes
                  ? formatMinutes(subjectTargetMinutes)
                  : "未設定"}
              </strong>
              <small>科目別目標の合計</small>
            </article>
            <article className="study-kpi">
              <span>達成率</span>
              <strong>
                {subjectTargetMinutes ? `${Math.round(progress)}%` : "-"}
              </strong>
              <div className="study-progress">
                <i style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
            </article>
          </section>

          <div className="study-main-grid">
            <section className="study-panel">
              <div className="study-panel__header">
                <h2>学習を記録</h2>
                <span>手入力</span>
              </div>
              <form className="study-form" onSubmit={handleCreateLog}>
                <label>
                  科目
                  <select
                    value={logForm.subject_id}
                    onChange={(e) =>
                      setLogForm({ ...logForm, subject_id: e.target.value })
                    }
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  日付
                  <input
                    type="date"
                    value={logForm.studied_on}
                    onChange={(e) =>
                      setLogForm({ ...logForm, studied_on: e.target.value })
                    }
                  />
                </label>
                <label>
                  時間（分）
                  <input
                    type="number"
                    min="1"
                    value={logForm.duration_minutes}
                    onChange={(e) =>
                      setLogForm({
                        ...logForm,
                        duration_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  教材
                  <input
                    value={logForm.material}
                    placeholder="例：TAC テキスト"
                    onChange={(e) =>
                      setLogForm({ ...logForm, material: e.target.value })
                    }
                  />
                </label>
                <label>
                  単元
                  <input
                    value={logForm.unit}
                    placeholder="例：工業簿記 標準原価計算"
                    onChange={(e) =>
                      setLogForm({ ...logForm, unit: e.target.value })
                    }
                  />
                </label>
                <label>
                  方法
                  <input
                    value={logForm.method}
                    placeholder="講義 / 問題演習 / 復習"
                    onChange={(e) =>
                      setLogForm({ ...logForm, method: e.target.value })
                    }
                  />
                </label>
                <label>
                  理解度
                  <select
                    value={logForm.understanding}
                    onChange={(e) =>
                      setLogForm({
                        ...logForm,
                        understanding: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="study-form__wide">
                  メモ
                  <textarea
                    value={logForm.memo}
                    placeholder="詰まった論点、次に復習すること"
                    onChange={(e) =>
                      setLogForm({ ...logForm, memo: e.target.value })
                    }
                  />
                </label>
                <button type="submit">学習ログを追加</button>
              </form>
            </section>

            <section className="study-panel">
              <div className="study-panel__header">
                <h2>科目を追加</h2>
                <span>最初だけ</span>
              </div>
              <form
                className="study-form study-form--subject"
                onSubmit={handleCreateSubject}
              >
                <label>
                  科目名
                  <input
                    value={subjectForm.name}
                    placeholder="例：工業簿記"
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  試験名
                  <input
                    value={subjectForm.exam_name}
                    onChange={(e) =>
                      setSubjectForm({
                        ...subjectForm,
                        exam_name: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  週目標（分）
                  <input
                    type="number"
                    min="0"
                    value={subjectForm.target_minutes}
                    onChange={(e) =>
                      setSubjectForm({
                        ...subjectForm,
                        target_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="study-form__wide">
                  メモ
                  <textarea
                    value={subjectForm.memo}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, memo: e.target.value })
                    }
                  />
                </label>
                <button type="submit">科目を追加</button>
              </form>
            </section>
          </div>

          <div className="study-main-grid study-main-grid--analytics">
            <section className="study-panel">
              <div className="study-panel__header">
                <h2>日別の学習時間</h2>
                <span>今週</span>
              </div>
              <div className="study-bars">
                {weekDays.map((day, index) => {
                  const key = toDateKey(day);
                  const minutes = dailyMap.get(key) ?? 0;
                  return (
                    <div className="study-bar-item" key={key}>
                      <div className="study-bar">
                        <i
                          style={{
                            height: `${(minutes / maxDailyMinutes) * 100}%`,
                          }}
                        />
                      </div>
                      <span>{DAY_LABELS[index]}</span>
                      <small>{formatMinutes(minutes)}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="study-panel">
              <div className="study-panel__header">
                <h2>時間割合</h2>
                <span>科目別</span>
              </div>
              {activeSubjectSummaries.length === 0 ? (
                <p className="study-empty">
                  学習ログを追加すると円グラフが出ます。
                </p>
              ) : (
                <div className="study-pie-layout">
                  <div
                    className="study-pie"
                    style={{ background: `conic-gradient(${pieGradient})` }}
                  >
                    <div>
                      <strong>
                        {formatMinutes(summary?.total_minutes ?? 0)}
                      </strong>
                      <span>合計</span>
                    </div>
                  </div>
                  <div className="study-pie-legend">
                    {activeSubjectSummaries.map((item, index) => {
                      const share = summary?.total_minutes
                        ? Math.round(
                            (item.total_minutes / summary.total_minutes) * 100,
                          )
                        : 0;
                      return (
                        <div
                          className="study-pie-legend__item"
                          key={item.subject_id}
                        >
                          <i style={{ background: getPieColor(index) }} />
                          <span>{item.subject_name}</span>
                          <strong>{share}%</strong>
                          <small>{formatMinutes(item.total_minutes)}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="study-panel">
            <div className="study-panel__header">
              <h2>科目別</h2>
              <span>時間順</span>
            </div>
            <div className="study-subject-list">
              {(summary?.subject_summaries.length
                ? summary.subject_summaries
                : []
              ).map((item) => {
                const percent =
                  item.target_minutes > 0
                    ? (item.total_minutes / item.target_minutes) * 100
                    : 0;
                return (
                  <article className="study-subject-row" key={item.subject_id}>
                    <div>
                      <strong>{item.subject_name}</strong>
                      <span>{item.exam_name ?? "試験未設定"}</span>
                    </div>
                    <em>{formatMinutes(item.total_minutes)}</em>
                    <div className="study-progress">
                      <i style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <small>
                      {item.target_minutes
                        ? `目標 ${formatMinutes(item.target_minutes)}`
                        : "目標なし"}
                    </small>
                  </article>
                );
              })}
              {subjects.length === 0 && (
                <p className="study-empty">まず科目を追加してください。</p>
              )}
            </div>
          </section>

          <section className="study-panel">
            <div className="study-panel__header">
              <h2>学習ログ一覧</h2>
              <span>{logs.length}件 / 一覧から編集可</span>
            </div>
            {logs.length === 0 ? (
              <p className="study-empty">この週の学習ログはまだありません。</p>
            ) : (
              <div className="study-table-wrap">
                <table className="study-table">
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>科目</th>
                      <th>教材</th>
                      <th>単元</th>
                      <th>時間</th>
                      <th>理解</th>
                      <th>メモ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className={
                          editingLogId === log.id
                            ? "study-table__editing-row"
                            : undefined
                        }
                      >
                        {editingLogId === log.id && editForm ? (
                          <td colSpan={8}>
                            <form
                              className="study-edit-form"
                              onSubmit={handleUpdateLog}
                            >
                              <label>
                                日付
                                <input
                                  type="date"
                                  value={editForm.studied_on}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      studied_on: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                科目
                                <select
                                  value={editForm.subject_id}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      subject_id: e.target.value,
                                    })
                                  }
                                >
                                  {subjects.map((subject) => (
                                    <option key={subject.id} value={subject.id}>
                                      {subject.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                時間（分）
                                <input
                                  type="number"
                                  min="1"
                                  value={editForm.duration_minutes}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      duration_minutes: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                教材
                                <input
                                  value={editForm.material}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      material: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                単元
                                <input
                                  value={editForm.unit}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      unit: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                方法
                                <input
                                  value={editForm.method}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      method: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                理解度
                                <select
                                  value={editForm.understanding}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      understanding:
                                        e.target.value === ""
                                          ? ""
                                          : Number(e.target.value),
                                    })
                                  }
                                >
                                  <option value="">未設定</option>
                                  {[1, 2, 3, 4, 5].map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="study-edit-form__wide">
                                メモ
                                <textarea
                                  value={editForm.memo}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      memo: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <div className="study-edit-actions">
                                <button type="submit">保存</button>
                                <button
                                  type="button"
                                  className="study-button--ghost"
                                  onClick={() => {
                                    setEditingLogId(null);
                                    setEditForm(null);
                                  }}
                                >
                                  キャンセル
                                </button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td>{log.studied_on}</td>
                            <td>{log.subject_name}</td>
                            <td>{log.material ?? "-"}</td>
                            <td>{log.unit ?? "-"}</td>
                            <td>{formatMinutes(log.duration_minutes)}</td>
                            <td>
                              {log.understanding
                                ? `${log.understanding}/5`
                                : "-"}
                            </td>
                            <td>{log.memo || "-"}</td>
                            <td>
                              <div className="study-table-actions">
                                <button
                                  type="button"
                                  className="study-button--edit"
                                  onClick={() => startEditLog(log)}
                                >
                                  編集
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLog(log.id)}
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
