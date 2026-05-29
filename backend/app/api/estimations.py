import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.calendar_event import CalendarEvent
from app.models.project import Project
from app.models.task import Task
from app.models.work_log import WorkLog
from app.schemas.estimation import (
    EstimateSuggestionResponse,
    EstimationAccuracySummaryResponse,
    EstimationAccuracyTaskResponse,
    EstimationAccuracyTrendResponse,
    SimilarTaskResponse,
)

router = APIRouter(
    prefix="/estimations",
    tags=["Estimations"],
)

TOKEN_PATTERN = re.compile(r"[\w\u3040-\u30ff\u3400-\u9fff]+")
ESTIMATION_THRESHOLD_RATE = 0.1


def judge_estimation(estimated_minutes: int, actual_minutes: int) -> str:
    if estimated_minutes <= 0:
        return "unknown"

    under_threshold = estimated_minutes * (1 + ESTIMATION_THRESHOLD_RATE)
    over_threshold = estimated_minutes * (1 - ESTIMATION_THRESHOLD_RATE)

    if actual_minutes > under_threshold:
        return "underestimated"
    if actual_minutes < over_threshold:
        return "overestimated"
    return "accurate"


def calculate_rate(count: int, total_count: int) -> float:
    if total_count <= 0:
        return 0.0
    return round((count / total_count) * 100, 1)


def tokenize(text: str | None) -> list[str]:
    if not text:
        return []

    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text)]
    return [token for token in tokens if len(token) >= 2]



def build_linked_calendar_plan_subquery():
    event_minutes_expr = (
        (
            func.strftime("%s", CalendarEvent.end_time)
            - func.strftime("%s", CalendarEvent.start_time)
        ) / 60
    )

    distinct_event_plans = (
        select(
            WorkLog.task_id.label("task_id"),
            WorkLog.calendar_event_id.label("calendar_event_id"),
            event_minutes_expr.label("planned_minutes"),
        )
        .join(CalendarEvent, CalendarEvent.id == WorkLog.calendar_event_id)
        .where(WorkLog.task_id.is_not(None))
        .where(WorkLog.calendar_event_id.is_not(None))
        .where(CalendarEvent.status != "cancelled")
        .group_by(
            WorkLog.task_id,
            WorkLog.calendar_event_id,
            CalendarEvent.start_time,
            CalendarEvent.end_time,
        )
        .subquery()
    )

    return (
        select(
            distinct_event_plans.c.task_id,
            func.coalesce(
                func.sum(distinct_event_plans.c.planned_minutes),
                0,
            ).label("planned_minutes"),
        )
        .group_by(distinct_event_plans.c.task_id)
        .subquery()
    )

def calculate_similarity_score(
    search_tokens: list[str],
    task_title: str,
    task_description: str | None,
    same_project: bool,
) -> float:
    if not search_tokens:
        return 0.0

    title_text = task_title.lower()
    description_text = (task_description or "").lower()

    score = 0.0
    for token in search_tokens:
        if token in title_text:
            score += 2.0
        elif token in description_text:
            score += 1.0

    if same_project:
        score += 0.5

    max_score = (len(search_tokens) * 2.0) + (0.5 if same_project else 0.0)
    if max_score == 0:
        return 0.0

    return round(min((score / max_score) * 100, 100), 1)


