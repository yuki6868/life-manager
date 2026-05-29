import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
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


def tokenize(text: str | None) -> list[str]:
    if not text:
        return []

    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text)]
    return [token for token in tokens if len(token) >= 2]


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
            Task.estimated_minutes,
            actual_minutes_expr.label("actual_minutes"),
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .select_from(Task)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(WorkLog, WorkLog.task_id == Task.id)
        .group_by(
            Task.id,
            Task.project_id,
            Project.title,
            Task.title,
            Task.description,
            Task.estimated_minutes,
            Task.actual_minutes,
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

    result = await db.execute(
        select(
            Task.id,
            Task.project_id,
            Project.title.label("project_title"),
            Task.title,
            Task.estimated_minutes,
            actual_minutes_expr.label("actual_minutes"),
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .select_from(Task)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(WorkLog, WorkLog.task_id == Task.id)
        .group_by(
            Task.id,
            Task.project_id,
            Project.title,
            Task.title,
            Task.estimated_minutes,
            Task.actual_minutes,
            Task.priority,
            Task.energy_level,
            Task.status,
        )
        .having(actual_minutes_expr > 0)
        .order_by(Task.id.desc())
    )

    rows = result.all()
    accuracy_tasks = [
        EstimationAccuracyTaskResponse(
            id=row.id,
            project_id=row.project_id,
            project_title=row.project_title,
            title=row.title,
            estimated_minutes=int(row.estimated_minutes or 0),
            actual_minutes=int(row.actual_minutes or 0),
            difference_minutes=int(row.actual_minutes or 0) - int(row.estimated_minutes or 0),
            priority=row.priority,
            energy_level=row.energy_level,
            status=row.status,
        )
        for row in rows
    ]

    total_task_count = len(accuracy_tasks)
    if total_task_count == 0:
        return EstimationAccuracySummaryResponse(
            total_task_count=0,
            average_estimated_minutes=0,
            average_actual_minutes=0,
            average_difference_minutes=0,
            underestimation_rate=0.0,
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
        1 for task in accuracy_tasks if task.actual_minutes > task.estimated_minutes
    )
    underestimation_rate = round((underestimation_count / total_task_count) * 100, 1)

    tasks_by_type: dict[str, list[EstimationAccuracyTaskResponse]] = {}
    for task in accuracy_tasks:
        tasks_by_type.setdefault(task.priority, []).append(task)

    task_type_trends = []
    for task_type, tasks in tasks_by_type.items():
        task_count = len(tasks)
        underestimated_count = sum(
            1 for task in tasks if task.actual_minutes > task.estimated_minutes
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
                underestimation_rate=round((underestimated_count / task_count) * 100, 1),
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
        task_type_trends=task_type_trends,
        recent_tasks=accuracy_tasks[:limit],
    )

