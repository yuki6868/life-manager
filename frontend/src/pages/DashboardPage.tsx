import { useEffect, useMemo, useState } from "react";
import { fetchCalendarEvents } from "../api/calendarEvents";
import type { CalendarEvent } from "../api/calendarEvents";
import { fetchTodaySummary } from "../api/dashboard";
import type { TodaySummary } from "../api/dashboard";
import { fetchEstimationAccuracySummary } from "../api/estimations";
import type { EstimationAccuracySummary } from "../api/estimations";
import { fetchProjects } from "../api/projects";
import type { Project } from "../api/projects";
import { fetchTasks } from "../api/tasks";
import type { Task } from "../api/tasks";

function toDateKey(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatTime(dateText: string) {
  return new Date(dateText).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) return `${restMinutes}分`;
  if (restMinutes === 0) return `${hours}時間`;
  return `${hours}時間${restMinutes}分`;
}

function getEventMinutes(event: CalendarEvent) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function isIncompleteEvent(event: CalendarEvent) {
  return event.status !== "completed" && event.status !== "cancelled";
}

function isInProgressTask(task: Task) {
  return ["in_progress", "doing", "active"].includes(task.status);
}

function getProjectProgressRate(project: Project, estimatedMinutes: number) {
  if (estimatedMinutes <= 0) return 0;
  return Math.min(
    100,
    Math.round((project.actual_minutes / estimatedMinutes) * 100),
  );
}

function getRemainingMinutes(project: Project, estimatedMinutes: number) {
  return Math.max(0, estimatedMinutes - project.actual_minutes);
}

function getEffectiveProjectEstimatedMinutes(
  project: Project,
  plannedMinutes: number,
  taskEstimatedMinutes: number,
) {
  if (project.estimated_minutes > 0) return project.estimated_minutes;
  if (plannedMinutes > 0) return plannedMinutes;
  return taskEstimatedMinutes;
}

function isVisibleProject(project: Project) {
  return !["completed", "cancelled", "archived"].includes(project.status);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "未着手",
    active: "進行中",
    in_progress: "進行中",
    doing: "進行中",
    completed: "完了",
    cancelled: "キャンセル",
    archived: "アーカイブ",
  };

  return labels[status] ?? status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    high: "高優先度",
    medium: "中優先度",
    low: "低優先度",
  };

  return labels[priority] ?? priority;
}

function formatSignedMinutes(minutes: number) {
  if (minutes > 0) return `+${formatMinutes(minutes)}`;
  if (minutes < 0) return `-${formatMinutes(Math.abs(minutes))}`;
  return "差分なし";
}

