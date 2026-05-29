from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.project import Project
from app.models.project_reflection import ProjectReflection
from app.schemas.project_reflection import (
    ProjectReflectionCreate,
    ProjectReflectionResponse,
    ProjectReflectionUpdate,
)

router = APIRouter(
    prefix="/project-reflections",
    tags=["Project Reflections"],
)


def apply_project_reflection_payload(
    reflection: ProjectReflection,
    payload: ProjectReflectionCreate | ProjectReflectionUpdate,
) -> None:
    reflection.project_id = payload.project_id
    reflection.estimated_minutes = payload.estimated_minutes
    reflection.actual_minutes = payload.actual_minutes
    reflection.difference_minutes = payload.difference_minutes
    reflection.difference_reason = payload.difference_reason
    reflection.next_improvement = payload.next_improvement


async def ensure_project_exists(project_id: int, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.get("/", response_model=list[ProjectReflectionResponse])
async def get_project_reflections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProjectReflection).order_by(ProjectReflection.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/by-project/{project_id}", response_model=ProjectReflectionResponse)
async def get_project_reflection_by_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectReflection).where(ProjectReflection.project_id == project_id)
    )
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Project reflection not found")

    return reflection


@router.get("/{reflection_id}", response_model=ProjectReflectionResponse)
async def get_project_reflection(
    reflection_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectReflection).where(ProjectReflection.id == reflection_id)
    )
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Project reflection not found")

    return reflection


@router.post("/", response_model=ProjectReflectionResponse)
async def create_project_reflection(
    payload: ProjectReflectionCreate,
    db: AsyncSession = Depends(get_db),
):
    project = await ensure_project_exists(payload.project_id, db)

    reflection = ProjectReflection(
        project_id=payload.project_id,
        estimated_minutes=payload.estimated_minutes,
        actual_minutes=payload.actual_minutes,
        difference_minutes=payload.difference_minutes,
        difference_reason=payload.difference_reason,
        next_improvement=payload.next_improvement,
    )
    project.status = "completed"

    db.add(reflection)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Reflection for this project already exists",
        ) from exc

    await db.refresh(reflection)
    return reflection


@router.put("/{reflection_id}", response_model=ProjectReflectionResponse)
async def update_project_reflection(
    reflection_id: int,
    payload: ProjectReflectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectReflection).where(ProjectReflection.id == reflection_id)
    )
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Project reflection not found")

    project = await ensure_project_exists(payload.project_id, db)
    apply_project_reflection_payload(reflection, payload)
    project.status = "completed"

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Reflection for this project already exists",
        ) from exc

    await db.refresh(reflection)
    return reflection


@router.delete("/{reflection_id}")
async def delete_project_reflection(
    reflection_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectReflection).where(ProjectReflection.id == reflection_id)
    )
    reflection = result.scalar_one_or_none()

    if reflection is None:
        raise HTTPException(status_code=404, detail="Project reflection not found")

    await db.delete(reflection)
    await db.commit()

    return {"message": "Project reflection deleted"}
