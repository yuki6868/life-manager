from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.goal import Goal
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
)


@router.get("/", response_model=list[ProjectResponse])
async def get_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).order_by(Project.id.desc())
    )
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.post("/", response_model=ProjectResponse)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    goal_result = await db.execute(
        select(Goal).where(Goal.id == payload.goal_id)
    )
    goal = goal_result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    project = Project(
        goal_id=payload.goal_id,
        title=payload.title,
        description=payload.description,
        estimated_minutes=payload.estimated_minutes,
    )

    db.add(project)
    await db.commit()
    await db.refresh(project)

    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    goal_result = await db.execute(
        select(Goal).where(Goal.id == payload.goal_id)
    )
    goal = goal_result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    project.goal_id = payload.goal_id
    project.title = payload.title
    project.description = payload.description
    project.estimated_minutes = payload.estimated_minutes
    project.actual_minutes = payload.actual_minutes
    project.status = payload.status

    await db.commit()
    await db.refresh(project)

    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()

    return {"message": "Project deleted"}