function estimationJudgementLabel(judgement: string) {
  const labels: Record<string, string> = {
    underestimated: "過小見積",
    accurate: "適正",
    overestimated: "過大見積",
    unknown: "判定不可",
  };

  return labels[judgement] ?? judgement;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [estimationAccuracy, setEstimationAccuracy] =
    useState<EstimationAccuracySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [summaryData, eventData, projectData, taskData, accuracyData] =
        await Promise.all([
          fetchTodaySummary(),
          fetchCalendarEvents(),
          fetchProjects(),
          fetchTasks(),
          fetchEstimationAccuracySummary(),
        ]);

      setSummary(summaryData);
      setCalendarEvents(eventData);
      setProjects(projectData);
      setTasks(taskData);
      setEstimationAccuracy(accuracyData);
    } catch (error) {
      console.error(error);
      setErrorMessage("ダッシュボードの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const todayKey = toDateKey(new Date());

  const todayEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => event.status !== "cancelled")
      .filter((event) => event.start_time.slice(0, 10) === todayKey)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [calendarEvents, todayKey]);

  const incompleteEvents = useMemo(() => {
    return todayEvents.filter(isIncompleteEvent);
  }, [todayEvents]);

  const inProgressTasks = useMemo(() => {
    return tasks
      .filter(isInProgressTask)
      .sort((a, b) => b.actual_minutes - a.actual_minutes);
  }, [tasks]);

  const plannedMinutesByProjectId = useMemo(() => {
    const taskProjectIds = tasks.reduce<Record<number, number>>((acc, task) => {
      acc[task.id] = task.project_id;
      return acc;
    }, {});

    const projectIdsByTaskTitle = tasks.reduce<Record<string, Set<number>>>(
      (acc, task) => {
        const key = task.title.trim();
        if (!key) return acc;

        acc[key] = acc[key] ?? new Set<number>();
        acc[key].add(task.project_id);
        return acc;
      },
      {},
    );

    return todayEvents.reduce<Record<number, number>>((acc, event) => {
      let projectId: number | undefined;

      if (event.task_id != null) {
        projectId = taskProjectIds[event.task_id];
      }

      if (projectId == null) {
        const matchedProjectIds = projectIdsByTaskTitle[event.title.trim()];
        if (matchedProjectIds?.size === 1) {
          projectId = [...matchedProjectIds][0];
        }
      }

      if (projectId == null) return acc;

      acc[projectId] = (acc[projectId] ?? 0) + getEventMinutes(event);
      return acc;
    }, {});
  }, [tasks, todayEvents]);

  const taskEstimatedMinutesByProjectId = useMemo(() => {
    return tasks.reduce<Record<number, number>>((acc, task) => {
      acc[task.project_id] =
        (acc[task.project_id] ?? 0) + Math.max(0, task.estimated_minutes);
      return acc;
    }, {});
  }, [tasks]);

  const progressProjects = useMemo(() => {
    return projects.filter(isVisibleProject).sort((a, b) => {
      const aEstimatedMinutes = getEffectiveProjectEstimatedMinutes(
        a,
        plannedMinutesByProjectId[a.id] ?? 0,
        taskEstimatedMinutesByProjectId[a.id] ?? 0,
      );
      const bEstimatedMinutes = getEffectiveProjectEstimatedMinutes(
        b,
        plannedMinutesByProjectId[b.id] ?? 0,
        taskEstimatedMinutesByProjectId[b.id] ?? 0,
      );

      return (
        getProjectProgressRate(b, bEstimatedMinutes) -
        getProjectProgressRate(a, aEstimatedMinutes)
      );
    });
  }, [plannedMinutesByProjectId, projects, taskEstimatedMinutesByProjectId]);

  return (
    <section style={{ padding: "32px", borderTop: "1px solid #ddd" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <h1>ダッシュボード</h1>
          <p style={{ color: "#666" }}>
            今日の予定、実績、進行中タスク、未完了予定をまとめて確認します。
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          style={{ height: "40px" }}
        >
          再読み込み
        </button>
      </div>

      {isLoading && <p>読み込み中...</p>}
      {errorMessage && <p style={{ color: "#b00020" }}>{errorMessage}</p>}

      {!isLoading && !errorMessage && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "16px",
              margin: "24px 0",
            }}
          >
            <SummaryCard
              label="今日の予定時間"
              value={formatMinutes(summary?.planned_minutes ?? 0)}
            />
            <SummaryCard
              label="今日の実績時間"
              value={formatMinutes(summary?.actual_minutes ?? 0)}
            />
            <SummaryCard
              label="達成率"
              value={`${summary?.achievement_rate ?? 0}%`}
            />
            <SummaryCard
              label="未完了予定"
              value={`${summary?.incomplete_events_count ?? incompleteEvents.length}件`}
            />
            <SummaryCard
              label="過小見積率"
              value={`${estimationAccuracy?.underestimation_rate ?? 0}%`}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            <DashboardPanel title="今日の予定">
              {todayEvents.length === 0 ? (
                <p>今日の予定はまだありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {todayEvents.map((event) => (
                    <div key={event.id} style={itemStyle}>
                      <strong>{event.title}</strong>
                      <p style={mutedTextStyle}>
                        {formatTime(event.start_time)} -{" "}
                        {formatTime(event.end_time)} /{" "}
                        {formatMinutes(getEventMinutes(event))}
                      </p>
                      <p style={mutedTextStyle}>
                        状態: {statusLabel(event.status)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="プロジェクト進捗">
              {progressProjects.length === 0 ? (
                <p>表示できるプロジェクトはありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {progressProjects.map((project) => {
                    const estimatedMinutes = getEffectiveProjectEstimatedMinutes(
                      project,
                      plannedMinutesByProjectId[project.id] ?? 0,
                      taskEstimatedMinutesByProjectId[project.id] ?? 0,
                    );
                    const progressRate = getProjectProgressRate(
                      project,
                      estimatedMinutes,
                    );
                    const remainingMinutes = getRemainingMinutes(
                      project,
                      estimatedMinutes,
                    );

                    return (
                      <div key={project.id} style={itemStyle}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <strong>{project.title}</strong>
                          <span style={{ color: "#2563eb", fontWeight: 700 }}>
                            {progressRate}%
                          </span>
                        </div>

                        <div
                          aria-label={`${project.title}の進捗率 ${progressRate}%`}
                          style={{
                            height: "10px",
                            background: "#e5e7eb",
                            borderRadius: "999px",
                            overflow: "hidden",
                            marginTop: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: `${progressRate}%`,
                              height: "100%",
                              background: "#2563eb",
                            }}
                          />
                        </div>

                        <p style={mutedTextStyle}>
                          予想 {formatMinutes(estimatedMinutes)} / 実績{" "}
                          {formatMinutes(project.actual_minutes)} / 残り{" "}
                          {formatMinutes(remainingMinutes)}
                        </p>
                        <p style={mutedTextStyle}>
                          状態: {statusLabel(project.status)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="見積もり精度">
              {!estimationAccuracy ||
              estimationAccuracy.total_task_count === 0 ? (
                <p>実績があるタスクがまだありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={itemStyle}>
                    <strong>予定時間と実績時間の差分</strong>
                    <p style={mutedTextStyle}>
                      平均予定{" "}
                      {formatMinutes(
                        estimationAccuracy.average_estimated_minutes,
                      )}{" "}
                      / 平均実績{" "}
                      {formatMinutes(estimationAccuracy.average_actual_minutes)}{" "}
                      / 差分{" "}
                      {formatSignedMinutes(
                        estimationAccuracy.average_difference_minutes,
                      )}
                    </p>
                    <p style={mutedTextStyle}>
                      判定基準: ±
                      {Math.round(
                        estimationAccuracy.estimation_threshold_rate * 100,
                      )}
                      %以内は適正
                    </p>
                    <p style={mutedTextStyle}>
                      過小見積率: {estimationAccuracy.underestimation_rate}% /
                      適正率: {estimationAccuracy.accurate_estimation_rate}% /
                      過大見積率: {estimationAccuracy.overestimation_rate}%
                      （対象 {estimationAccuracy.total_task_count}件）
                    </p>
                  </div>

                  <div style={itemStyle}>
                    <strong>タスク種別ごとの傾向</strong>
                    {estimationAccuracy.task_type_trends.length === 0 ? (
                      <p style={mutedTextStyle}>
                        傾向を表示できるデータがありません。
                      </p>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          marginTop: "8px",
                        }}
                      >
                        {estimationAccuracy.task_type_trends.map((trend) => (
                          <div key={trend.task_type}>
                            <p style={{ margin: 0 }}>
                              {priorityLabel(trend.task_type)}: 過小 {trend.underestimation_rate}% /
                              適正 {trend.accurate_estimation_rate}% / 過大 {trend.overestimation_rate}% /
                              平均差分 {formatSignedMinutes(
                                trend.average_difference_minutes,
                              )}
                            </p>
                            <p style={mutedTextStyle}>
                              {trend.task_count}件 / 平均予定{" "}
                              {formatMinutes(trend.average_estimated_minutes)} /
                              平均実績{" "}
                              {formatMinutes(trend.average_actual_minutes)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={itemStyle}>
                    <strong>最近の見積もり差分</strong>
                    <div
                      style={{ display: "grid", gap: "8px", marginTop: "8px" }}
                    >
                      {estimationAccuracy.recent_tasks.map((task) => (
                        <div key={task.id}>
                          <p style={{ margin: 0 }}>{task.title}</p>
                          <p style={mutedTextStyle}>
                            {task.project_title} / 予定{" "}
                            {formatMinutes(task.estimated_minutes)} / 実績{" "}
                            {formatMinutes(task.actual_minutes)} / 差分{" "}
                            {formatSignedMinutes(task.difference_minutes)} / 判定{" "}
                            {estimationJudgementLabel(task.estimation_judgement)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="進行中タスク">
              {inProgressTasks.length === 0 ? (
                <p>進行中タスクはありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {inProgressTasks.map((task) => (
                    <div key={task.id} style={itemStyle}>
                      <strong>{task.title}</strong>
                      <p style={mutedTextStyle}>
                        実績 {formatMinutes(task.actual_minutes)} / 見積{" "}
                        {formatMinutes(task.estimated_minutes)}
                      </p>
                      <p style={mutedTextStyle}>
                        優先度: {task.priority} / エネルギー:{" "}
                        {task.energy_level}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel title="未完了予定">
              {incompleteEvents.length === 0 ? (
                <p>今日の未完了予定はありません。</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {incompleteEvents.map((event) => (
                    <div key={event.id} style={itemStyle}>
                      <strong>{event.title}</strong>
                      <p style={mutedTextStyle}>
                        {formatTime(event.start_time)} -{" "}
                        {formatTime(event.end_time)}
                      </p>
                      <p style={mutedTextStyle}>
                        状態: {statusLabel(event.status)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardPanel>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "18px",
        border: "1px solid #ddd",
        borderRadius: "12px",
        background: "#fff",
      }}
    >
      <p style={{ margin: "0 0 8px", color: "#666", fontSize: "14px" }}>
        {label}
      </p>
      <strong style={{ fontSize: "24px" }}>{value}</strong>
    </div>
  );
}

function DashboardPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section
      style={{
        padding: "20px",
        border: "1px solid #ddd",
        borderRadius: "12px",
        background: "#fff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

const itemStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: "10px",
  padding: "12px",
  background: "#fafafa",
};

const mutedTextStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#666",
};
