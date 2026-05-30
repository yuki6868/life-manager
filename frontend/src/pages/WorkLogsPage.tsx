import { useEffect, useMemo, useState } from "react";
import { deleteWorkLog, fetchWorkLogs } from "../api/workLogs";
import type { WorkLog } from "../api/workLogs";
import { fetchProjects } from "../api/projects";
import type { Project } from "../api/projects";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";

function formatDate(dateText: string) {
  return dateText.slice(0, 10);
}

function formatDateTime(dateText: string) {
  return dateText.slice(0, 16).replace("T", " ");
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours === 0) return `${restMinutes}分`;
  if (restMinutes === 0) return `${hours}時間`;
  return `${hours}時間 ${restMinutes}分`;
}

function formatDifferenceMinutes(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  if (value === 0) return "予定どおり";
  return value > 0 ? `+${value}分` : `${value}分`;
}

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
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

type SummaryItem = {
  id: string;
  label: string;
  minutes: number;
  count: number;
};

type DailyChartItem = {
  key: string;
  label: string;
  focusMinutes: number;
  otherMinutes: number;
};

type KpiCardProps = {
  icon: string;
  label: string;
  value: string;
  note: string;
  progress?: number;
  tone?: "blue" | "purple" | "green" | "orange";
};

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const PROJECT_TONES = ["blue", "green", "orange", "purple", "gray"] as const;
const DONUT_COLORS = ["#2563eb", "#22c55e", "#fb923c", "#8b5cf6", "#cbd5e1"];

