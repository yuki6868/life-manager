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
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) return `${restMinutes}分`;
  if (restMinutes === 0) return `${hours}時間`;
  return `${hours}時間${restMinutes}分`;
}

function formatDifferenceMinutes(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  if (value === 0) return "予定どおり";
  return value > 0 ? `+${value}分` : `${value}分`;
}

type SummaryItem = {
  id: string;
  label: string;
  minutes: number;
  count: number;
};

export default function WorkLogsPage() {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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
      setErrorMessage("実績一覧の取得に失敗しました。");
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

  const dailySummary = useMemo<SummaryItem[]>(() => {
    const map = new Map<string, SummaryItem>();

    for (const log of workLogs) {
      const date = formatDate(log.started_at);
      const current = map.get(date) ?? {
        id: date,
        label: date,
        minutes: 0,
        count: 0,
      };

      current.minutes += log.duration_minutes;
      current.count += 1;
      map.set(date, current);
    }

    return [...map.values()].sort((a, b) => b.label.localeCompare(a.label));
  }, [workLogs]);

  const taskSummary = useMemo<SummaryItem[]>(() => {
    const map = new Map<string, SummaryItem>();

    for (const log of workLogs) {
      const task = log.task_id ? taskById.get(log.task_id) : null;
      const id = log.task_id ? String(log.task_id) : "no-task";
      const label = task?.title ?? "タスク未設定";
      const current = map.get(id) ?? {
        id,
        label,
        minutes: 0,
        count: 0,
      };

      current.minutes += log.duration_minutes;
      current.count += 1;
      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [taskById, workLogs]);

  const projectSummary = useMemo<SummaryItem[]>(() => {
    const map = new Map<string, SummaryItem>();

    for (const log of workLogs) {
      const task = log.task_id ? taskById.get(log.task_id) : null;
      const project = task ? projectById.get(task.project_id) : null;
      const id = project ? String(project.id) : "no-project";
      const label = project?.title ?? "プロジェクト未設定";
      const current = map.get(id) ?? {
        id,
        label,
        minutes: 0,
        count: 0,
      };

      current.minutes += log.duration_minutes;
      current.count += 1;
      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [projectById, taskById, workLogs]);

  async function handleDelete(id: number) {
    await deleteWorkLog(id);
    await loadData();
  }

  function renderSummary(title: string, items: SummaryItem[]) {
    return (
      <section
        style={{
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          background: "#fff",
        }}
      >
        <h2>{title}</h2>

        {items.length === 0 ? (
          <p>まだ実績はありません。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                  項目
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>
                  件数
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>
                  実績時間
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{item.label}</td>
                  <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                    {item.count}件
                  </td>
                  <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                    {formatMinutes(item.minutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  return (
    <section
      style={{
        padding: "32px",
        borderTop: "1px solid #ddd",
      }}
    >
      <h1>実績一覧</h1>
      <p style={{ color: "#666" }}>
        作業ログを日別・タスク別・プロジェクト別に確認します。
      </p>

      {isLoading && <p>読み込み中...</p>}
      {errorMessage && <p style={{ color: "#b00020" }}>{errorMessage}</p>}

      {!isLoading && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            {renderSummary("日別実績", dailySummary)}
            {renderSummary("タスク別実績", taskSummary)}
            {renderSummary("プロジェクト別実績", projectSummary)}
          </div>

          <section
            style={{
              padding: "20px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              background: "#fff",
            }}
          >
            <h2>作業ログ</h2>

            {workLogs.length === 0 ? (
              <p>まだ作業ログはありません。</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      開始
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      タスク
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      プロジェクト
                    </th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      実績
                    </th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      計画
                    </th>
                    <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      差分
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px" }}>
                      メモ
                    </th>
                    <th style={{ borderBottom: "1px solid #ddd", padding: "8px" }} />
                  </tr>
                </thead>
                <tbody>
                  {workLogs.map((log) => {
                    const task = log.task_id ? taskById.get(log.task_id) : null;
                    const project = task ? projectById.get(task.project_id) : null;

                    return (
                      <tr key={log.id}>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          {formatDateTime(log.started_at)}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          {task?.title ?? "-"}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          {project?.title ?? "-"}
                        </td>
                        <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                          {formatMinutes(log.duration_minutes)}
                        </td>
                        <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                          {log.planned_minutes ? formatMinutes(log.planned_minutes) : "-"}
                        </td>
                        <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                          {formatDifferenceMinutes(log.difference_minutes)}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                          {log.memo || "-"}
                        </td>
                        <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "8px" }}>
                          <button type="button" onClick={() => handleDelete(log.id)}>
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}
