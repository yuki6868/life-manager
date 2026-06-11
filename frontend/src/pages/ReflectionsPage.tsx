import { useEffect, useMemo, useState } from "react";
import {
  createReflection,
  deleteReflection,
  fetchReflections,
  updateReflection,
} from "../api/reflections";
import type { Reflection } from "../api/reflections";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";
import { fetchWorkLogs } from "../api/workLogs";
import type { WorkLog } from "../api/workLogs";
import { fetchProjects } from "../api/projects";
import type { Project } from "../api/projects";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateText: string) {
  return dateText.slice(0, 10);
}

function formatDisplayDate(dateText: string) {
  return dateText.replaceAll("-", "/");
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours === 0) return `${restMinutes}分`;
  if (restMinutes === 0) return `${hours}時間`;
  return `${hours}時間${restMinutes}分`;
}

function getWeekStart(date: Date) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base;
}

function getMonthStart(date: Date) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  base.setDate(1);
  return base;
}

function getMonthEnd(date: Date) {
  const base = getMonthStart(date);
  base.setMonth(base.getMonth() + 1);
  base.setDate(0);
  return base;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function splitLines(text?: string | null) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[・\-\*\s]+/, "").trim())
    .filter(Boolean);
}

function toPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function escapeCsvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getStreakDays(reflections: Reflection[]) {
  const reflectedDates = new Set(reflections.map((reflection) => reflection.reflection_date));
  let cursor = new Date();
  let streak = 0;

  while (reflectedDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
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
type ReflectionTab = "daily" | "weekly" | "monthly" | "custom";

const WEEK_DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const TAB_LABELS: Record<ReflectionTab, string> = {
  daily: "日次",
  weekly: "週次",
  monthly: "月次",
  custom: "カスタム",
};
const DONUT_COLORS = ["#2563eb", "#22c55e", "#fb923c", "#8b5cf6", "#cbd5e1"];

export default function ReflectionsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ReflectionFormState>(emptyForm);
  const [editingReflection, setEditingReflection] = useState<Reflection | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<ReflectionTab>("weekly");

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [reflectionData, workLogData, taskData, projectData] = await Promise.all([
        fetchReflections(),
        fetchWorkLogs(),
        fetchTasks(),
        fetchProjects(),
      ]);

      setReflections(reflectionData);
      setWorkLogs(workLogData);
      setTasks(taskData);
      setProjects(projectData);
    } catch (error) {
      console.error(error);
      setErrorMessage("振り返りデータの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedPeriod = useMemo(() => {
    const today = new Date();

    if (activeTab === "daily") {
      const target = addDays(today, periodOffset);
      target.setHours(0, 0, 0, 0);
      return { start: target, end: target };
    }

    if (activeTab === "monthly") {
      const target = addMonths(today, periodOffset);
      return { start: getMonthStart(target), end: getMonthEnd(target) };
    }

    if (activeTab === "custom") {
      const end = addDays(today, periodOffset * 30);
      end.setHours(0, 0, 0, 0);
      return { start: addDays(end, -29), end };
    }

    const start = getWeekStart(today);
    start.setDate(start.getDate() + periodOffset * 7);
    return { start, end: addDays(start, 6) };
  }, [activeTab, periodOffset]);

  const selectedPeriodDays = useMemo(() => {
    const length = Math.max(1, Math.round((selectedPeriod.end.getTime() - selectedPeriod.start.getTime()) / 86400000) + 1);
    return Array.from({ length }, (_, index) => addDays(selectedPeriod.start, index));
  }, [selectedPeriod.end, selectedPeriod.start]);

  const heatmapDays = useMemo(() => {
    if (activeTab === "daily") return [selectedPeriod.start];
    if (activeTab === "weekly") return selectedPeriodDays;
    return selectedPeriodDays.filter((_, index) => index % 7 === 0).slice(0, 7);
  }, [activeTab, selectedPeriod.start, selectedPeriodDays]);

  const heatmapDayLabels = useMemo(() => {
    if (activeTab === "weekly") return WEEK_DAY_LABELS;
    return heatmapDays.map((date) => activeTab === "daily" ? formatDisplayDate(toDateKey(date)).slice(5) : `${date.getMonth() + 1}/${date.getDate()}`);
  }, [activeTab, heatmapDays]);

  const startKey = toDateKey(selectedPeriod.start);
  const endKey = toDateKey(selectedPeriod.end);
  const periodLabel = startKey === endKey ? formatDisplayDate(startKey) : `${formatDisplayDate(startKey)} - ${formatDisplayDate(endKey)}`;
  const periodName = TAB_LABELS[activeTab];

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const periodLogs = useMemo(() => {
    return workLogs.filter((log) => {
      const key = formatDate(log.started_at);
      return key >= startKey && key <= endKey;
    });
  }, [endKey, startKey, workLogs]);

  const periodReflections = useMemo(() => {
    return reflections.filter((reflection) => {
      return reflection.reflection_date >= startKey && reflection.reflection_date <= endKey;
    });
  }, [endKey, reflections, startKey]);

  const currentReflection = reflections.find((reflection) => reflection.reflection_date === startKey) ?? periodReflections[0] ?? null;

  const periodTaskIds = useMemo(() => {
    return new Set(periodLogs.map((log) => log.task_id).filter((id): id is number => id !== null && id !== undefined));
  }, [periodLogs]);

  const periodTasks = useMemo(() => {
    return [...periodTaskIds].map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task));
  }, [taskById, periodTaskIds]);

  const totalMinutes = periodLogs.reduce((sum, log) => sum + log.duration_minutes, 0);
  const focusMinutes = periodLogs.reduce((sum, log) => {
    const task = log.task_id ? taskById.get(log.task_id) : null;
    return task?.task_type === "gap" || log.gap_task_id ? sum : sum + log.duration_minutes;
  }, 0);
  const plannedMinutes = periodLogs.reduce((sum, log) => sum + (log.planned_minutes || 0), 0)
    || periodTasks.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0);
  const completedTasks = periodTasks.filter((task) => task.status === "done" || task.status === "completed").length;
  const productivityScore = Math.min(100, Math.round(((plannedMinutes ? totalMinutes / plannedMinutes : 0) * 55) + ((periodTasks.length ? completedTasks / periodTasks.length : 0) * 45)));
  const streakDays = getStreakDays(reflections);

  const projectSummary = useMemo(() => {
    const map = new Map<string, { id: string; label: string; minutes: number }>();

    for (const log of periodLogs) {
      const task = log.task_id ? taskById.get(log.task_id) : null;
      const project = task ? projectById.get(task.project_id) : null;
      const id = project ? String(project.id) : "no-project";
      const current = map.get(id) ?? { id, label: project?.title ?? "プロジェクト未設定", minutes: 0 };
      current.minutes += log.duration_minutes;
      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [projectById, taskById, periodLogs]);

  const donutGradient = useMemo(() => {
    if (!totalMinutes || projectSummary.length === 0) return "conic-gradient(#e2e8f0 0 100%)";

    let cursor = 0;
    const segments = projectSummary.slice(0, 5).map((item, index) => {
      const start = cursor;
      const width = (item.minutes / totalMinutes) * 100;
      cursor += width;
      return `${DONUT_COLORS[index] ?? "#cbd5e1"} ${start}% ${cursor}%`;
    });

    if (cursor < 100) segments.push(`#e2e8f0 ${cursor}% 100%`);
    return `conic-gradient(${segments.join(", ")})`;
  }, [projectSummary, totalMinutes]);

  const focusHeatmap = useMemo(() => {
    const cells = heatmapDays.flatMap((date, dayIndex) => {
      return [0, 6, 12, 18].map((hour) => {
        const key = toDateKey(date);
        const minutes = periodLogs.reduce((sum, log) => {
          if (formatDate(log.started_at) !== key) return sum;
          const startedHour = new Date(log.started_at).getHours();
          return startedHour >= hour && startedHour < hour + 6 ? sum + log.duration_minutes : sum;
        }, 0);
        return { id: `${key}-${hour}`, dayIndex, hour, minutes };
      });
    });
    const max = Math.max(1, ...cells.map((cell) => cell.minutes));
    return cells.map((cell) => ({ ...cell, level: Math.ceil((cell.minutes / max) * 5) }));
  }, [heatmapDays, periodLogs]);

  const goodItems = currentReflection ? splitLines(currentReflection.good_things) : [];
  const badItems = currentReflection ? splitLines(currentReflection.bad_things) : [];
  const nextItems = currentReflection ? splitLines(currentReflection.improvements) : [];
  const learningItems = currentReflection ? splitLines(currentReflection.memo) : [];

  const generatedInsights = useMemo(() => {
    const insights: string[] = [];
    const morningMinutes = periodLogs.filter((log) => new Date(log.started_at).getHours() < 12).reduce((sum, log) => sum + log.duration_minutes, 0);
    const afternoonMinutes = periodLogs.filter((log) => {
      const hour = new Date(log.started_at).getHours();
      return hour >= 12 && hour < 18;
    }).reduce((sum, log) => sum + log.duration_minutes, 0);

    if (totalMinutes > 0) {
      insights.push(`集中時間は総工数の${toPercent(focusMinutes, totalMinutes)}%でした。`);
    }
    if (morningMinutes > afternoonMinutes) {
      insights.push("午前中の作業量が午後より多く、朝に重要タスクを置くと進めやすそうです。");
    } else if (afternoonMinutes > 0) {
      insights.push("午後の作業量が多めです。休憩を挟むと集中を維持しやすくなります。");
    }
    if (plannedMinutes > 0 && totalMinutes > plannedMinutes) {
      insights.push("実績工数が計画を上回っています。見積もりに調査・確認時間を足すとズレを減らせます。");
    }
    if (completedTasks > 0) {
      insights.push(`${completedTasks}件のタスクが完了しています。小さく区切ったタスクは継続しやすいです。`);
    }

    return insights;
  }, [completedTasks, focusMinutes, plannedMinutes, totalMinutes, periodLogs]);

  function updateFormField(field: keyof ReflectionFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm, reflectionDate: toDateKey(new Date()) });
    setEditingReflection(null);
    setErrorMessage("");
    setIsFormOpen(false);
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
    setIsFormOpen(true);
  }

  function handleCreate() {
    const todayKey = toDateKey(new Date());
    const targetDate = activeTab === "daily" ? todayKey : startKey;
    const existingToday = reflections.find((reflection) => reflection.reflection_date === targetDate);
    if (existingToday) {
      handleEdit(existingToday);
      return;
    }
    setEditingReflection(null);
    setForm({ ...emptyForm, reflectionDate: activeTab === "daily" ? todayKey : startKey });
    setIsFormOpen(true);
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
      await loadData();
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。同じ日の振り返りがすでに存在する可能性があります。");
    }
  }

  async function handleDelete(id: number) {
    await deleteReflection(id);
    if (editingReflection?.id === id) resetForm();
    await loadData();
  }

  function handleExport() {
    const rows = periodReflections.map((reflection) => [
      reflection.reflection_date,
      reflection.good_things ?? "",
      reflection.bad_things ?? "",
      reflection.improvements ?? "",
      reflection.delay_reasons ?? "",
      reflection.memo ?? "",
    ]);

    downloadCsv(
      `reflections-${activeTab}-${startKey}_${endKey}.csv`,
      ["振り返り日", "よかったこと", "課題", "改善アクション", "遅延理由", "メモ"],
      rows,
    );
  }

  return (
    <section className="reflections-page">
      <header className="reflections-toolbar">
        <div>
          <p className="reflections-eyebrow">Reflection</p>
          <h1>振り返り</h1>
        </div>
        <div className="reflections-toolbar__actions">
          <button type="button" className="reflections-range-button">{periodLabel}</button>
          <div className="reflections-week-switch">
            <button type="button" onClick={() => setPeriodOffset((current) => current - 1)} aria-label="前の期間">‹</button>
            <button type="button" onClick={() => setPeriodOffset((current) => current + 1)} aria-label="次の期間">›</button>
          </div>
          <button type="button" className="reflections-export-button" onClick={handleExport}>⇩ エクスポート</button>
          <button type="button" className="reflections-primary-button" onClick={handleCreate}>＋ 振り返りを記録</button>
        </div>
      </header>

      <div className="reflections-tabs" aria-label="表示期間">
        {([
          ["daily", "日次"],
          ["weekly", "週次"],
          ["monthly", "月次"],
          ["custom", "カスタム"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "reflections-tab reflections-tab--active" : "reflections-tab"}
            onClick={() => { setActiveTab(key); setPeriodOffset(0); }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="reflections-state">読み込み中...</p>}
      {errorMessage && <p className="reflections-state reflections-state--error">{errorMessage}</p>}

      {isFormOpen && (
        <form className="reflections-form" onSubmit={handleSubmit}>
          <div className="reflections-panel__header">
            <h2>{editingReflection ? "振り返りを編集" : `${periodName}の振り返りを作成`}</h2>
            <button type="button" onClick={resetForm}>閉じる</button>
          </div>
          <label>
            振り返り日
            <input type="date" value={form.reflectionDate} onChange={(e) => updateFormField("reflectionDate", e.target.value)} />
          </label>
          <div className="reflections-form-grid">
            <ReflectionTextarea label="よかったこと" value={form.goodThings} placeholder="1行に1つずつ入力" onChange={(value) => updateFormField("goodThings", value)} />
            <ReflectionTextarea label="課題・改善したいこと" value={form.badThings} placeholder="うまくいかなかったことを入力" onChange={(value) => updateFormField("badThings", value)} />
            <ReflectionTextarea label="次に活かすアクション" value={form.improvements} placeholder="次回やることを入力" onChange={(value) => updateFormField("improvements", value)} />
            <ReflectionTextarea label="遅延理由" value={form.delayReasons} placeholder="予定から遅れた理由" onChange={(value) => updateFormField("delayReasons", value)} />
            <ReflectionTextarea label="気づき・学び / 総合コメント" value={form.memo} placeholder="自由メモ" onChange={(value) => updateFormField("memo", value)} />
          </div>
          <div className="reflections-form-actions">
            <button type="submit" className="reflections-primary-button">{editingReflection ? "更新する" : "保存する"}</button>
            {editingReflection && <button type="button" onClick={resetForm}>キャンセル</button>}
          </div>
        </form>
      )}

      {!isLoading && (
        <>
          <section className="reflections-panel reflections-summary-panel">
            <h2>{periodName}のサマリー</h2>
            <div className="reflections-kpi-grid">
              <KpiCard icon="◷" label="総工数" value={formatMinutes(totalMinutes)} note={plannedMinutes > 0 ? `計画 ${formatMinutes(plannedMinutes)}` : "計画データなし"} />
              <KpiCard icon="✓" label="完了タスク" value={`${completedTasks}件`} note={periodTasks.length ? `対象 ${periodTasks.length}件` : "対象タスクなし"} tone="green" />
              <KpiCard icon="✦" label="生産性スコア" value={plannedMinutes || periodTasks.length ? `${productivityScore}%` : "-"} note={productivityScore >= 80 ? "良好" : "改善余地あり"} tone="purple" />
              <KpiCard icon="✦" label="集中時間" value={formatMinutes(focusMinutes)} note={totalMinutes ? `総工数の${toPercent(focusMinutes, totalMinutes)}%` : "実績なし"} tone="blue" />
              <KpiCard icon="🔥" label="連続記録日数" value={`${streakDays}日`} note={streakDays > 0 ? "継続中" : "今日から記録しよう"} tone="orange" />
            </div>
          </section>

          <div className="reflections-card-grid">
            <ReflectionListCard icon="👍" title="よかったこと" subtitle={`${periodName}でうまくいったこと・成果`} items={goodItems} empty="この期間の良かったことはまだ記録されていません。" tone="good" onAdd={handleCreate} />
            <ReflectionListCard icon="⚠" title="課題・改善したいこと" subtitle={`${periodName}でうまくいかなかったこと・課題`} items={[...badItems, ...splitLines(currentReflection?.delay_reasons)]} empty="この期間の課題はまだ記録されていません。" tone="bad" onAdd={handleCreate} />
            <ReflectionListCard icon="➤" title="次に活かすアクション" subtitle="次の期間に向けた改善アクション" items={nextItems} empty="次のアクションはまだ記録されていません。" tone="next" onAdd={handleCreate} checklist />
          </div>

          <div className="reflections-analytics-grid">
            <section className="reflections-panel">
              <div className="reflections-panel__header">
                <h2>時間の使い方</h2>
                <span>時間配分</span>
              </div>
              <div className="reflections-donut-layout">
                <div className="reflections-donut" aria-label="時間配分" style={{ background: donutGradient }}>
                  <div><span>合計</span><strong>{formatMinutes(totalMinutes)}</strong></div>
                </div>
                <div className="reflections-project-list">
                  {(projectSummary.length ? projectSummary.slice(0, 5) : [{ id: "empty", label: "まだ実績がありません", minutes: 0 }]).map((item, index) => (
                    <div className="reflections-project-row" key={item.id}>
                      <i style={{ background: DONUT_COLORS[index] ?? "#cbd5e1" }} />
                      <strong>{item.label}</strong>
                      <span>{formatMinutes(item.minutes)}</span>
                      <small>{toPercent(item.minutes, totalMinutes)}%</small>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="reflections-panel">
              <div className="reflections-panel__header">
                <h2>集中時間帯</h2>
                <span>実績ログから集計</span>
              </div>
              <div className="reflections-heatmap">
                <div className="reflections-heatmap__hours"><span>0時</span><span>6時</span><span>12時</span><span>18時</span></div>
                <div className="reflections-heatmap__grid" style={{ gridTemplateColumns: `repeat(${heatmapDays.length}, 34px)` }}>
                  {focusHeatmap.map((cell) => <i key={cell.id} className={`reflections-heat reflections-heat--${cell.level}`} title={`${heatmapDayLabels[cell.dayIndex]} ${cell.hour}時: ${formatMinutes(cell.minutes)}`} />)}
                </div>
                <div className="reflections-heatmap__days" style={{ gridTemplateColumns: `repeat(${heatmapDayLabels.length}, 34px)` }}>{heatmapDayLabels.map((day) => <span key={day}>{day}</span>)}</div>
              </div>
            </section>

            <section className="reflections-panel reflections-notes-panel">
              <h2>気づき・学び</h2>
              <ul>
                {(learningItems.length ? learningItems : generatedInsights).map((item) => <li key={item}>{item}</li>)}
                {!learningItems.length && !generatedInsights.length && <li>作業ログや振り返りを記録すると、ここに気づきが表示されます。</li>}
              </ul>
            </section>

            <section className="reflections-panel reflections-comment-panel">
              <h2>総合コメント</h2>
              <p>{currentReflection?.memo || (totalMinutes > 0 ? "この期間の実績をもとに振り返りを記録できます。次に向けた改善点を1つだけ決めると続けやすくなります。" : "まだこの週の実績がありません。タイマーや工数入力で作業ログを残すと、振り返りがしやすくなります。")}</p>
            </section>
          </div>

          <section className="reflections-panel reflections-history-panel">
            <div className="reflections-panel__header">
              <h2>過去の振り返り履歴</h2>
              <span>{reflections.length}件</span>
            </div>
            {reflections.length === 0 ? (
              <p className="reflections-empty">まだ振り返りはありません。</p>
            ) : (
              <div className="reflections-table-wrap">
                <table className="reflections-table">
                  <thead><tr><th>期間</th><th>良かったこと</th><th>改善アクション</th><th>コメント</th><th /></tr></thead>
                  <tbody>
                    {reflections.slice(0, 8).map((reflection) => (
                      <tr key={reflection.id}>
                        <td>{formatDisplayDate(reflection.reflection_date)}</td>
                        <td>{splitLines(reflection.good_things)[0] ?? "-"}</td>
                        <td>{splitLines(reflection.improvements)[0] ?? "-"}</td>
                        <td>{reflection.memo || "-"}</td>
                        <td>
                          <button type="button" onClick={() => handleEdit(reflection)}>編集</button>
                          <button type="button" onClick={() => handleDelete(reflection.id)}>削除</button>
                        </td>
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

function KpiCard({ icon, label, note, tone = "blue", value }: { icon: string; label: string; note: string; tone?: "blue" | "green" | "purple" | "orange"; value: string }) {
  return (
    <article className={`reflections-kpi reflections-kpi--${tone}`}>
      <div className="reflections-kpi__icon" aria-hidden="true">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function ReflectionListCard({ checklist = false, empty, icon, items, onAdd, subtitle, title, tone }: { checklist?: boolean; empty: string; icon: string; items: string[]; onAdd: () => void; subtitle: string; title: string; tone: "good" | "bad" | "next" }) {
  return (
    <section className={`reflections-panel reflections-list-card reflections-list-card--${tone}`}>
      <div className="reflections-list-card__title"><span aria-hidden="true">{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>
      {items.length === 0 ? <p className="reflections-empty">{empty}</p> : <ul>{items.map((item) => <li key={item}>{checklist && <input type="checkbox" readOnly />}<span>{item}</span></li>)}</ul>}
      <button type="button" onClick={onAdd}>＋ 追加</button>
    </section>
  );
}

function ReflectionTextarea({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