function KpiCard({ icon, label, value, note, progress, tone = "blue" }: KpiCardProps) {
  return (
    <article className={`worklogs-kpi worklogs-kpi--${tone}`}>
      <div className="worklogs-kpi__icon" aria-hidden="true">{icon}</div>
      <div className="worklogs-kpi__body">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
        {progress !== undefined && (
          <div className="worklogs-progress" aria-label={`${label} ${Math.round(progress)}%`}>
            <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

export default function WorkLogsPage() {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [workLogData, taskData, projectData] = await Promise.all([
        fetchWorkLogs(),
        fetchTasks(),
        fetchProjects(),
      ]);

      setWorkLogs(workLogData);
      setTasks(taskData);
      setProjects(projectData);
    } catch (error) {
      console.error(error);
      setErrorMessage("工数・進捗データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const taskById = useMemo(() => {
    return new Map(tasks.map((task) => [task.id, task]));
  }, [tasks]);

  const projectById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const selectedWeekStart = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index));
  }, [selectedWeekStart]);

  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);

  const weekLabel = `${toDateKey(selectedWeekStart).replaceAll("-", "/")} - ${toDateKey(selectedWeekEnd).replaceAll("-", "/")}`;

  const weeklyLogs = useMemo(() => {
    const startKey = toDateKey(selectedWeekStart);
    const endKey = toDateKey(selectedWeekEnd);
    return workLogs.filter((log) => {
      const key = formatDate(log.started_at);
      return key >= startKey && key <= endKey;
    });
  }, [selectedWeekEnd, selectedWeekStart, workLogs]);

  const weeklyTaskIds = useMemo(() => {
    return new Set(weeklyLogs.map((log) => log.task_id).filter((id): id is number => id !== null && id !== undefined));
  }, [weeklyLogs]);

  const weeklyTasks = useMemo(() => {
    return [...weeklyTaskIds]
      .map((id) => taskById.get(id))
      .filter((task): task is Task => Boolean(task));
  }, [taskById, weeklyTaskIds]);

  const weeklyCompletedTasks = useMemo(() => {
    return weeklyTasks.filter((task) => task.status === "done" || task.status === "completed").length;
  }, [weeklyTasks]);

  const totalMinutes = weeklyLogs.reduce((sum, log) => sum + log.duration_minutes, 0);
  const focusMinutes = weeklyLogs.reduce((sum, log) => {
    const task = log.task_id ? taskById.get(log.task_id) : null;
    return task?.task_type === "gap" || log.gap_task_id ? sum : sum + log.duration_minutes;
  }, 0);
  const totalLogs = weeklyLogs.length;
  const loggedTaskCount = weeklyTaskIds.size;
  const estimatedMinutesFromTasks = weeklyTasks.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0);
  const plannedMinutesFromLogs = weeklyLogs.reduce((sum, log) => sum + (log.planned_minutes || 0), 0);
  const plannedMinutes = plannedMinutesFromLogs || estimatedMinutesFromTasks;
  const focusTargetMinutes = weeklyTasks
    .filter((task) => task.task_type !== "gap")
    .reduce((sum, task) => sum + (task.estimated_minutes || 0), 0) || plannedMinutes;
  const taskTargetCount = loggedTaskCount;
  const workProgress = plannedMinutes > 0 ? (totalMinutes / plannedMinutes) * 100 : null;
  const focusProgress = focusTargetMinutes > 0 ? (focusMinutes / focusTargetMinutes) * 100 : null;
  const taskProgress = taskTargetCount > 0 ? (weeklyCompletedTasks / taskTargetCount) * 100 : null;
  const productivityScore = Math.min(100, Math.round(((workProgress ?? 0) * 0.55) + ((taskProgress ?? 0) * 0.45)));

  const dailyChart = useMemo<DailyChartItem[]>(() => {
    return weekDays.map((date, index) => {
      const key = toDateKey(date);
      const logs = weeklyLogs.filter((log) => formatDate(log.started_at) === key);
      const focus = logs.reduce((sum, log) => {
        const task = log.task_id ? taskById.get(log.task_id) : null;
        return task?.task_type === "gap" || log.gap_task_id ? sum : sum + log.duration_minutes;
      }, 0);
      const total = logs.reduce((sum, log) => sum + log.duration_minutes, 0);
      return {
        key,
        label: `${date.getMonth() + 1}/${date.getDate()} (${DAY_LABELS[index]})`,
        focusMinutes: focus,
        otherMinutes: Math.max(0, total - focus),
      };
    });
  }, [taskById, weekDays, weeklyLogs]);

  const taskSummary = useMemo<SummaryItem[]>(() => {
    const map = new Map<string, SummaryItem>();

    for (const log of weeklyLogs) {
      const task = log.task_id ? taskById.get(log.task_id) : null;
      const id = log.task_id ? String(log.task_id) : "no-task";
      const label = task?.title ?? "タスク未設定";
      const current = map.get(id) ?? { id, label, minutes: 0, count: 0 };

      current.minutes += log.duration_minutes;
      current.count += 1;
      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [taskById, weeklyLogs]);

  const projectSummary = useMemo<SummaryItem[]>(() => {
    const map = new Map<string, SummaryItem>();

    for (const log of weeklyLogs) {
      const task = log.task_id ? taskById.get(log.task_id) : null;
      const project = task ? projectById.get(task.project_id) : null;
      const id = project ? String(project.id) : "no-project";
      const label = project?.title ?? "プロジェクト未設定";
      const current = map.get(id) ?? { id, label, minutes: 0, count: 0 };

      current.minutes += log.duration_minutes;
      current.count += 1;
      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [projectById, taskById, weeklyLogs]);

  const dailyTargetMinutes = plannedMinutes > 0 ? plannedMinutes / 7 : 0;
  const maxDailyMinutes = Math.max(60, dailyTargetMinutes, ...dailyChart.map((item) => item.focusMinutes + item.otherMinutes));
  const targetLineBottom = dailyTargetMinutes > 0 ? Math.min(100, (dailyTargetMinutes / maxDailyMinutes) * 100) : 0;

  const projectDonutGradient = useMemo(() => {
    if (!totalMinutes || projectSummary.length === 0) {
      return "conic-gradient(#e2e8f0 0 100%)";
    }

    let cursor = 0;
    const segments = projectSummary.slice(0, 5).map((item, index) => {
      const start = cursor;
      const width = (item.minutes / totalMinutes) * 100;
      cursor += width;
      return `${DONUT_COLORS[index] ?? DONUT_COLORS[DONUT_COLORS.length - 1]} ${start}% ${cursor}%`;
    });

    if (cursor < 100) {
      segments.push(`#e2e8f0 ${cursor}% 100%`);
    }

    return `conic-gradient(${segments.join(", ")})`;
  }, [projectSummary, totalMinutes]);

  const focusHeatmap = useMemo(() => {
    const cells = weekDays.flatMap((date, dayIndex) => {
      return [0, 6, 12, 18].map((hour) => {
        const key = toDateKey(date);
        const minutes = weeklyLogs.reduce((sum, log) => {
          if (formatDate(log.started_at) !== key) return sum;
          const startedAt = new Date(log.started_at);
          const startedHour = startedAt.getHours();
          return startedHour >= hour && startedHour < hour + 6 ? sum + log.duration_minutes : sum;
        }, 0);
        return { id: `${key}-${hour}`, dayIndex, hour, minutes };
      });
    });
    const max = Math.max(1, ...cells.map((cell) => cell.minutes));
    return cells.map((cell) => ({ ...cell, level: Math.ceil((cell.minutes / max) * 5) }));
  }, [weekDays, weeklyLogs]);

  async function handleDelete(id: number) {
    await deleteWorkLog(id);
    await loadData();
  }

  return (
    <section className="worklogs-page">
      <header className="worklogs-toolbar">
        <div>
          <p className="worklogs-eyebrow">Effort & Progress</p>
          <h1>工数・進捗</h1>
        </div>
        <div className="worklogs-toolbar__actions">
          <button type="button" className="worklogs-range-button">{weekLabel}</button>
          <div className="worklogs-week-switch">
            <button type="button" onClick={() => setWeekOffset((current) => current - 1)} aria-label="前の週">‹</button>
            <button type="button" onClick={() => setWeekOffset((current) => current + 1)} aria-label="次の週">›</button>
          </div>
          <button type="button" className="worklogs-tab-button">週</button>
          <button type="button" className="worklogs-tab-button worklogs-tab-button--active">月</button>
          <button type="button" className="worklogs-export-button">⇩ エクスポート</button>
        </div>
      </header>

      {isLoading && <p className="worklogs-state">読み込み中...</p>}
      {errorMessage && <p className="worklogs-state worklogs-state--error">{errorMessage}</p>}

      {!isLoading && (
        <>
          <section className="worklogs-panel worklogs-summary-panel">
            <h2>今週のサマリー</h2>
            <div className="worklogs-kpi-grid">
              <KpiCard icon="◷" label="総工数" value={formatMinutes(totalMinutes)} note={plannedMinutes > 0 ? `計画: ${formatMinutes(plannedMinutes)}` : "計画データなし"} progress={workProgress ?? undefined} />
              <KpiCard icon="✦" label="集中時間" value={formatMinutes(focusMinutes)} note={`総工数の ${totalMinutes ? Math.round((focusMinutes / totalMinutes) * 100) : 0}%`} progress={focusProgress ?? undefined} tone="purple" />
              <KpiCard icon="✓" label="完了タスク" value={`${weeklyCompletedTasks}件`} note={taskTargetCount > 0 ? `実績あり: ${taskTargetCount}件` : "実績タスクなし"} progress={taskProgress ?? undefined} tone="green" />
              <KpiCard icon="↗" label="生産性スコア" value={plannedMinutes > 0 || taskTargetCount > 0 ? `${productivityScore}%` : "-"} note={plannedMinutes > 0 || taskTargetCount > 0 ? (productivityScore >= 80 ? "良好" : "改善余地あり") : "計画・実績不足"} tone="blue" />
            </div>
          </section>

          <div className="worklogs-main-grid">
            <section className="worklogs-panel worklogs-chart-panel">
              <div className="worklogs-panel__header">
                <h2>工数の推移</h2>
                <span>日ごと</span>
              </div>
              <div className="worklogs-legend">
                <span><i className="legend-focus" />集中時間</span>
                <span><i className="legend-other" />その他の時間</span>
                <span><i className="legend-target" />計画工数</span>
              </div>
              <div className="worklogs-bar-chart">
                {[10, 8, 6, 4, 2, 0].map((hour) => (
                  <span key={hour} className="worklogs-chart-line" style={{ bottom: `${(hour / 10) * 100}%` }}>{hour}h</span>
                ))}
                {dailyTargetMinutes > 0 && <div className="worklogs-target-line" style={{ bottom: `${targetLineBottom}%` }} />}
                {dailyChart.map((item) => {
                  const total = item.focusMinutes + item.otherMinutes;
                  return (
                    <div className="worklogs-bar-item" key={item.key}>
                      <div className="worklogs-bar" title={`${item.label}: ${formatMinutes(total)}`}>
                        <i className="worklogs-bar__other" style={{ height: `${(item.otherMinutes / maxDailyMinutes) * 100}%` }} />
                        <i className="worklogs-bar__focus" style={{ height: `${(item.focusMinutes / maxDailyMinutes) * 100}%` }} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="worklogs-panel worklogs-project-panel">
              <h2>プロジェクト別 工数内訳</h2>
              <div className="worklogs-donut-layout">
                <div className="worklogs-donut" aria-label="プロジェクト別工数" style={{ background: projectDonutGradient }}>
                  <div>
                    <span>合計</span>
                    <strong>{formatMinutes(totalMinutes)}</strong>
                  </div>
                </div>
                <div className="worklogs-project-list">
                  {(projectSummary.length ? projectSummary.slice(0, 5) : [{ id: "empty", label: "まだ実績がありません", minutes: 0, count: 0 }]).map((item, index) => {
                    const percent = totalMinutes ? Math.round((item.minutes / totalMinutes) * 100) : 0;
                    return (
                      <div className="worklogs-project-row" key={item.id}>
                        <i className={`worklogs-dot worklogs-dot--${PROJECT_TONES[index] ?? "gray"}`} />
                        <strong>{item.label}</strong>
                        <span>{formatMinutes(item.minutes)}</span>
                        <small>{percent}%</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <div className="worklogs-bottom-grid">
            <section className="worklogs-panel worklogs-ranking-panel">
              <div className="worklogs-panel__header">
                <h2>タスク別 工数ランキング</h2>
                <span>工数順</span>
              </div>
              <div className="worklogs-ranking-list">
                {(taskSummary.length ? taskSummary.slice(0, 5) : [{ id: "empty", label: "まだ実績がありません", minutes: 0, count: 0 }]).map((item, index) => {
                  const percent = totalMinutes ? (item.minutes / totalMinutes) * 100 : 0;
                  return (
                    <div className="worklogs-ranking-row" key={item.id}>
                      <span className={index < 3 ? "worklogs-rank worklogs-rank--top" : "worklogs-rank"}>{index + 1}</span>
                      <strong>{item.label}</strong>
                      <div className="worklogs-mini-progress"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
                      <span>{formatMinutes(item.minutes)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="worklogs-panel worklogs-heatmap-panel">
              <h2>時間帯別の集中度</h2>
              <div className="worklogs-heatmap">
                <div className="worklogs-heatmap__hours"><span>0時</span><span>6時</span><span>12時</span><span>18時</span></div>
                <div className="worklogs-heatmap__grid">
                  {focusHeatmap.map((cell) => (
                    <i key={cell.id} className={`worklogs-heat worklogs-heat--${cell.level}`} title={`${DAY_LABELS[cell.dayIndex]} ${cell.hour}時: ${formatMinutes(cell.minutes)}`} />
                  ))}
                </div>
                <div className="worklogs-heatmap__days">{DAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div>
              </div>
            </section>

            <section className="worklogs-panel worklogs-goal-panel">
              <h2>計画に対する進捗</h2>
              <div className="worklogs-goal-row"><span>週の計画工数</span><strong>{formatMinutes(totalMinutes)} / {plannedMinutes > 0 ? formatMinutes(plannedMinutes) : "計画なし"}</strong><div className="worklogs-progress"><i style={{ width: `${Math.min(100, workProgress ?? 0)}%` }} /></div></div>
              <div className="worklogs-goal-row"><span>集中時間の計画</span><strong>{formatMinutes(focusMinutes)} / {focusTargetMinutes > 0 ? formatMinutes(focusTargetMinutes) : "計画なし"}</strong><div className="worklogs-progress worklogs-progress--green"><i style={{ width: `${Math.min(100, focusProgress ?? 0)}%` }} /></div></div>
              <div className="worklogs-goal-row"><span>実績タスクの完了率</span><strong>{weeklyCompletedTasks}件 / {taskTargetCount > 0 ? `${taskTargetCount}件` : "対象なし"}</strong><div className="worklogs-progress worklogs-progress--orange"><i style={{ width: `${Math.min(100, taskProgress ?? 0)}%` }} /></div></div>
            </section>
          </div>

          <section className="worklogs-panel worklogs-table-panel">
            <div className="worklogs-panel__header">
              <h2>作業ログ</h2>
              <span>{totalLogs}件</span>
            </div>
            {weeklyLogs.length === 0 ? (
              <p className="worklogs-empty">この週の作業ログはまだありません。</p>
            ) : (
              <div className="worklogs-table-wrap">
                <table className="worklogs-table">
                  <thead>
                    <tr>
                      <th>開始</th>
                      <th>タスク</th>
                      <th>プロジェクト</th>
                      <th>実績</th>
                      <th>計画</th>
                      <th>差分</th>
                      <th>メモ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyLogs.map((log) => {
                      const task = log.task_id ? taskById.get(log.task_id) : null;
                      const project = task ? projectById.get(task.project_id) : null;

                      return (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.started_at)}</td>
                          <td>{task?.title ?? "-"}</td>
                          <td>{project?.title ?? "-"}</td>
                          <td>{formatMinutes(log.duration_minutes)}</td>
                          <td>{log.planned_minutes ? formatMinutes(log.planned_minutes) : "-"}</td>
                          <td>{formatDifferenceMinutes(log.difference_minutes)}</td>
                          <td>{log.memo || "-"}</td>
                          <td><button type="button" onClick={() => handleDelete(log.id)}>削除</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="worklogs-hint">💡 ヒント：集中できる時間帯に重要タスクを置くと、計画のズレを減らしやすくなります。</p>
        </>
      )}
    </section>
  );
}