@router.get("/task-suggestion", response_model=EstimateSuggestionResponse)
async def get_task_estimate_suggestion(
    title: str = Query(..., min_length=1),
    description: str | None = None,
    project_id: int | None = None,
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 20))
    search_tokens = tokenize(f"{title} {description or ''}")

    actual_minutes_expr = func.coalesce(
        func.sum(WorkLog.duration_minutes),
        Task.actual_minutes,
        0,
    )
    planned_minutes_by_task = build_linked_calendar_plan_subquery()
    effective_estimated_minutes_expr = case(
        (Task.estimated_minutes > 0, Task.estimated_minutes),
        else_=func.coalesce(planned_minutes_by_task.c.planned_minutes, 0),
    )

    conditions = []
    for token in search_tokens:
        like_token = f"%{token}%"
        conditions.append(func.lower(Task.title).like(like_token))
        conditions.append(func.lower(func.coalesce(Task.description, "")).like(like_token))

    query = (
        select(
            Task.id,
            Task.project_id,
            Project.title.label("project_title"),
            Task.title,
            Task.description,
            effective_estimated_minutes_expr.label("estimated_minutes"),
            actual_minutes_expr.label("actual_minutes"),
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .select_from(Task)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(WorkLog, WorkLog.task_id == Task.id)
        .outerjoin(planned_minutes_by_task, planned_minutes_by_task.c.task_id == Task.id)
        .group_by(
            Task.id,
            Task.project_id,
            Project.title,
            Task.title,
            Task.description,
            Task.estimated_minutes,
            Task.actual_minutes,
            planned_minutes_by_task.c.planned_minutes,
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .having(actual_minutes_expr > 0)
    )

    if conditions:
        query = query.where(or_(*conditions))

    result = await db.execute(query)
    rows = result.all()

    similar_tasks = []
    for row in rows:
        similarity_score = calculate_similarity_score(
            search_tokens=search_tokens,
            task_title=row.title,
            task_description=row.description,
            same_project=project_id is not None and row.project_id == project_id,
        )
        similar_tasks.append(
            SimilarTaskResponse(
                id=row.id,
                project_id=row.project_id,
                project_title=row.project_title,
                title=row.title,
                description=row.description,
                estimated_minutes=row.estimated_minutes,
                actual_minutes=int(row.actual_minutes or 0),
                priority=row.priority,
                energy_level=row.energy_level,
                status=row.status,
                similarity_score=similarity_score,
            )
        )

    similar_tasks.sort(
        key=lambda task: (
            task.similarity_score,
            task.actual_minutes,
            task.id,
        ),
        reverse=True,
    )
    similar_tasks = similar_tasks[:limit]

    matched_task_count = len(similar_tasks)
    average_actual_minutes = 0
    if matched_task_count > 0:
        average_actual_minutes = round(
            sum(task.actual_minutes for task in similar_tasks) / matched_task_count
        )

    return EstimateSuggestionResponse(
        title=title,
        description=description,
        project_id=project_id,
        similar_tasks=similar_tasks,
        average_actual_minutes=average_actual_minutes,
        recommended_estimated_minutes=average_actual_minutes,
        matched_task_count=matched_task_count,
    )

@router.get("/accuracy-summary", response_model=EstimationAccuracySummaryResponse)
async def get_estimation_accuracy_summary(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 50))

    actual_minutes_expr = func.coalesce(
        func.sum(WorkLog.duration_minutes),
        Task.actual_minutes,
        0,
    )
    planned_minutes_by_task = build_linked_calendar_plan_subquery()
    effective_estimated_minutes_expr = case(
        (Task.estimated_minutes > 0, Task.estimated_minutes),
        else_=func.coalesce(planned_minutes_by_task.c.planned_minutes, 0),
    )

    result = await db.execute(
        select(
            Task.id,
            Task.project_id,
            Project.title.label("project_title"),
            Task.title,
            effective_estimated_minutes_expr.label("estimated_minutes"),
            actual_minutes_expr.label("actual_minutes"),
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .select_from(Task)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(WorkLog, WorkLog.task_id == Task.id)
        .outerjoin(planned_minutes_by_task, planned_minutes_by_task.c.task_id == Task.id)
        .group_by(
            Task.id,
            Task.project_id,
            Project.title,
            Task.title,
            Task.estimated_minutes,
            Task.actual_minutes,
            planned_minutes_by_task.c.planned_minutes,
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .having(actual_minutes_expr > 0)
        .order_by(Task.id.desc())
    )

    rows = result.all()
    accuracy_tasks = []
    for row in rows:
        estimated_minutes = int(row.estimated_minutes or 0)
        actual_minutes = int(row.actual_minutes or 0)
        accuracy_tasks.append(
            EstimationAccuracyTaskResponse(
                id=row.id,
                project_id=row.project_id,
                project_title=row.project_title,
                title=row.title,
                estimated_minutes=estimated_minutes,
                actual_minutes=actual_minutes,
                difference_minutes=actual_minutes - estimated_minutes,
                estimation_judgement=judge_estimation(
                    estimated_minutes=estimated_minutes,
                    actual_minutes=actual_minutes,
                ),
                priority=row.priority,
                energy_level=row.energy_level,
                status=row.status,
            )
        )

    total_task_count = len(accuracy_tasks)
    if total_task_count == 0:
        return EstimationAccuracySummaryResponse(
            total_task_count=0,
            average_estimated_minutes=0,
            average_actual_minutes=0,
            average_difference_minutes=0,
            underestimation_rate=0.0,
            accurate_estimation_rate=0.0,
            overestimation_rate=0.0,
            estimation_threshold_rate=ESTIMATION_THRESHOLD_RATE,
            task_type_trends=[],
            recent_tasks=[],
        )

    average_estimated_minutes = round(
        sum(task.estimated_minutes for task in accuracy_tasks) / total_task_count
    )
    average_actual_minutes = round(
        sum(task.actual_minutes for task in accuracy_tasks) / total_task_count
    )
    average_difference_minutes = round(
        sum(task.difference_minutes for task in accuracy_tasks) / total_task_count
    )
    underestimation_count = sum(
        1 for task in accuracy_tasks if task.estimation_judgement == "underestimated"
    )
    accurate_estimation_count = sum(
        1 for task in accuracy_tasks if task.estimation_judgement == "accurate"
    )
    overestimation_count = sum(
        1 for task in accuracy_tasks if task.estimation_judgement == "overestimated"
    )
    underestimation_rate = calculate_rate(underestimation_count, total_task_count)
    accurate_estimation_rate = calculate_rate(accurate_estimation_count, total_task_count)
    overestimation_rate = calculate_rate(overestimation_count, total_task_count)

    tasks_by_type: dict[str, list[EstimationAccuracyTaskResponse]] = {}
    for task in accuracy_tasks:
        tasks_by_type.setdefault(task.priority, []).append(task)

    task_type_trends = []
    for task_type, tasks in tasks_by_type.items():
        task_count = len(tasks)
        underestimated_count = sum(
            1 for task in tasks if task.estimation_judgement == "underestimated"
        )
        accurate_count = sum(
            1 for task in tasks if task.estimation_judgement == "accurate"
        )
        overestimated_count = sum(
            1 for task in tasks if task.estimation_judgement == "overestimated"
        )
        task_type_trends.append(
            EstimationAccuracyTrendResponse(
                task_type=task_type,
                task_count=task_count,
                average_estimated_minutes=round(
                    sum(task.estimated_minutes for task in tasks) / task_count
                ),
                average_actual_minutes=round(
                    sum(task.actual_minutes for task in tasks) / task_count
                ),
                average_difference_minutes=round(
                    sum(task.difference_minutes for task in tasks) / task_count
                ),
                underestimation_rate=calculate_rate(underestimated_count, task_count),
                accurate_estimation_rate=calculate_rate(accurate_count, task_count),
                overestimation_rate=calculate_rate(overestimated_count, task_count),
            )
        )

    task_type_trends.sort(
        key=lambda trend: (trend.underestimation_rate, trend.task_count),
        reverse=True,
    )

    return EstimationAccuracySummaryResponse(
        total_task_count=total_task_count,
        average_estimated_minutes=average_estimated_minutes,
        average_actual_minutes=average_actual_minutes,
        average_difference_minutes=average_difference_minutes,
        underestimation_rate=underestimation_rate,
        accurate_estimation_rate=accurate_estimation_rate,
        overestimation_rate=overestimation_rate,
        estimation_threshold_rate=ESTIMATION_THRESHOLD_RATE,
        task_type_trends=task_type_trends,
        recent_tasks=accuracy_tasks[:limit],
    )

