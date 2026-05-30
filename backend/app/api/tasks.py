from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

from app.models.goal import Goal
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskResponse, TaskStatusUpdate, TaskUpdate, UrgentTaskCreate

router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
)

TASK_STATUSES = {"todo", "in_progress", "completed", "paused", "cancelled"}
TASK_TYPES = {"normal", "urgent"}
URGENT_INBOX_GOAL_TITLE = "受信箱"
URGENT_INBOX_PROJECT_TITLE = "緊急タスク"


def validate_task_status(status: str) -> None:
    if status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid task status")


def validate_task_type(task_type: str) -> None:
    if task_type not in TASK_TYPES:
        raise HTTPException(status_code=400, detail="Invalid task type")


async def get_or_create_urgent_project(db: AsyncSession) -> Project:
    """project_id 未指定の緊急タスクを受ける既定プロジェクトを用意する。"""
    project_result = await db.execute(
        select(Project).where(Project.title == URGENT_INBOX_PROJECT_TITLE)
    )
    project = project_result.scalar_one_or_none()

    if project is not None:
        return project

    user_result = await db.execute(select(User).order_by(User.id.asc()).limit(1))
    user = user_result.scalar_one_or_none()

    if user is None:
        user = User(name="Default User", email=None)
        db.add(user)
        await db.flush()

    goal_result = await db.execute(
        select(Goal).where(Goal.title == URGENT_INBOX_GOAL_TITLE).limit(1)
    )
    goal = goal_result.scalar_one_or_none()

    if goal is None:
        goal = Goal(
            user_id=user.id,
            title=URGENT_INBOX_GOAL_TITLE,
            description="プロジェクト未指定のタスクを一時的に受ける場所",
            status="active",
        )
        db.add(goal)
        await db.flush()

    project = Project(
        goal_id=goal.id,
        title=URGENT_INBOX_PROJECT_TITLE,
        description="突然入ってきた緊急タスクを一時的に管理するプロジェクト",
        estimated_minutes=0,
        actual_minutes=0,
        status="active",
    )
    db.add(project)
    await db.flush()

    return project


@router.get("/", response_model=list[TaskResponse])
async def get_tasks(
    task_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Task)

    if task_type is not None:
        validate_task_type(task_type)
        query = query.where(Task.task_type == task_type)

    result = await db.execute(
        query.order_by(Task.id.desc())
    )
    return result.scalars().all()


@router.post("/urgent", response_model=TaskResponse)
async def create_urgent_task(
    payload: UrgentTaskCreate,
    db: AsyncSession = Depends(get_db),
):
    validate_task_status(payload.status)

    if payload.project_id is None:
        project = await get_or_create_urgent_project(db)
    else:
        project_result = await db.execute(
            select(Project).where(Project.id == payload.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

    task = Task(
        project_id=project.id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        estimated_minutes=payload.estimated_minutes,
        energy_level=payload.energy_level,
        status=payload.status,
        task_type="urgent",
        urgency=payload.urgency,
        importance=payload.importance,
        occurred_at=payload.occurred_at or datetime.utcnow(),
        interruption_reason=payload.interruption_reason,
    )

    db.add(task)
    await db.commit()
    await db.refresh(task)

    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return task


@router.post("/", response_model=TaskResponse)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
):
    project_result = await db.execute(
        select(Project).where(Project.id == payload.project_id)
    )
    project = project_result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    task = Task(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        estimated_minutes=payload.estimated_minutes,
        energy_level=payload.energy_level,
        task_type="normal",
    )

    db.add(task)
    await db.commit()
    await db.refresh(task)

    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    project_result = await db.execute(
        select(Project).where(Project.id == payload.project_id)
    )
    project = project_result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    task.project_id = payload.project_id
    task.title = payload.title
    task.description = payload.description
    task.priority = payload.priority
    task.estimated_minutes = payload.estimated_minutes
    task.actual_minutes = payload.actual_minutes
    task.energy_level = payload.energy_level
    validate_task_status(payload.status)
    validate_task_type(payload.task_type)

    task.status = payload.status
    task.task_type = payload.task_type
    task.urgency = payload.urgency
    task.importance = payload.importance
    task.occurred_at = payload.occurred_at
    task.interruption_reason = payload.interruption_reason

    await db.commit()
    await db.refresh(task)

    return task


@router.patch("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    validate_task_status(payload.status)

    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = payload.status

    await db.commit()
    await db.refresh(task)

    return task


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()

    return {"message": "Task deleted"}